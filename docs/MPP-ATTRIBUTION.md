# Agentic payment attribution on Stellar

Why x402 is indexed today, what it takes to index MPP, and why the hard part isn't cryptographic.

> **Status:** draft. Sections marked `<!-- VERIFY -->` need confirmation against documentation or on-chain data before publishing.

---

## x402scan's attribution model

x402scan doesn't observe payments — it observes token transfers and decides which ones *count* as agentic payments. The criterion is the **facilitator address**.

A transfer enters `TransferEvent` if one of the parties is an address registered in `packages/external/facilitators/`. The facilitator is the anchor: it settles the payment on the agent's behalf, and its address is public and stable.

This works because x402 puts an intermediary in the path. The agent doesn't pay the service directly — it pays through a facilitator that verifies and settles. That indirection leaves an attributable trace.

## The real question isn't "is it attributable"

Every payment on Stellar is a SAC transfer, and every SAC transfer is visible. Nothing is hidden. The question is whether you can **enumerate** a protocol's payments without already knowing who the participants are.

That reduces to one property of the anchor: **how many anchors are there, and who publishes them.**

| Protocol | Anchor | How many | Published? |
|---|---|---|---|
| x402 | Facilitator address | ~few per ecosystem, shared across all services | Yes — public registries |
| MPP Charge | The service's own receiving address | One per service, thousands potentially | **No** |
| MPP Channel | `one-way-channel` WASM hash | **One, protocol-wide** | Derivable on-chain |

This table is the finding. It inverts the intuition.

## x402: few anchors, shared

A registry of ~33 facilitator addresses covers the entire x402 ecosystem, because every service routes through one of them. That's why x402scan works, and why adding Stellar is a matter of registering two addresses rather than inventing anything.

## MPP Charge: many anchors, unpublished

MPP Charge settles direct SAC transfers between agent and service — no intermediary. But it does leave anchors:

- **The `recipient` address.** Every charge for a given service lands at the same `G…` account. Know the service, and you have all its revenue.
- **The transaction submitter.** In `mode: "pull"` (the default), the client signs auth entries and the *server* assembles and broadcasts. With `feePayer` configured, the service's account appears on-chain as the fee payer. `TransferEvent` already models this separately from the sender, in `transaction_from`.

<!-- VERIFY: confirm which account ends up as tx source / fee payer in pull mode
     both with and without feePayer configured. The recipient anchor holds
     either way; the submitter anchor is a bonus signal. -->

So a *single* MPP service is trivially indexable — the mechanism is identical to x402, just with a different address in the registry.

What you cannot do is enumerate **all** MPP Charge activity, because there is no directory of MPP services the way there is one of facilitators. Discovering the ecosystem would mean discovering every service that has ever accepted an MPP payment.

**This is a coordination problem, not a technical one.** It is solved by a registry existing, not by better indexing. That distinction matters: it means the fix is cheap and social, and someone should just build the registry.

## MPP Channel: one anchor, protocol-wide

Counterintuitively, the mode that settles *off-chain* is the most discoverable.

Each client deploys its own `one-way-channel` contract instance, so there's no single contract ID. But every instance is deployed from the same WASM, and therefore shares a **`wasm_hash`**. Querying for contract instances by that hash enumerates every MPP channel on the network — with no registry, no directory, no cooperation from anyone.

<!-- VERIFY: which Hubble table exposes contract instances and their wasm_hash.
     Candidates: contract_code, contract_data, history_contract_events. -->

The on-chain footprint per session is two transactions: the deposit and the `close()` that settles the cumulative total.

### But the semantics differ

Discoverable is not the same as measurable. A channel settlement of 5 USDC could be one payment or ten thousand — the micro-calls are off-chain commitments and never touch the ledger.

So channel-mode metrics answer different questions than transfer-mode metrics:

- "Volume" still works — the settled total is real.
- "Number of payments" does not. One settlement ≠ one payment.
- New metrics become possible and are arguably more interesting: micro-calls per settlement, cost per call, channel lifetime, deposit utilization.

Treating a channel settlement as one payment in the existing aggregations would silently undercount agentic activity by orders of magnitude.

## What this fork implements

Phase 1 covers **x402 via facilitator** — the model x402scan's architecture already supports.

<!-- TODO: if the MPP Charge spike landed, describe it here and be explicit that
     it covers one known service, not the MPP ecosystem. See STELLAR.md for the
     registry shortcut used. -->

## What comes next

1. **An MPP service registry.** The cheapest high-impact fix. Same shape as the facilitator registry, different anchor. Does not require changing x402scan's model — only populating it.
2. **Channel discovery by WASM hash.** Enumerate all channels, index deposits and closes.
3. **Channel-native metrics.** Micro-calls per settlement and cost per call, which no explorer reports today because no explorer indexes channels.

Items 2 and 3 are later-phase work, likely an SCF proposal. This document exists so whoever picks it up doesn't have to rediscover the problem.

---

<!-- TODO: links to MPP documentation, the one-way-channel contract source, and
     the x402 specs backing each claim. Without sources this is an opinion; with
     sources it's the project's contribution. -->
