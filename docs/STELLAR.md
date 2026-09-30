# Stellar support

How x402 payment indexing works on Stellar, for whoever has to maintain or extend it.

> **Status:** describes what is implemented. Where a section documents something that was planned and not built — Hubble, MPP coverage — it says so in the heading rather than leaving the reader to infer it from the code.

---

## Overview

Stellar comes in through the same three extension points as Solana:

| Layer                | Files                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Facilitator registry | `packages/external/facilitators/src/` — `Network.STELLAR`, `USDC_STELLAR_TOKEN`, facilitators |
| Sync adapter         | `sync/transfers/trigger/chains/stellar/soroban/` — `config.ts`, `query.ts`, `sync.ts`         |
| Frontend             | `apps/scan/src/types/chain.ts` — `Chain.STELLAR`                                              |

**No database migrations were needed.** The `TransferEvent` model was already chain-agnostic: `chain` and `provider` are free text, there are no `Bytes` types or fixed lengths, and Stellar's `G…`/`C…` addresses and 64-character hashes fit unchanged.

## Data source: Horizon

Stellar x402 settlements are Soroban contract invocations against the USDC SAC, submitted by the facilitator's relayer. Two properties make them attributable, and **both filters are required**:

1. The relayer is the transaction's source (or fee) account — the anchor.
2. The operation is `invoke_host_function`, not a classic `payment`.

The second filter is the non-obvious one. **A SAC mirrors its classic asset, so ordinary USDC payments also emit `transfer` contract events.** Filtering on contract events alone sweeps in the network's entire classic payment volume — a 100-minute mainnet scan returned 5,982 such events, almost all of them ordinary payments rather than agentic ones. Only contract invocations are protocol-level agentic payments.

Horizon is the source rather than Soroban RPC for two reasons:

- **Retention.** RPC `getEvents` keeps days, not months, and `getTransaction` far less — a scan of 4,012 transactions resolved only **61** source accounts. Horizon keeps full history.

  Don't assume the retention figure. `getHealth` reports it exactly, and the widely repeated "24 hours" is wrong for the public endpoint: on 2026-08-05 `mainnet.sorobanrpc.com` returned `ledgerRetentionWindow: 120960` — 120,960 ledgers at ~5s, or **7 days**. Read it at runtime and clamp `startLedger` to `oldestLedger`; a hardcoded assumption is either wasteful or an error.

- **No XDR handling.** Horizon returns `asset_balance_changes` already decoded, with `from`, `to` and a human-unit `amount`, plus `source_account` and `fee_account` as plain fields.

The query is facilitator-first — walk `/accounts/{relayer}/transactions` and pull operations — which matches how the rest of x402scan attributes payments.

## Deep history: Hubble — designed, not built

**There is no Hubble adapter in this fork.** `chains/stellar/` contains `soroban/` and nothing else. This section records why it was planned and why it turned out to be unnecessary, so the next person does not build it by default.

The plan was [Hubble](https://developers.stellar.org/docs/data/analytics/hubble), the Stellar Development Foundation's public BigQuery dataset (`crypto-stellar.crypto_stellar`), reusing `QueryProvider.BIGQUERY` rather than introducing a new provider — `sync/transfers/trigger/fetch/bigquery/fetch.ts` is generic, so the dataset would have lived inside the SQL string returned by `buildQuery` and no dispatch case would have been needed.

It was dropped because Horizon covers today's anchors for free, with no credentials and no GCP project. The OZ Channels relayer's first transaction (2026-03-06) is inside public Horizon's one-year window; its transaction list is 14 requests, and operations add one request per transaction (2,654 in total on 2026-09-29).

Hubble becomes necessary at two boundaries: history older than public Horizon's one-year window, and backfills where one request per transaction is too slow. The recipient anchor is not one of them. Horizon lists every SAC transfer under its recipient, so "everything paid to this service" is one paginated query (verified 2026-09-29, see [MPP coverage](#mpp-coverage-rozos-mpp-router)).

### Why not Soroban RPC for history

RPC `getEvents` works for recent data and needs no credentials, which makes it tempting as the primary source. Its retention window rules that out: 7 days on `mainnet.sorobanrpc.com` as of 2026-08-05 (`ledgerRetentionWindow: 120960`), and configurable per instance. Query `getHealth` for the real figure rather than trusting the widely repeated "24 hours" — it is wrong for the public endpoint.

Nothing in the adapter calls RPC anymore. The recipient path used `getEvents` until 2026-09-29; it now reads Horizon's operations stream, which reaches back a year instead of a week. Horizon serves every stored row on both paths, which is why `QueryProvider.HORIZON` is what lands in `TransferEvent.provider`.

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

## MPP coverage: ROZO's MPP Router

ROZO's [MPP Router](https://github.com/mpprouter/rozo-mpprouter) (`rozo` in the facilitator registry) is indexed through a recipient anchor on its payTo, `GDK3AVW3YE6UL3J4WLNKBMP65KSY32YPUKIOC6PXW65XJ3LEG3YIDXXB`. `fetchByRecipient` walks `/accounts/{payTo}/operations?join=transactions` newest first and keeps the `invoke_host_function` USDC transfers credited to it. ROZO submits and fee-bumps these itself; none go through OZ Channels.

As of 2026-09-30 04:39 UTC: 1,050 transfers, 38.87 USDC and 27 payers since 2026-04-10 ([snapshot](data/2026-09-30-mpp-router-payers.json)).

**Likely test traffic.** On the Stellar #x402 Discord, ROZO said some payers are its own test wallets, and account funding points the same way. The account that created the payTo, `GC56BXCNEWL6JSGKHD3RJ5HJRNKFEJQ53D3YY3SMD6XK7YPDI75BQ7FD`, also created four payers, one of which created two more. With the payTo's own two self-payments, that family is 7 payers, 404 payments (38.5%) and 25.26 USDC (65.0%). This is an inference from who funded each account, not a confirmation. Everything is indexed; confirm the list with ROZO before quoting the router's volume as third-party demand.

**Registry shape.** The registry is built around `Facilitator`, and the MPP Router is not an x402 facilitator. Registering it as one with `anchor: 'recipient'` needs no schema change and works for this fork. Upstream, a separate service registry is the better design. Its logo (`apps/scan/public/rozo.svg`) is a neutral placeholder until ROZO provides one.

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
  - **Upstream bug:** `REDIS_DISABLE: z.coerce.boolean()` in `apps/scan/src/env.ts` — `Boolean("false") === true`, so writing `REDIS_DISABLE=false` _disables_ Redis. Omit the var entirely, or fix the schema to parse the string. Worth a small upstream PR.
- **Wallet contexts**: the CDP embedded-wallet connector and hooks SDK both require a real project ID at runtime even though `env.ts` marks it optional. `apps/scan/src/app/_contexts/wagmi/config.ts` now registers the CDP connector only when the ID is present, and `apps/scan/src/app/_contexts/cdp/config.ts` falls back to a placeholder UUID so the SDK initializes. The provider must stay mounted — skipping it breaks every `useCDP` consumer.
- **Env**: CDP/Stripe values can be dummies — they're only exercised by wallet/payment surfaces. `NEXT_PUBLIC_PROXY_URL` can point at the production proxy. `NEXT_PUBLIC_NODE_ENV=development` must be set explicitly or the `CRON_SECRET` conditional in `env.ts` makes it required.

MV grouping by `chain` means Stellar rows flow into every dashboard aggregate with zero changes to the MVs.

## What's missing

- Wallet support (see above)
- Alerts and analytics for Stellar
- MPP attribution — see [MPP-ATTRIBUTION.md](MPP-ATTRIBUTION.md)

## Environment variables

**None.** Stellar adds no new configuration to `env.ts` and needs no credentials. Horizon is public and unauthenticated, and its endpoint is an optional `SyncConfig` field (`apiUrl`) that defaults to `horizon.stellar.org`.

This is worth stating because it is the exception. Base needs CDP keys, Solana's adapters need BigQuery credentials, and both fail closed without them. A Stellar backfill runs from a clean checkout.

`OZ_API_KEY` is the one that looks like a counterexample and is not. An OpenZeppelin Channels key is required to _make_ an x402 payment on Stellar, and it is how the facilitator's relayer address was obtained in the first place — an authenticated `GET /x402/supported` returns `signers["stellar:pubnet"]`. But that address is now a constant in the facilitator registry, so indexing never re-derives it. Nothing in the shipped code reads the variable.
