// Read-only audit of USDC payments received by a Stellar address (a payTo), such as
// ROZO's MPP Router. Horizon lists SAC transfers under their recipient, so the full
// history takes one paginated stream instead of one request per transaction.
//
//   node scripts/audit/recipient.mjs [PAY_TO_ADDRESS] > docs/data/YYYY-MM-DD-<name>.json
const HORIZON = process.env.HORIZON_URL ?? 'https://horizon.stellar.org';
const PAY_TO =
  process.argv[2] ?? 'GDK3AVW3YE6UL3J4WLNKBMP65KSY32YPUKIOC6PXW65XJ3LEG3YIDXXB';
const OZ_CHANNELS = 'GA5SXMFJTUPTZRIEKM6XZLCYOZRMUEE6KGAHL3GXDBG64DYOUIWYIF3M';

let requests = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    requests++;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`gave up on ${url}`);
}

const ops = [];
let url = `${HORIZON}/accounts/${PAY_TO}/operations?order=asc&limit=200&include_failed=false&join=transactions`;
while (url) {
  const body = await get(url);
  const records = body._embedded?.records ?? [];
  ops.push(...records);
  if (records.length < 200) break;
  url = body._links?.next?.href;
}

const operationTypes = {};
for (const op of ops)
  operationTypes[op.type] = (operationTypes[op.type] ?? 0) + 1;

const inbound = [];
for (const op of ops) {
  if (op.type !== 'invoke_host_function') continue;
  for (const c of op.asset_balance_changes ?? []) {
    if (c.type === 'transfer' && c.to === PAY_TO && c.asset_code === 'USDC') {
      inbound.push({
        at: op.created_at,
        from: c.from,
        amount: Number(c.amount),
        fee: op.transaction?.fee_account,
        source: op.transaction?.source_account,
      });
    }
  }
}

const tally = (list, key) =>
  Object.entries(
    list.reduce((m, x) => ((m[x[key]] = (m[x[key]] ?? 0) + 1), m), {})
  ).sort((a, b) => b[1] - a[1]);

console.log(
  JSON.stringify(
    {
      asOf: new Date().toISOString(),
      source: HORIZON,
      method:
        'recipient operations stream (join=transactions); invoke_host_function USDC transfers to the payTo',
      payTo: PAY_TO,
      requests,
      operationsListed: ops.length,
      operationTypes,
      inboundUsdcTransfers: inbound.length,
      volumeUSDC: Number(
        inbound.reduce((sum, p) => sum + p.amount, 0).toFixed(2)
      ),
      payers: new Set(inbound.map(p => p.from)).size,
      first: inbound[0]?.at,
      last: inbound.at(-1)?.at,
      settledByOzChannels: inbound.filter(p => p.fee === OZ_CHANNELS).length,
      feeAccounts: tally(inbound, 'fee').slice(0, 5),
      distinctTxSources: new Set(inbound.map(p => p.source)).size,
    },
    null,
    2
  )
);
