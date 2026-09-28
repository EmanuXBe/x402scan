# Agentic payment attribution on Stellar

Why x402 is indexed today, what it takes to index MPP, and why the hard part isn't cryptographic.

> **Status:** claims are sourced. Protocol mechanics cite the Stellar docs and the MPP/x402 reference implementations; on-chain figures come from this fork's own mainnet index and are reproducible. See [Sources](#sources).

---

## x402scan's attribution model

x402scan doesn't observe payments — it observes token transfers and decides which ones _count_ as agentic payments. The criterion is the **facilitator address**.

A transfer enters `TransferEvent` if one of the parties is an address registered in `packages/external/facilitators/`. The facilitator is the anchor: it settles the payment on the agent's behalf, and its address is public and stable.

This works because x402 puts an intermediary in the path. The agent doesn't pay the service directly — it pays through a facilitator that verifies and settles. That indirection leaves an attributable trace.

## The real question isn't "is it attributable"

Every payment on Stellar is a SAC transfer, and every SAC transfer is visible. Nothing is hidden. The question is whether you can **enumerate** a protocol's payments without already knowing who the participants are.

That reduces to one property of the anchor: **how many anchors are there, and who publishes them.**

| Protocol    | Anchor                              | How many                                       | Published?              |
| ----------- | ----------------------------------- | ---------------------------------------------- | ----------------------- |
| x402        | Facilitator address                 | ~few per ecosystem, shared across all services | Yes — public registries |
| MPP Charge  | The service's own receiving address | One per service, thousands potentially         | **No**                  |
| MPP Channel | `one-way-channel` WASM hash         | **One, protocol-wide**                         | Derivable on-chain      |

This table is the finding. It inverts the intuition.

## x402: few anchors, shared

A registry of 34 facilitators — 157 addresses across Base, Solana, Polygon and Stellar — covers the entire x402 ecosystem, because every service routes through one of them. That's why x402scan works.

Stellar needed exactly **one** of those 157: the OpenZeppelin Channels relayer. One address, and the whole chain becomes observable. Nothing was invented; the ratio is the argument. Compare that with the 31 addresses Base requires, and the leverage of an intermediary-based protocol is hard to miss.

## MPP Charge: many anchors, unpublished

MPP Charge settles direct SAC transfers between agent and service — no intermediary. But it does leave anchors:

- **The `recipient` address.** Every charge for a given service lands at the same `G…` account. Know the service, and you have all its revenue.
- **The transaction submitter.** In `mode: "pull"` (the default), the client signs auth entries and the _server_ assembles and broadcasts. With `feePayer` configured, the service's account appears on-chain as the fee payer. `TransferEvent` already models this separately from the sender, in `transaction_from`.

  Confirmed against the protocol's own documentation: `mode: "pull"` is described as "client signs auth entries, server assembles + broadcasts", and it is the mode to use precisely when the client has no XLM, with `feePayer` configured server-side. Without `feePayer` the client must submit and hold XLM itself (`mode: "push"`), which moves the submitter anchor back to the payer. Either way the **recipient anchor holds** — it is the submitter anchor that varies with configuration, so it is a bonus signal and never the primary one.

So a _single_ MPP service is trivially indexable — the mechanism is identical to x402, just with a different address in the registry.

What you cannot do is enumerate **all** MPP Charge activity, because there is no directory of MPP services the way there is one of facilitators. Discovering the ecosystem would mean discovering every service that has ever accepted an MPP payment.

**This is a coordination problem, not a technical one.** It is solved by a registry existing, not by better indexing. That distinction matters: it means the fix is cheap and social, and someone should just build the registry.

## MPP Channel: one anchor, protocol-wide

Counterintuitively, the mode that settles _off-chain_ is the most discoverable.

Each client deploys its own `one-way-channel` contract instance, so there's no single contract ID. But every instance is deployed from the same WASM, and therefore shares a **`wasm_hash`**. Querying for contract instances by that hash enumerates every MPP channel on the network — with no registry, no directory, no cooperation from anyone.

The tables are Hubble's **state** tables, not its history ones — `contract_data` and `contract_code` both appear in the [state table list](https://developers.stellar.org/docs/data/analytics/hubble/analyst-guide/history-vs-state-tables#list-of-state-tables). The split matters: a contract _instance_ is a `contract_data` entry whose executable carries the `wasm_hash`, while `contract_code` holds the WASM binary keyed by that hash. So enumeration is `contract_data` filtered on the hash, and `contract_code` is only how you obtain the hash in the first place. `history_contract_events` — the intuitive guess — is the wrong table: channel commitments are off-chain and emit no events.

The same resolution works without Hubble, straight from a contract ID: read the instance ledger entry and take `.contractData().val().instance().executable().wasmHash()` ([official guide](https://developers.stellar.org/docs/build/guides/rpc/retrieve-contract-code-js)). That is the per-contract lookup; Hubble is what makes it a network-wide sweep.

The on-chain footprint per session is two transactions: the deposit and the `close()` that settles the cumulative total. This is stated by the protocol's own channel guide — the funder deposits, the session runs off-chain, and one settlement closes it.

### But the semantics differ

Discoverable is not the same as measurable. A channel settlement of 5 USDC could be one payment or ten thousand — the micro-calls are off-chain commitments and never touch the ledger.

So channel-mode metrics answer different questions than transfer-mode metrics:

- "Volume" still works — the settled total is real.
- "Number of payments" does not. One settlement ≠ one payment.
- New metrics become possible and are arguably more interesting: micro-calls per settlement, cost per call, channel lifetime, deposit utilization.

Treating a channel settlement as one payment in the existing aggregations would silently undercount agentic activity by orders of magnitude.

## What this fork implements

Phase 1 covers **x402 via facilitator** — the model x402scan's architecture already supports. One facilitator is registered for Stellar, and the sync adapter runs against it.

**The MPP Charge spike did not land, and the reason is the finding rather than a shortfall.** Registering an MPP service requires knowing its receiving address, and there is no directory to read one from — which is precisely the "many anchors, unpublished" problem above. We found no MPP Charge traffic to attribute on mainnet either. Rather than register a service of our own and present self-generated traffic as ecosystem coverage, the fork ships the x402 path and documents what indexing MPP would take.

That decision is worth stating plainly because the alternative was available and would have looked better: deploying one MPP service, paying it from our own agent, and reporting the result as MPP support. It would have been one address in a registry and a real number on a dashboard. It would also have measured nothing but ourselves.

**One completeness check did land.** The Stellar docs describe a "[Built on Stellar x402 Facilitator](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar)", which reads as a second facilitator we might be missing. It is not one: the docs point at `channels.openzeppelin.com/x402` and describe it as the OpenZeppelin Relayer running the x402 Facilitator Plugin. It is the same facilitator under a different name, already in our registry. As of 2026-08-05 there is one x402 facilitator on Stellar mainnet, so the indexed history is the complete history.

## What comes next

1. **An MPP service registry.** The cheapest high-impact fix. Same shape as the facilitator registry, different anchor. Does not require changing x402scan's model — only populating it.
2. **Channel discovery by WASM hash.** Enumerate all channels, index deposits and closes.
3. **Channel-native metrics.** Micro-calls per settlement and cost per call, which no explorer reports today because no explorer indexes channels.

Items 2 and 3 are later-phase work, likely an SCF proposal. This document exists so whoever picks it up doesn't have to rediscover the problem.

---

## Sources

Every claim above about protocol mechanics comes from the protocols' own documentation, not from inference. Checked 2026-08-05.

**MPP**

- [MPP on Stellar](https://developers.stellar.org/docs/build/agentic-payments/mpp) — protocol overview and the `one-way-channel` contract link
- [Channel guide](https://developers.stellar.org/docs/build/agentic-payments/mpp/channel-guide) — deposit → off-chain commitments → `close()`; the session intent is a one-way payment channel Soroban contract
- [Charge guide](https://developers.stellar.org/docs/build/agentic-payments/mpp/charge-guide) — per-request SAC settlement, `pull`/`push` modes, `feePayer`
- [`stellar/stellar-mpp-sdk`](https://github.com/stellar/stellar-mpp-sdk) — reference implementation and channel deployment scripts

**x402**

- [Agentic payments on Stellar](https://developers.stellar.org/docs/build/agentic-payments) — where x402 and MPP sit relative to each other
- [Built on Stellar x402 Facilitator](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar) — `/verify`, `/settle`, `/supported`; `exact-v2`; settlement via OpenZeppelin Relayer
- [`OpenZeppelin/relayer-plugin-x402-facilitator`](https://github.com/OpenZeppelin/relayer-plugin-x402-facilitator) — the facilitator plugin itself

**Chain data**

- [Hubble history vs state tables](https://developers.stellar.org/docs/data/analytics/hubble/analyst-guide/history-vs-state-tables#list-of-state-tables) — `contract_data` and `contract_code` are state tables
- [Retrieving contract code](https://developers.stellar.org/docs/build/guides/rpc/retrieve-contract-code-js) — instance → executable → `wasmHash`

**On-chain observations** in this document come from the fork's own index of Stellar mainnet, built by `sync/transfers/trigger/chains/stellar/soroban/`. They are reproducible: the adapter reads public Horizon, needs no credentials, and can be re-run with `pnpm sync:once --chain stellar`.
