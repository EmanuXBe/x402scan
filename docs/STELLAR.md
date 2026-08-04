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

## Data source: Hubble

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

### 1. Stellar assets use 7 decimals

Base and Solana use 6-decimal USDC. Stellar uses 7. Any aggregation that sums amounts across both chains without normalizing by `decimals` inflates Stellar figures 10x — and the error throws no exception, it just produces wrong numbers.

### 2. Stellar addresses are case-sensitive

`normalizeAddress` in `sync/transfers/trigger/sync.ts` lowercased everything that wasn't Solana. Stellar addresses are case-sensitive base32 (`G…` for accounts, `C…` for contracts), and that function feeds the sync state key.

Without the fix, the sync cursor would never match the stored record and the sync would re-query the same time window indefinitely.

### 3. Stellar has no numeric chain ID

`CHAIN_ID` maps chains to EVM integers. Stellar uses `0`, following Solana's precedent. Real identification is CAIP-2: `stellar:pubnet` and `stellar:testnet`, resolved in `apps/scan/src/lib/x402/chain-mapping.ts`.

## Boundary with the wallet

Stellar is in the `Chain` enum and in the **read/analytics** path. It is not in the **wallet/transaction** path.

The split is explicit: `SUPPORTED_CHAINS` includes Stellar, `WALLET_CHAINS` does not. Wallet, onramp, deposit and withdraw surfaces still operate on Base and Solana only.

This is intentional, not an oversight: wallet support for Stellar touches 40+ files and requires Freighter or Stellar Wallets Kit integration, which is a separate project.

## What's missing

- Wallet support (see above)
- Alerts and analytics for Stellar
- MPP attribution — see [MPP-ATTRIBUTION.md](MPP-ATTRIBUTION.md)

<!-- TODO: new environment variables, if any -->
