/**
 * Run a chain's sync adapter once, from the command line.
 *
 * The adapters normally only ever execute as trigger.dev scheduled tasks, which
 * means they cannot be exercised locally without a trigger.dev project. This
 * runner calls the same `syncFacilitator` the scheduled task calls, against the
 * same `SyncConfig`, so what runs here is the production code path — not a
 * reimplementation of it.
 *
 *   pnpm sync:once --chain stellar
 *   pnpm sync:once --chain stellar --since 2026-08-04T00:00:00Z
 *
 * `--since` overrides the facilitator's sync start date, which is what the
 * adapter falls back to when it finds no previously synced transfer. Use it to
 * bound a first run instead of replaying the chain's full history.
 *
 * Requires TRANSFERS_DB_URL. Writes are idempotent: TransferEvent is unique on
 * (tx_hash, log_index, chain, block_timestamp) and inserts use skipDuplicates.
 */
import { countTransferEvents, getTransferEvents } from '@/db/services';
import { syncFacilitator } from '@/trigger/sync';
import { stellarSorobanConfig } from '@/trigger/chains/stellar/soroban/config';
import { baseCdpConfig } from '@/trigger/chains/evm/base/cdp/config';
import { polygonBigQueryConfig } from '@/trigger/chains/evm/polygon/bigquery/config';
import { solanaBigQueryConfig } from '@/trigger/chains/solana/bigquery/config';

import type { Facilitator, SyncConfig } from '@/trigger/types';

const CONFIGS: Record<string, SyncConfig> = {
  stellar: stellarSorobanConfig,
  base: baseCdpConfig,
  polygon: polygonBigQueryConfig,
  solana: solanaBigQueryConfig,
};

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

/** Rewrite every facilitator's sync start date, for a bounded first run. */
function withSyncStartDate(
  facilitators: Facilitator[],
  chain: string,
  since: Date
): Facilitator[] {
  return facilitators.map(facilitator => ({
    ...facilitator,
    addresses: Object.fromEntries(
      Object.entries(facilitator.addresses).map(([network, configs]) => [
        network,
        network === chain
          ? configs.map(config => ({ ...config, syncStartDate: since }))
          : configs,
      ])
    ),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chain = args.chain;

  if (!chain || !CONFIGS[chain]) {
    throw new Error(
      `Pass --chain <${Object.keys(CONFIGS).join('|')}>, got ${chain ?? 'nothing'}`
    );
  }

  if (!process.env.TRANSFERS_DB_URL) {
    throw new Error('TRANSFERS_DB_URL is not set');
  }

  const baseConfig = CONFIGS[chain];
  const since = args.since ? new Date(args.since) : undefined;

  if (since && Number.isNaN(since.getTime())) {
    throw new Error(`--since is not a valid date: ${args.since}`);
  }

  const config: SyncConfig = since
    ? {
        ...baseConfig,
        facilitators: withSyncStartDate(
          baseConfig.facilitators,
          baseConfig.chain,
          since
        ),
      }
    : baseConfig;

  const now = new Date();

  console.log(
    `[${config.chain}] running ${config.provider} adapter once, ` +
      `${config.facilitators.length} facilitator(s), up to ${now.toISOString()}` +
      (since ? ` from ${since.toISOString()}` : '')
  );

  // The adapters report progress through trigger.dev's `logger`, which is a
  // no-op outside a run context — so the run would otherwise be silent. Bracket
  // it with the stored state instead, which also shows whether the incremental
  // cursor actually resumed rather than replaying from syncStartDate.
  const before = await summarize(config.chain);
  console.log(
    `[${config.chain}] before: ${before.count} rows` +
      (before.latest ? `, latest ${before.latest.toISOString()}` : '')
  );

  const startedAt = Date.now();

  for (const facilitator of config.facilitators) {
    await syncFacilitator(config, facilitator, now);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const after = await summarize(config.chain);

  console.log(
    `[${config.chain}] after:  ${after.count} rows` +
      (after.latest ? `, latest ${after.latest.toISOString()}` : '')
  );
  console.log(
    `[${config.chain}] +${after.count - before.count} rows in ${elapsed}s`
  );
}

async function summarize(chain: string) {
  const [count, latest] = await Promise.all([
    countTransferEvents({ chain }),
    getTransferEvents({
      where: { chain },
      orderBy: { block_timestamp: 'desc' },
      take: 1,
    }),
  ]);

  return { count, latest: latest[0]?.block_timestamp };
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
