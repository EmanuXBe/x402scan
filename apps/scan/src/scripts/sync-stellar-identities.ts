/**
 * Resolve Stellar sellers to real organisations through SEP-1, and register
 * the ones that resolve.
 *
 *   pnpm --filter @x402scan/app sync:stellar-identities            # dry run
 *   pnpm --filter @x402scan/app sync:stellar-identities --write    # persist
 *
 * The registry-backed panels — Featured Services, Top Servers, merchants — join
 * on-chain sellers against services that self-registered a discovery document.
 * No Stellar service publishes one, so those panels read empty on Stellar no
 * matter how many payments settle. Stellar's equivalent already exists and
 * predates x402: an account declares `home_domain`, and that domain serves a
 * SEP-1 `stellar.toml` with the organisation behind it.
 *
 * This closes that loop. It reads sellers out of the transfers index, asks
 * Horizon and SEP-1 who they are, and writes the answers into the same
 * origin/resource/accepts shape the rest of the app already reads — so nothing
 * downstream needs to know Stellar resolves identity differently.
 *
 * Re-runnable: matching on the seller address, so a second run updates rather
 * than duplicating. Reads only public endpoints and needs no credentials.
 */
import { randomUUID } from 'crypto';

import { resolveStellarIdentity } from '../services/stellar/sep1';

import type { StellarServiceIdentity } from '../services/stellar/sep1';

// Imported at call time, not at module scope. Both db packages export TypeScript
// source directly (`"exports": "./src/index.ts"`), and a static named import of
// that through tsx fails to resolve the binding — the app only gets away with it
// because Next bundles the workspace. A dynamic import defers to the runtime
// resolver and works in both.
const scanDbClient = async () => (await import('@x402scan/scan-db')).scanDb;
const transfersDbClient = async () =>
  (await import('@x402scan/transfers-db')).transfersDb;

/** USDC SAC on pubnet — the asset every Stellar x402 payment settles in. */
const USDC_PUBNET_SAC =
  'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';

interface SellerRow {
  recipient: string;
  payments: bigint;
  median_amount: number;
}

async function stellarSellers(): Promise<SellerRow[]> {
  const transfersDb = await transfersDbClient();
  return await transfersDb.$queryRaw<SellerRow[]>`
    SELECT recipient,
           COUNT(*) AS payments,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)::float AS median_amount
    FROM "TransferEvent"
    WHERE chain = 'stellar'
    GROUP BY recipient
    ORDER BY COUNT(*) DESC
  `;
}

/**
 * Register one resolved service.
 *
 * `origin` is keyed on the domain rather than the address: one organisation can
 * receive at several accounts, and the panels group by origin.
 */
async function register(
  identity: StellarServiceIdentity,
  medianAmount: number
) {
  const scanDb = await scanDbClient();
  const origin = `https://${identity.homeDomain}`;
  const resourceUrl = identity.url ?? `${origin}/`;

  const originRow = await scanDb.resourceOrigin.upsert({
    where: { origin },
    create: {
      id: randomUUID(),
      origin,
      title: identity.name ?? identity.homeDomain,
      description: identity.description ?? null,
      favicon: identity.logo ?? null,
      updatedAt: new Date(),
    },
    update: {
      title: identity.name ?? identity.homeDomain,
      description: identity.description ?? null,
      favicon: identity.logo ?? null,
      updatedAt: new Date(),
    },
  });

  const existing = await scanDb.accepts.findFirst({
    where: { payTo: identity.address, network: 'stellar' },
    select: { id: true, resourceId: true },
  });

  if (existing) {
    await scanDb.accepts.update({
      where: { id: existing.id },
      data: {
        description: identity.description ?? identity.name ?? origin,
        maxAmountRequired: BigInt(Math.round(medianAmount)),
      },
    });
    return { origin, created: false };
  }

  const resource = await scanDb.resources.create({
    data: {
      id: randomUUID(),
      resource: resourceUrl,
      originId: originRow.id,
      type: 'http',
      // exact-v2 is the scheme version Stellar x402 uses, and it matches every
      // Stellar row already in the table.
      x402Version: 2,
      lastUpdated: new Date(),
    },
  });

  await scanDb.accepts.create({
    data: {
      id: randomUUID(),
      resourceId: resource.id,
      scheme: 'exact',
      network: 'stellar',
      // Observed median payment, in the 6-decimal base units the app stores.
      // It is what this seller actually charges, not a self-declared price.
      maxAmountRequired: BigInt(Math.round(medianAmount)),
      resource: resourceUrl,
      mimeType: 'application/json',
      payTo: identity.address,
      maxTimeoutSeconds: 60,
      asset: USDC_PUBNET_SAC,
      description: identity.description ?? identity.name ?? origin,
    },
  });

  return { origin, created: true };
}

async function main() {
  const write = process.argv.includes('--write');
  const sellers = await stellarSellers();

  console.log(
    `${sellers.length} Stellar sellers in the transfers index` +
      (write ? '' : ' — dry run, pass --write to persist')
  );

  let resolved = 0;
  let bidirectional = 0;

  for (const seller of sellers) {
    const identity = await resolveStellarIdentity(seller.recipient);
    const label = `${seller.recipient.slice(0, 10)}… ${String(seller.payments).padStart(5)} payments`;

    if (!identity) {
      console.log(`${label}  —  no home_domain, or no SEP-1 toml behind it`);
      continue;
    }

    resolved++;
    if (identity.verification === 'bidirectional') bidirectional++;

    const action = write
      ? await register(identity, seller.median_amount).then(r =>
          r.created ? 'registered' : 'updated'
        )
      : 'would register';

    console.log(
      `${label}  →  ${identity.name ?? identity.homeDomain} ` +
        `(${identity.verification}) [${action}]`
    );
  }

  // Both halves are the finding. The resolved count is what SEP-1 recovers that
  // x402 discovery cannot see at all; the unresolved remainder is how much of
  // the chain stays anonymous even with the right convention.
  console.log(
    `\n${resolved}/${sellers.length} sellers resolved, ` +
      `${bidirectional} of them bidirectionally verified. ` +
      `${sellers.length - resolved} publish no SEP-1 identity.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
