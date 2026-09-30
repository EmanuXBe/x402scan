# Question to OpenZeppelin: which account to anchor on

Where: a discussion or issue at [OpenZeppelin/relayer-plugin-channels](https://github.com/OpenZeppelin/relayer-plugin-channels) (active; last commit 2026-09-11). Tracked in [#10](https://github.com/EmanuXBe/x402scan/issues/10).

Why it matters: if the account we anchor on changes, or if there is more than one, the index misses payments without any error.

---

**Title:** Which account should an indexer anchor on to attribute x402 settlements on pubnet?

Hi! We maintain StellarScan, a fork of x402scan that indexes x402 payments settled through Channels on Stellar mainnet, and we're proposing it upstream to Merit Systems.

The indexer attributes a payment to Channels by the account that pays its fee bump: `GA5SXMFJTUPTZRIEKM6XZLCYOZRMUEE6KGAHL3GXDBG64DYOUIWYIF3M`, which `/x402/supported` returns as `signers["stellar:pubnet"]`. On chain, as of 2026-09-29, it is the fee-bump payer on 2,576 of its 2,640 transactions, and the inner sources are 1,162 distinct channel accounts. So we take it to be the fund account.

1. Is that right?
2. Can it change, or can there be more than one fund account on pubnet (per region, per plugin, per shard)?
3. If it changes, is there a stable way to learn the new one, for example `/x402/supported` without an API key?

Any pointer helps. Thanks!
