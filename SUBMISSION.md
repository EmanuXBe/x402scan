# StellarScan

## Pitch

Stellar's busiest x402 seller has been dead for 79 days. It took 1,581 payments — 62% of every agentic payment on the chain — and 1,574 of them landed on a single day in May. Every dashboard that ranks sellers by volume still puts it first. StellarScan indexes all 2,540 agentic payments ever settled on Stellar mainnet, from the protocol's very first transaction, and shows which sellers are actually alive.

The data was never hidden — the tooling asked the wrong question. x402scan discovers services through `/.well-known/x402`, which no Stellar service publishes; Stellar uses SEP-1. We fixed the discovery model, resolved anonymous `G…` addresses to real companies, and are sending it upstream. Nothing is fabricated: every figure regenerates from public Horizon with one command. The narrative says agentic payments here are accelerating; the chain says 24 payments last week across three live sellers. Both can be true — but only one of them was measurable, and you cannot grow what you cannot see.

---

## Long form

**Stellar's busiest x402 seller has been dead for 79 days. Nothing on the network could tell you that.**

It took 1,581 payments — 62% of every agentic payment ever settled on Stellar. 1,574 of them landed on a single day, 2 May. Then silence.

Every dashboard that ranks sellers by volume still puts it first.

---

## The problem is not missing data. It is a missing question.

Stellar has 2,540 real x402 payments on mainnet. They are public, they are settled, and nobody was counting them.

Not because the data was hidden — because the tooling asked the wrong question. x402scan, the explorer the x402 ecosystem actually uses, discovers services through `/.well-known/x402` or `/openapi.json`. **No Stellar service publishes either.** Stellar publishes identity through SEP-1 `stellar.toml`, reached via the account's `home_domain`. Until this fork, `AcceptsNetwork` had no `stellar` value at all — registering a Stellar service was not difficult, it was _impossible_.

The result: a chain settling real agentic payments since March, invisible to the tool built to watch them.

## What we built

A Stellar adapter inside x402scan, running against mainnet.

- **2,540 payments indexed** — 37 buyers, 23 sellers, complete history
- **From transaction zero.** Our first indexed payment is 2026-03-06 16:51 UTC — 65 minutes after the OpenZeppelin facilitator plugin's launch commit that same day, and four days before Stellar announced it.
- **Service identity through SEP-1**, resolving anonymous `G…` addresses to real organisations: LOBSTR, Scopuly, Ultra Stellar, LumenBro
- **Liveness metrics** that separate a burst from a business
- **Zero fabricated data.** Every figure is mainnet, reproducible with `pnpm sync:once --chain stellar` against public Horizon, no credentials required.

## Three findings a Stellar builder can use tomorrow

**1. One address makes an entire chain observable.**
The facilitator registry holds 34 facilitators across 157 addresses. Base needs 31 of them. Stellar needed **one** — the OpenZeppelin Channels relayer. That ratio is the argument for intermediary-based protocols: they are cheap to observe. Protocols without an intermediary are not, and that is a design consequence nobody costed.

**2. Horizon indexes by sender, never by recipient.**
So submitter-anchored protocols like x402 get full history for free, while recipient-anchored ones return zero from `/accounts/{id}/payments`. Observing x402 costs $0. Observing MPP Charge costs a Hubble query or a self-hosted Galexie data lake — roughly $160/month and 3.8TB. Same chain. Same payments. Opposite economics.

**3. The highest-frequency agentic traffic is architecturally invisible.**
MPP Channel settles a whole session in two on-chain transactions: one deposit, one close. A channel carrying ten thousand payments is indistinguishable from one carrying three. So "there is no MPP traffic" is not a claim anyone can currently make — and the absence of evidence is manufactured by _where you look_. The one place it is visible is `contract_data`, filtered by the `one-way-channel` WASM hash. Not the events table. Channel commitments never emit events.

## Why you can trust the numbers

Every protocol claim cites the Stellar docs or the reference implementations — [MPP](https://developers.stellar.org/docs/build/agentic-payments/mpp), [the channel guide](https://developers.stellar.org/docs/build/agentic-payments/mpp/channel-guide), [the x402 facilitator](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar). Every on-chain figure comes from our own index and can be regenerated from a public endpoint.

We also checked the thing that would have broken us. The docs describe a "Built on Stellar x402 Facilitator" that reads like a second facilitator we were missing. It is not one — it points at `channels.openzeppelin.com/x402`, the same relayer already in our registry. As of 2026-08-05 Stellar mainnet has exactly one x402 facilitator, which is why the indexed history _is_ the history.

And one thing we deliberately did not do. We could have deployed our own MPP service, paid it from our own agent, and shipped "MPP supported ✓" with a real number on a real dashboard. It would have been technically true and would have measured nothing but ourselves. The gap is documented instead.

## What this is, precisely

A fork of [Merit-Systems/x402scan](https://github.com/Merit-Systems/x402scan) that adds Stellar. We disclose that everywhere, because the contribution is not the UI — it is the adapter, the identity resolution, the attribution model, and the findings. That work is separable, and it is going upstream as a pull request.

The bugs we found are mostly not Stellar-specific. `log_index` left NULL silently defeats a unique index, because Postgres treats NULLs as distinct — the constraint reads as enforced and protects nothing. That one bit us twice: first as 1,561 duplicated rows on a re-run, then again when a review of our own index found the same payment stored twice, three hours apart, because an early backfill script wrote local time while the adapter writes UTC. Neither copy violated the constraint. We re-indexed the whole chain from the adapter and every row now carries an ordinal.

That is the argument for the adapter being the only writer. A fixed `MIN_FACILITATOR_TRANSACTIONS = 100` hides any emerging chain by design, and affects every chain in the project.

## What the ecosystem gets

The narrative says agentic payments on Stellar are accelerating. The chain says 24 payments in the last seven days, across three live sellers and five buyers, with the all-time leader silent since May.

Both statements can be true — early markets look exactly like this. But only one of them was measurable before this fork, and you cannot grow what you cannot see.

The registry that would fix MPP discovery is not a research problem. It is a list that does not exist yet. Someone should build it.
