# Agentic payment attribution on Stellar

Why x402 on Stellar is indexable and MPP is not, under the attribution model x402scan uses today.

> **Status:** draft. Sections marked `<!-- VERIFY -->` need confirmation against documentation or code before publishing.

---

## x402scan's attribution model

x402scan doesn't observe payments — it observes token transfers and decides which ones *count* as agentic payments. The criterion is the **facilitator address**.

A transfer enters `TransferEvent` if one of the parties is an address registered in `packages/external/facilitators/`. The facilitator acts as the anchor: it's the entity that settles the payment on the agent's behalf, and its address is public and stable.

This works because x402 puts an intermediary in the path. The agent doesn't pay the service directly — it pays through a facilitator that verifies and settles. That indirection is what leaves an attributable trace.

## Why x402 on Stellar fits

Stellar has facilitators with identifiable addresses:

<!-- VERIFY: exact addresses, testnet and mainnet -->
- **OpenZeppelin Relayer** — <!-- TODO -->
- **Coinbase** (testnet, with sponsored fees) — <!-- TODO -->

Given that, indexing x402 on Stellar requires no new model. It requires registering addresses in a structure that already exists and writing the query that looks for them. That is exactly what this fork does.

## Why MPP doesn't fit

MPP (Machine Payments Protocol) **operates without an external facilitator**. In Charge mode, it settles direct SAC transfers between the agent and the service.

<!-- VERIFY against the official MPP documentation: confirm Charge mode involves
     no intermediary with a stable address -->

With no intermediary, there is no anchor. And with no anchor, **an MPP payment is indistinguishable from any other token transfer on the network.** There is no field, event, or counterparty that lets you look at the chain and say "this was an agentic payment."

This is the real reason Stellar is absent from agentic-payments observability tooling. It isn't that nobody sat down to write the adapter: it's that for half of Stellar's agentic traffic, the adapter *cannot be written* under the current attribution model.

## The exception: session mode

MPP's Channel mode does leave a trace. The `one-way-channel` contract has an **identifiable contract ID**, and channel opens and closes are observable on-chain events.

<!-- VERIFY: one-way-channel contract ID on testnet/mainnet, and which events it emits -->

That opens attribution **by contract instead of by address**. It's a change of model, not an extension of the current one: instead of asking "did this transfer touch a known facilitator?", you ask "did it originate from a known channel contract?"

### What would change in x402scan

A contract-based model wouldn't replace the facilitator one — they'd coexist. The touch points:

- `Facilitator.addresses` assumes addresses. A parallel concept of *anchor contracts* would be needed.
- Channel attribution measures something different: one channel settlement represents N micro-calls, not one. Volume and "number of payments" stop being the same question.
- Metrics that don't exist today: micro-calls per settlement, cost per call, channel duration.

<!-- TODO: if time allows, a paragraph on what the schema would look like.
     If not, leave as is — the diagnosis stands on its own. -->

## Consequence

Covering agentic payments on Stellar in full requires two attribution models, not one. This fork delivers the first — x402 via facilitator — which is the one x402scan's current architecture already supports.

The second, contract-based attribution for MPP in session mode, is later-phase work and likely an SCF proposal. This document exists so whoever picks it up doesn't have to rediscover the problem.

---

<!-- TODO: links to the MPP documentation, the one-way-channel contract, and the
     x402 specs backing each claim. Without sources this is an opinion; with
     sources it's the project's contribution. -->
