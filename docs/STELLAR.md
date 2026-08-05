# Stellar support

How x402 payment indexing works on Stellar, for whoever has to maintain or extend it.

> **Status:** draft. Fill in `<!-- TODO -->` with what actually got implemented.

---

## Overview

Stellar comes in through the same three extension points as Solana:

| Layer | Files |
|---|---|
| Facilitator registry | `packages/external/facilitators/src/` — `Network.STELLAR`, `USDC_STELLAR_TOKEN`, facilitators |
| Sync adapter | `sync/transfers/trigger/chains/stellar/hubble/` — `config.ts`, `query.ts` |
| Frontend | `apps/scan/src/types/chain.ts` — `Chain.STELLAR` |

**No database migrations were needed.** The `TransferEvent` model was already chain-agnostic: `chain` and `provider` are free text, there are no `Bytes` types or fixed lengths, and Stellar's `G…`/`C…` addresses and 64-character hashes fit unchanged.

## Data source: Horizon

Stellar x402 settlements are Soroban contract invocations against the USDC SAC, submitted by the facilitator's relayer. Two properties make them attributable, and **both filters are required**:

1. The relayer is the transaction's source (or fee) account — the anchor.
2. The operation is `invoke_host_function`, not a classic `payment`.

The second filter is the non-obvious one. **A SAC mirrors its classic asset, so ordinary USDC payments also emit `transfer` contract events.** Filtering on contract events alone sweeps in the network's entire classic payment volume — a 100-minute mainnet scan returned 5,982 such events, almost all of them ordinary payments rather than agentic ones. Only contract invocations are protocol-level agentic payments.

Horizon is the source rather than Soroban RPC for two reasons:

- **Retention.** RPC `getEvents` keeps ~24h, and `getTransaction` far less — a scan of 4,012 transactions resolved only **61** source accounts. Horizon keeps full history.
- **No XDR handling.** Horizon returns `asset_balance_changes` already decoded, with `from`, `to` and a human-unit `amount`, plus `source_account` and `fee_account` as plain fields.

The query is facilitator-first — walk `/accounts/{relayer}/transactions` and pull operations — which matches how the rest of x402scan attributes payments.

## Deep history: Hubble

[Hubble](https://developers.stellar.org/docs/data/analytics/hubble) is the Stellar Development Foundation's public BigQuery dataset: `crypto-stellar.crypto_stellar`.

It fits the existing machinery with no new plumbing. `fetch/bigquery/fetch.ts` is generic — it instantiates the BigQuery client with credentials from the environment and executes whatever string `config.buildQuery` returns. The dataset lives inside the SQL.

That's why the Stellar adapter **reuses `QueryProvider.BIGQUERY`** rather than introducing a new provider: Hubble is another BigQuery dataset, and adding a `QueryProvider.HUBBLE` would have required an extra case in `fetch.ts`'s dispatch for no gain.

### The query

<!-- TODO: paste the final query and explain the tables used.
     Candidate tables: history_contract_events (SAC events),
     history_transactions (hash), enriched_history_operations -->

```sql
-- TODO
```

It returns the columns of `TransferEventData`: `tx_hash`, `sender`, `recipient`, `amount`, `block_timestamp`, and the token's `contract_id`.

### Alternative considered

Soroban RPC (`getEvents`) works for recent data but has a 24-hour default retention — up to 7 days on private instances. Not enough for history.

<!-- TODO: if RPC ended up being used as the fallback, invert this section and
     explain the retention limitation -->

## Integration traps

Three things that aren't obvious and fail silently.

### 1. Stellar assets use 7 decimals — and the app has a fixed 6-decimal amount convention

Verified end-to-end: `TransferEvent.amount` is stored in **6-decimal base units on every chain**. Ingest normalizes to human units and multiplies by `USDC_MULTIPLIER = 1_000_000` (`sync/transfers/trigger/lib/constants.ts:1`; Solana does `SAFE_DIVIDE(value, POW(10, decimals))` in SQL first). The Timescale MVs then `SUM(amount)` raw, and the UI formats with a **hardcoded** `decimals = 6` (`apps/scan/src/lib/token.ts:21`) — the `decimals` column is metadata the display path never reads.

Rule for the Stellar adapter: `transformResponse` must divide raw 7-decimal amounts by `1e7` to get human units, then multiply by `USDC_MULTIPLIER`. Set `USDC_STELLAR_TOKEN.decimals = 7` (true token metadata), but never store 7-decimal base units in `amount` — every dashboard figure for Stellar would silently inflate 10x, with no exception thrown.

### 2. Stellar addresses are case-sensitive

`normalizeAddress` in `sync/transfers/trigger/sync.ts` lowercased everything that wasn't Solana. Stellar addresses are case-sensitive base32 (`G…` for accounts, `C…` for contracts), and that function feeds the sync state key.

Without the fix, the sync cursor would never match the stored record and the sync would re-query the same time window indefinitely.

### 3. Stellar has no numeric chain ID

`CHAIN_ID` maps chains to EVM integers. Stellar uses `0`, following Solana's precedent. Real identification is CAIP-2: `stellar:pubnet` and `stellar:testnet`, resolved in `apps/scan/src/lib/x402/chain-mapping.ts`.

## MPP Charge coverage

<!-- TODO: delete this section if the MPP spike didn't land. -->

An MPP Charge payment is mechanically identical to an x402 one: a SAC transfer to a known address. The same Hubble query and the same `transformResponse` cover it — only the registered address differs.

**Known shortcut, deliberate:** the registry is built around `Facilitator`, and an MPP service is not a facilitator — there's no intermediary. We registered the service as a pseudo-facilitator keyed on its `recipient` address because it required no schema change. **This is not the design we'd propose.** The right model is a separate service registry, described in [MPP-ATTRIBUTION.md](MPP-ATTRIBUTION.md).

**Scope:** this covers one MPP service, deployed by us. It is not ecosystem coverage — no directory of MPP services exists to enumerate.

## Boundary with the wallet

Stellar is in the `Chain` enum and in the **read/analytics** path. It is not in the **wallet/transaction** path.

The split is explicit: `SUPPORTED_CHAINS` includes Stellar, `WALLET_CHAINS` does not. Wallet, onramp, deposit and withdraw surfaces still operate on Base and Solana only.

This is intentional, not an oversight: wallet support for Stellar touches 40+ files and requires Freighter or Stellar Wallets Kit integration, which is a separate project.

## Local development (no paid accounts)

Upstream assumes Neon + CDP + Stripe. This fork runs fully local:

- **DB clients**: `packages/internal/databases/{scan,transfers}/src/client.ts` now fall back to the standard `pg` driver (Prisma adapter + a `pg.Pool` wrapper matching the `neon()` http interface) whenever the connection string points at localhost. Neon-hosted URLs behave exactly as before.
- **Scan DB**: plain local Postgres. `createdb x402scan_scan`, then `prisma migrate deploy` in `packages/internal/databases/scan`.
- **Transfers DB**: requires **TimescaleDB** — the dashboard's analytics are Timescale materialized views, all keyed by `(facilitator_id, chain)`. Run `docker run -d --name x402-timescale -p 5433:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=x402scan_transfers timescale/timescaledb:latest-pg17`.
- **FDW migration**: `20260105150207_fdw_payto_origin_map` hardcodes upstream's production Neon host. Before `migrate deploy`, pre-create the `x402scan_server` foreign server pointing at your local scan DB (`host.docker.internal` from the container) and pre-import `Accepts` + `Resources` with `IMPORT FOREIGN SCHEMA … LIMIT TO` — the migration's `IF NOT EXISTS` guards then skip its own hardcoded setup. (A full-schema import also fails on enums newer than the migration.)
- **Redis** (optional but wanted): without it every dashboard query re-runs per request and tab switches take ~600ms. `docker run -d --name x402-redis -p 6379:6379 redis:7-alpine`, then set `REDIS_URL=redis://localhost:6379`. Warm pages drop to ~50ms.
  - **Upstream bug:** `REDIS_DISABLE: z.coerce.boolean()` in `apps/scan/src/env.ts` — `Boolean("false") === true`, so writing `REDIS_DISABLE=false` *disables* Redis. Omit the var entirely, or fix the schema to parse the string. Worth a small upstream PR.
- **Wallet contexts**: the CDP embedded-wallet connector and hooks SDK both require a real project ID at runtime even though `env.ts` marks it optional. `_contexts/wagmi/config.ts` now registers the CDP connector only when the ID is present, and `_contexts/cdp/config.ts` falls back to a placeholder UUID so the SDK initializes. The provider must stay mounted — skipping it breaks every `useCDP` consumer.
- **Env**: CDP/Stripe values can be dummies — they're only exercised by wallet/payment surfaces. `NEXT_PUBLIC_PROXY_URL` can point at the production proxy. `NEXT_PUBLIC_NODE_ENV=development` must be set explicitly or the `CRON_SECRET` conditional in `env.ts` makes it required.

MV grouping by `chain` means Stellar rows flow into every dashboard aggregate with zero changes to the MVs.

## What's missing

- Wallet support (see above)
- Alerts and analytics for Stellar
- MPP attribution — see [MPP-ATTRIBUTION.md](MPP-ATTRIBUTION.md)

<!-- TODO: new environment variables, if any -->
