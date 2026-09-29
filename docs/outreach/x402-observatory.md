# Message to Arturofrrdiz (x402-observatory)

Where: direct message on the Stellar developer Discord. Gate: same as [`stellar-discord-x402.md`](stellar-discord-x402.md). Tracked in [#16](https://github.com/EmanuXBe/x402scan/issues/16).

---

Hi Arturo! I'm Emanuel, building StellarScan, an x402scan fork that indexes x402 and MPP payments on Stellar.

I saw your notes on x402-observatory in #x402. I think our approaches cover each other's blind spots: you seed from payTo addresses, and we anchor on facilitators (OpenZeppelin Channels' fee-bump payer) plus known payTo addresses like ROZO's MPP Router.

Would you be up for:

1. exchanging anchor lists (our seller addresses for your payTo list), and
2. cross-checking counts on the overlap, then publishing the method?

Our audit scripts and dated snapshots are public: https://github.com/EmanuXBe/x402scan/tree/main/scripts/audit

Happy to jump on a call too.
