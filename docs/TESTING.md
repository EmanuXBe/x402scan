# How to test StellarScan

Two ways in: as a person looking at the explorer, and as an agent consuming the
API. Every command below was run against this fork with real Stellar mainnet
data; the figures are what you should actually see.

Replace `http://localhost:3000` with the deployed URL where relevant.

---

## Visually

### Start it

```bash
docker start x402-timescale x402-redis   # transfers DB + cache
pnpm dev                                 # http://localhost:3000
```

### `/all?chain=stellar` — the two panels this fork adds

**Machine payment profile.** Answers "what does agent traffic look like here",
from observed transfers alone. It works from a chain's first payment, unlike the
registry-backed panels which read zero until services self-register.

What to look for:

| Tile                                  | Expect                | Why it matters                                      |
| ------------------------------------- | --------------------- | --------------------------------------------------- |
| Most common payment                   | 0.001 USDC, **90.6%** | one price, nine payments in ten — a per-call tariff |
| Median gap between a buyer's payments | **29s**               | a caller on a loop, not a person                    |
| Buyers / sellers / pairs              | 37 / 23 / 44          | roughly two sellers per buyer                       |

The modal share is the flatness signal, not a percentile comparison. Median here
equals p90, not p95, so comparing those two reports "not flat" about the flattest
distribution available.

**Seller liveness.** The panel that makes the central finding visible. Ordered by
most recently paid rather than by volume, because volume ranking is the thing it
exists to correct.

Look at the first and the last rows together:

```
GDNJXCKW…    95 payments   29/33 active days    19% peak day   active
GB3Y5MRJ…  1581 payments    2/17 active days   100% peak day   dormant
```

The 1,581-payment seller is 62% of every agentic payment on the chain, took
1,574 of them on a single day in May, and has been silent for 79 days. Every
volume-ranked dashboard puts it first.

### Other pages

`/` · `/facilitators` · `/networks` · `/transactions` · `/ecosystem` — the chain
selector switches all of them to Stellar.

### Verify the numbers against the chain

Nothing here is seeded. Pick any transaction and check it:

```bash
psql "$TRANSFERS_DB_URL" -c \
  "SELECT tx_hash, amount, block_timestamp FROM \"TransferEvent\"
   WHERE chain='stellar' ORDER BY block_timestamp DESC LIMIT 1;"

curl -s "https://horizon.stellar.org/transactions/<tx_hash>" | jq .created_at
```

`amount` is in 6-decimal base units on every chain, so `20000` is 0.02 USDC.
Stellar assets carry 7 decimals — the adapter converts, and storing raw units
would inflate every Stellar figure tenfold with no error raised.

---

## As an agent

### Discovery

The app advertises itself through RFC 8288 `Link` headers on every response, so
an agent can bootstrap from any page:

```bash
curl -sI http://localhost:3000/ | grep -i '^link:'
# </.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc"
```

```bash
curl -s http://localhost:3000/.well-known/api-catalog   # RFC 9727 catalogue
curl -s http://localhost:3000/openapi.json              # 14 paths
```

Confirm Stellar is offered as a filter — this fork's fix, since the enum was
hardcoded to Base and Solana:

```bash
curl -s http://localhost:3000/openapi.json \
  | jq '[.. | objects | select(.name=="chain") | .schema.enum] | unique'
# [["base","solana","stellar"]]
```

### The API is itself x402-paid

Every `/api/x402/*` endpoint answers `402 Payment Required` with the payment
terms in a header. That is upstream's design, and it makes the explorer a
worked example of the thing it indexes.

```bash
curl -sD- -o /dev/null "http://localhost:3000/api/x402/merchants?chain=stellar" \
  | grep -i '^payment-required:' | cut -d' ' -f2 | base64 -d | jq
```

The decoded body carries `accepts[]` (scheme, network, amount, asset, payTo) and
a Bazaar schema describing every query parameter — enough for an agent to decide
whether to pay and how to call it.

**Note:** the terms quote `eip155:8453` — Base. The API charges on Base while
indexing Stellar. Paying for it in Stellar USDC would need the facilitator's
Stellar network added to the paywall config, which is a business decision rather
than a technical gap.

### Paying for it

You need a funded wallet on the quoted network and an OpenZeppelin Channels key.
The client is the same one any Stellar x402 buyer uses:

```bash
npm install @x402/fetch @x402/stellar
```

```js
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/client';

const signer = createEd25519Signer(
  process.env.STELLAR_SECRET_KEY,
  'stellar:pubnet'
);
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    { network: 'stellar:pubnet', client: new ExactStellarScheme(signer) },
  ],
});

const res = await fetchWithPayment(
  'http://localhost:3000/api/x402/merchants?chain=stellar'
);
console.log(await res.json());
```

Pass the raw `S…` secret and the CAIP-2 network id. Do not pre-wrap with
`Keypair.fromSecret` or convert the passphrase yourself — the signer does both,
and doing it first is the most common way this fails.

### Without paying

The tRPC surface the app's own UI uses is open, which is the quickest way to see
the data an agent would buy:

```bash
IN=$(python3 -c "import json,urllib.parse;print(urllib.parse.quote(json.dumps({'json':{'chain':'stellar','timeframe':0,'limit':5}})))")
curl -s "http://localhost:3000/api/trpc/public.stats.sellerLiveness?input=$IN" | jq '.result.data.json'
```

```bash
IN=$(python3 -c "import json,urllib.parse;print(urllib.parse.quote(json.dumps({'json':{'chain':'stellar','timeframe':0}})))")
curl -s "http://localhost:3000/api/trpc/public.stats.machineProfile?input=$IN" | jq '.result.data.json'
```

### Reproduce the index from scratch

The strongest test, because it needs nothing from us — no credentials, no API
keys, only public Horizon:

```bash
pnpm --filter @x402scan/sync-transfers sync:once --chain stellar
```

A steady-state run is one Horizon page and about two seconds; it resumes from
its own cursor. A cold backfill of the full history takes roughly ten minutes.

Resolve seller identities the same way, through SEP-1:

```bash
pnpm --filter @x402scan/app sync:stellar-identities          # dry run
```

```
4/23 sellers resolved, 1 of them bidirectionally verified.
19 publish no SEP-1 identity.
```

Both halves are the finding. Four services recovered that x402's own discovery
convention cannot see at all, and nineteen still anonymous even with the right
convention.
