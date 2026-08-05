<!--
DRAFT — block to prepend to the fork's README.md.
Does NOT go upstream. See branch `feat/stellar-support`.
Fill in the <!-- TODO --> markers with verified facts only. If a gate ended in a
fallback, say so here. No claims about software that never ran.
-->

# x402scan + Stellar

A fork of [`Merit-Systems/x402scan`](https://github.com/Merit-Systems/x402scan) that adds **Stellar** as a first-class chain to the agentic payments explorer.

**Stellar Summit São Paulo 2026** · Sub-lane 3A, Agentic Payments

---

## What this fork adds

<!-- TODO: keep only what actually ended up working -->

- Stellar in the chain selector, with volume, transactions and unique buyers
- Indexing of x402 payments settled on Stellar via facilitator, using [Hubble](https://developers.stellar.org/docs/data/analytics/hubble) as the data source
- Transaction links to [stellar.expert](https://stellar.expert)
- Registered Stellar facilitators: <!-- TODO: which ones -->

<!-- TODO: if the MPP Charge spike landed, add it here — and state plainly that
     it covers ONE service we deployed, not the MPP ecosystem. The claim is
     "MPP is indexable, here's proof", not "we index MPP". -->

## Why Stellar was missing

`grep -ri "stellar|soroban"` across the upstream repository returned zero results. It wasn't for lack of activity — nobody had written the adapter.

The interesting part is *why*, and it's an attribution problem rather than an engineering one. Nothing on Stellar is hidden: every payment is a visible SAC transfer. The question is whether a protocol's payments can be **enumerated** without already knowing who's involved — and that comes down to how many anchors exist and whether anyone publishes them.

x402 has few anchors, shared across services, publicly registered. MPP Charge has one anchor per service and no directory listing them. MPP Channel — the mode that settles *off-chain* — turns out to be the most enumerable of the three, because every channel instance shares a WASM hash.

Full reasoning in **[docs/MPP-ATTRIBUTION.md](docs/MPP-ATTRIBUTION.md)**. That diagnosis is the main contribution of this work. The code is the consequence.

## Data status

<!-- TODO — MANDATORY. Pick one and delete the others:
  (a) Mainnet data indexed from Hubble.
  (b) Testnet data. Volume includes N transactions we generated ourselves to
      demonstrate the pipeline, labeled as such in the UI.
  (c) The automated sync was not validated in time; the rows shown were
      inserted manually from real transactions verified on stellar.expert.
      The adapter is still shipped in the PR.
-->

## Technical details

How the adapter works, the Hubble query, and the integration traps (decimals, address formatting): **[docs/STELLAR.md](docs/STELLAR.md)**.

## Upstream contribution

These changes are proposed back to Merit Systems: <!-- TODO: PR link -->

All Stellar work lives on `feat/stellar-support`. This README is not part of that PR.

## Running the project

Unchanged from upstream — see [README.md](README.md).

<!-- TODO: new environment variables, if the Hubble adapter needs any -->

## License

Apache 2.0, same as upstream. Original copyright by Merit Systems.
