// Read-only audit of USDC payments settled by a Stellar facilitator that fee-bumps
// its settlements (OpenZeppelin Channels by default). Uses the same method as the
// sync adapter: the anchor's transactions, then operations per transaction.
//
//   node scripts/audit/facilitator.mjs [ANCHOR_ADDRESS] > docs/data/YYYY-MM-DD-<name>.json
//
// Only GET requests against public Horizon. A full OZ Channels run is about 2,650
// requests, within the documented default of 3,600 per hour per IP.
const HORIZON = process.env.HORIZON_URL ?? 'https://horizon.stellar.org';
const ANCHOR =
  process.argv[2] ?? 'GA5SXMFJTUPTZRIEKM6XZLCYOZRMUEE6KGAHL3GXDBG64DYOUIWYIF3M';
const CIRCLE_USDC_ISSUER =
  'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const DAY = 86_400_000;
const CONCURRENCY = 4;

let requests = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    requests++;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429 || res.status >= 500) {
      const reset = Number(
        res.headers.get('retry-after') ??
          res.headers.get('x-ratelimit-reset') ??
          0
      );
      await sleep(
        Math.min(60_000, Math.max(reset * 1000, 2000 * (attempt + 1)))
      );
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`gave up on ${url}`);
}

const now = new Date();

const txs = [];
let url = `${HORIZON}/accounts/${ANCHOR}/transactions?order=asc&limit=200&include_failed=false`;
while (url) {
  const body = await get(url);
  const records = body._embedded?.records ?? [];
  txs.push(...records);
  if (records.length < 200) break;
  url = body._links?.next?.href;
}

const role = { anchorIsSource: 0, anchorIsFeePayerOnly: 0, feeBump: 0 };
const innerSources = new Set();
for (const tx of txs) {
  if (tx.fee_bump_transaction) role.feeBump++;
  if (tx.source_account === ANCHOR) role.anchorIsSource++;
  else if (tx.fee_account === ANCHOR) role.anchorIsFeePayerOnly++;
  innerSources.add(tx.source_account);
}

const payments = [];
const failed = [];
let next = 0;
async function worker() {
  while (next < txs.length) {
    const tx = txs[next++];
    try {
      const ops = (
        await get(`${HORIZON}/transactions/${tx.hash}/operations?limit=200`)
      )._embedded.records;
      for (const op of ops) {
        if (op.type !== 'invoke_host_function') continue;
        for (const c of op.asset_balance_changes ?? []) {
          if (c.type !== 'transfer' || c.asset_code !== 'USDC') continue;
          payments.push({
            tx: tx.hash,
            at: tx.created_at,
            from: c.from,
            to: c.to,
            amount: Number(c.amount),
            issuer: c.asset_issuer,
          });
        }
      }
    } catch (error) {
      failed.push({ tx: tx.hash, error: String(error) });
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
payments.sort((a, b) => a.at.localeCompare(b.at));

const bySeller = new Map();
for (const p of payments) {
  const s = bySeller.get(p.to) ?? { count: 0, last: p.at, days: new Map() };
  s.count++;
  if (p.at > s.last) s.last = p.at;
  const day = p.at.slice(0, 10);
  s.days.set(day, (s.days.get(day) ?? 0) + 1);
  bySeller.set(p.to, s);
}
const ranked = [...bySeller.entries()].sort((a, b) => b[1].count - a[1].count);
const within = ms => payments.filter(p => now - new Date(p.at) <= ms);
const summary = list => ({
  payments: list.length,
  sellers: new Set(list.map(p => p.to)).size,
  buyers: new Set(list.map(p => p.from)).size,
});

console.log(
  JSON.stringify(
    {
      asOf: now.toISOString(),
      source: HORIZON,
      method:
        'anchor transactions, then operations per transaction; invoke_host_function USDC transfers',
      anchor: ANCHOR,
      requests,
      anchorTransactions: {
        count: txs.length,
        first: txs[0]?.created_at,
        last: txs.at(-1)?.created_at,
        ...role,
        distinctTxSourceAccounts: innerSources.size,
      },
      failedLookups: failed.length,
      payments: payments.length,
      buyers: new Set(payments.map(p => p.from)).size,
      sellers: bySeller.size,
      volumeUSDC: Number(
        payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)
      ),
      nonCircleUSDC: payments.filter(
        p => p.issuer && p.issuer !== CIRCLE_USDC_ISSUER
      ).length,
      firstPayment: payments[0]?.at,
      lastPayment: payments.at(-1)?.at,
      topSellers: ranked.slice(0, 3).map(([address, s]) => {
        const [busiestDay, onBusiestDay] = [...s.days.entries()].sort(
          (a, b) => b[1] - a[1]
        )[0];
        return {
          address,
          payments: s.count,
          share: `${((s.count / payments.length) * 100).toFixed(1)}%`,
          busiestDay,
          onBusiestDay,
          lastPayment: s.last,
        };
      }),
      last7Days: summary(within(7 * DAY)),
      last30Days: summary(within(30 * DAY)),
    },
    null,
    2
  )
);
