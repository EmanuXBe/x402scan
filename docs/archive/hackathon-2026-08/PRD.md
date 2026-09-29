# PRD — StellarScan

**Stellar Summit São Paulo 2026** · Sub-lane 3A, Agentic Payments · 1,750 USDC
Fork of `Merit-Systems/x402scan` (Apache 2.0) · Ship date: August 5

---

## Problem

Stellar doesn't appear in any agentic-payments observability tool. x402scan covers Base and Solana; MPPscan covers Tempo. The gap isn't caused by lack of activity — nobody wrote the adapter.

**One-liner:** Stellar stops being invisible on the map of the agentic economy.

## Why this is feasible in 48h

x402scan's data model is already chain-agnostic. `TransferEvent` assumes EVM in no field: `chain` and `provider` are free text, there are no `Bytes` types and no fixed lengths. Stellar's `G…`/`C…` addresses and 64-character hashes fit without touching the schema.

**Zero database migrations.** The work is an adapter, not a refactor.

## The finding: anchors, not cryptography

x402scan identifies payments by **facilitator address**: a transfer counts as an x402 payment if a registered facilitator touched it.

Everything on Stellar is a visible SAC transfer — nothing is hidden. The real question is whether a protocol's payments can be **enumerated** without already knowing the participants. That reduces to one property: how many anchors exist, and who publishes them.

| Protocol | Anchor | How many | Published? |
|---|---|---|---|
| x402 | Facilitator address | Few, shared across all services | Yes |
| MPP Charge | The service's own receiving address | One per service | **No** |
| MPP Channel | `one-way-channel` WASM hash | **One, protocol-wide** | Derivable on-chain |

This inverts the intuition. A *single* MPP service is trivially indexable — same mechanism as x402, different address. What's missing is a **directory** of MPP services, which is a coordination problem, not a technical one. And the mode that settles off-chain turns out to be the most enumerable of the three, because every channel instance shares a WASM hash.

Full reasoning in [docs/MPP-ATTRIBUTION.md](docs/MPP-ATTRIBUTION.md).

> This diagnosis is the project's intellectual asset. It explains something neither Merit nor SDF had documented. We present it as a finding, not as a limitation.

## Scope

**Phase 1 (this delivery).** Stellar as a selectable chain, with x402 payments settled via facilitator indexed and visible in the explorer.

**Conditional P2 — MPP Charge.** If RF-02 lands with time to spare, index one MPP Charge service we deploy ourselves. Proves MPP is indexable; does *not* claim ecosystem coverage, since no service directory exists. Time-boxed and gated — never at the expense of Phase 1.

**Phase 3 (post-bounty).** An MPP service registry. Channel discovery by WASM hash. Channel-native metrics: micro-calls per settlement, cost per call — which no explorer reports today.

**Out of scope.** Embedded wallet · onramp · agent chat · resource registration · alerts · analytics · full feature parity · Base/Solana history backfill · mainnet if testnet is enough to demonstrate.

## Requirements

Each requirement is its own acceptance criterion.

| ID | Requirement | Verification | Prio |
|---|---|---|---|
| RF-01 | Stellar appears in the chain selector | `pnpm dev` boots and Stellar is selectable | Must |
| RF-02 | USDC transfers originated by a registered facilitator are indexed | ≥1 row with `chain = 'stellar'` in `TransferEvent`, from a real facilitator | Must |
| RF-03 | Dashboard shows volume, transaction count and unique buyers | Metrics correct — cross-checked against stellar.expert, no render errors | Must |
| RF-04 | Transaction hashes link to a Stellar explorer | A hash opens the correct transaction on stellar.expert | Must |
| RF-05 | Document on the MPP attribution problem | Present in the repo | Must |
| RF-06 | **PR opened against `Merit-Systems/x402scan`** | PR exists and is reviewable | Must |
| RF-07 | At least one Stellar facilitator visible with its stats | Appears in the facilitators view | Should |
| RF-08 | `G…`/`C…` addresses formatted and truncated · chain filter works | Correct in the views that already support it | Should |

**RF-06 is what turns the submission from a demo into a contribution.** It is worth more than any additional feature.

**Cross-cutting constraint:** no change may degrade Base or Solana. This is a condition of the upstream PR.

## Deliverables

- Public fork repository, with a README explaining what was added and why
- Upstream PR to `Merit-Systems/x402scan`
- Technical document on agentic payment attribution on Stellar
- Demo video (~3 min)
