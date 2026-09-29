# Issue at Merit: proposal to index Stellar

Post after the claim fixes land ([#3](https://github.com/EmanuXBe/x402scan/issues/3), [#9](https://github.com/EmanuXBe/x402scan/issues/9), [#13](https://github.com/EmanuXBe/x402scan/issues/13)), because it links to this repo. Refresh the figures on the day of posting. Tracked in [#10](https://github.com/EmanuXBe/x402scan/issues/10).

---

**Title:** Proposal: index x402 payments on Stellar

Hi Merit team,

We run a fork of x402scan that indexes agentic payments on Stellar mainnet, and we'd like to upstream the parts that fit where x402scan is going. Before opening any PR, we want to check whether you want Stellar at all and in what shape.

### Context

- Hosted x402 settlement on Stellar mainnet goes through OpenZeppelin Channels (`channels.openzeppelin.com/x402`), which Stellar's docs list as the "Built on Stellar" facilitator. The x402.org facilitator only advertises `stellar:testnet`. A few teams also run their own facilitators.
- Channels submits through a pool of channel accounts with fee bumping. We anchor on the address it publishes as its `stellar:pubnet` signer, `GA5SXMFJTUPTZRIEKM6XZLCYOZRMUEE6KGAHL3GXDBG64DYOUIWYIF3M`. On chain it is the fee-bump payer on 2,576 of its 2,640 transactions, while the inner sources are 1,162 distinct channel accounts. We're confirming with OpenZeppelin that it is stable.
- As of 2026-09-29, Channels settled 2,572 USDC payments since 2026-03-06, from 41 buyers to 25 sellers: 7.95 USDC in total, 13 payments in the last 7 days. Small, but real, and currently invisible to x402scan.
- MPP Charge traffic exists too: ROZO's MPP Router received 1,046 USDC transfers since April. It is recipient-anchored and can be indexed the same way, but it is out of scope for a first PR.
- #740 tried to add the Channels facilitator and was closed, we assume because Stellar isn't a supported chain yet. This proposal would be the missing piece. cc @amishas157

### What we'd propose, as small PRs

1. **Indexing only.** `Chain.STELLAR` in the enum but not in `SUPPORTED_CHAINS`, the same way Polygon and Optimism are handled. `Network.STELLAR` with the OZ Channels facilitator, a sync adapter on the shared sync state, and unit tests in the style of `sync/transfers/test/channels-query.test.ts`. No schema changes.
2. **Resource registration.** `stellar` in `AcceptsNetwork`, which needs a scan DB migration, so it goes separately.
3. **Optional, only if you want it:** seller attribution through SEP-1 (`home_domain` to `stellar.toml`), which puts names on anonymous `G…` sellers.

No wallet, onramp or UI changes.

### Data source: your call

Our fork reads public Horizon today: no credentials and no new env vars. Three limits you should know about:

- SDF's public Horizon keeps one year of history (since August 2024), so a cold backfill from it stops being complete in March 2027.
- It rate limits per IP; the documented default is 3,600 requests per hour.
- Horizon lists a SAC transfer under its recipient but not under the fee-bump payer, so a facilitator anchor costs one request per payment: 2,654 for a full backfill today. Live 15-minute runs only touch a handful.

Since you already run BigQuery for Solana, Stellar's public Hubble dataset (`crypto-stellar.crypto_stellar`) could go through your existing `BIGQUERY` provider as just another `buildQuery`, with full history and no rate limit. We'd rather build whichever fits your ops.

### Things we ran into that may matter to you

- **Decimals.** Stellar USDC has 7 decimals. The adapter normalizes to your 6-decimal base units, so nothing downstream changes.
- **Addresses are case sensitive.** `normalizeAddress` lowercases every non-Solana address, which would break Stellar's base32 `G…` addresses and the sync cursor keyed on them.
- **The SAC mirrors classic USDC.** Filtering on contract events alone picks up every ordinary USDC payment on the network. The adapter keeps only `invoke_host_function` operations.
- **`log_index`.** A single Stellar transaction can carry several transfers, so the adapter assigns a per-transaction ordinal. We noticed `solana/bitquery/query.ts` sets `log_index: 0` with a TODO about batching. Happy to look at that separately if it helps.

**Known gap:** sellers who run their own facilitator settle without OZ Channels, so they are not attributed unless that facilitator is registered too, as on any other chain.

### Questions

1. Would you accept Stellar as an indexed chain? If so, is PR 1 the right size for a first review?
2. Horizon or Hubble through BigQuery?
3. Are `CHAIN_ID = 0` (following Solana) and CAIP-2 `stellar:pubnet` the right shape?
4. Does SEP-1 attribution belong in x402scan, or should it stay in our fork?
5. Your README shows an Apache 2.0 badge, but there is no LICENSE file, so GitHub lists the repo as unlicensed. Could you add one?

Our fork, with notes on each design decision: https://github.com/EmanuXBe/x402scan (see `docs/STELLAR.md`).

Thanks for building x402scan.
