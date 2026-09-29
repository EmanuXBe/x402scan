# StellarScan roadmap

Last updated: 2026-09-29. Owner: Emanuel Benavides ([@EmanuXBe](https://github.com/EmanuXBe)).

This is the single place to understand where StellarScan stands, what we know, what we decided and what comes next. Work items live in [GitHub issues](https://github.com/EmanuXBe/x402scan/issues); this document explains how they fit together.

## Contents

1. [What StellarScan is](#1-what-stellarscan-is)
2. [Where things stand](#2-where-things-stand)
3. [What the evidence says](#3-what-the-evidence-says)
4. [Decisions](#4-decisions)
5. [Workstreams and milestones](#5-workstreams-and-milestones)
6. [Upstream strategy](#6-upstream-strategy)
7. [Team and roles](#7-team-and-roles)
8. [Open questions](#8-open-questions)
9. [Kickoff checklist](#9-kickoff-checklist)

---

## 1. What StellarScan is

A fork of [Merit-Systems/x402scan](https://github.com/Merit-Systems/x402scan), the explorer the x402 ecosystem uses, that adds Stellar. It indexes agentic payments (x402 and MPP) settled on Stellar mainnet and shows who is actually active.

It started at the Stellar Summit São Paulo hackathon (August 2026; the original PRD and sprint plan are in [`docs/archive/hackathon-2026-08/`](archive/hackathon-2026-08/)). The goals now:

1. **Be the trustworthy source** for agentic payment activity on Stellar: nothing lost, every figure dated and reproducible.
2. **Upstream Stellar support** to Merit-Systems/x402scan, so the ecosystem's main explorer sees Stellar.
3. **Serve the people already asking for it** in the Stellar #x402 channel.

Deployment: https://app-production-49b7.up.railway.app

## 2. Where things stand

As of 2026-09-29.

| Area          | State                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexer       | Indexes OpenZeppelin Channels settlements from public Horizon. A bug that silently dropped payments on Horizon errors is fixed in [#11](https://github.com/EmanuXBe/x402scan/pull/11), pending merge                  |
| Coverage      | OZ Channels only. The MPP Router and self-hosted facilitators are not indexed ([#7](https://github.com/EmanuXBe/x402scan/issues/7), [#12](https://github.com/EmanuXBe/x402scan/issues/12))                            |
| Public claims | Several are wrong or stale ([#3](https://github.com/EmanuXBe/x402scan/issues/3), [#9](https://github.com/EmanuXBe/x402scan/issues/9), [#13](https://github.com/EmanuXBe/x402scan/issues/13)). Fix before any outreach |
| Upstream      | Nothing sent yet. The env flags PR is ready locally; the proposal issue is drafted ([`docs/outreach/`](outreach/))                                                                                                    |
| Repo          | This is a GitHub fork. Deciding its home is the first kickoff item ([#17](https://github.com/EmanuXBe/x402scan/issues/17))                                                                                            |

## 3. What the evidence says

Every figure below has a date and a reproducible source. Snapshots live in [`docs/data/`](data/); the scripts in [`scripts/audit/`](../scripts/audit/).

### 3.1 On-chain audits (2026-09-29, public Horizon, read only)

**OpenZeppelin Channels**, anchored on `GA5SXMFJTUPTZRIEKM6XZLCYOZRMUEE6KGAHL3GXDBG64DYOUIWYIF3M`:

|                  | Value                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| USDC payments    | 2,572 since 2026-03-06 16:51 UTC                                                                     |
| Buyers / sellers | 41 / 25                                                                                              |
| Volume           | 7.95 USDC                                                                                            |
| Last 7 / 30 days | 13 / 26 payments                                                                                     |
| Top seller       | `GB3Y…54CV`: 1,581 payments (61.5%), 1,574 of them on 2026-05-02, silent since 2026-05-18            |
| Anchor role      | Fee-bump payer on 2,576 of its 2,640 transactions; inner sources are 1,162 distinct channel accounts |

**ROZO's MPP Router**, payTo `GDK3AVW3YE6UL3J4WLNKBMP65KSY32YPUKIOC6PXW65XJ3LEG3YIDXXB`:

|                             | Value                                                               |
| --------------------------- | ------------------------------------------------------------------- |
| Inbound USDC transfers      | 1,046, from 2026-04-10 to 2026-09-29 (still active)                 |
| Payers                      | 27 (some are ROZO test wallets, per the Discord)                    |
| Volume                      | 38.85 USDC, almost 5x OZ Channels                                   |
| Settled through OZ Channels | 0, so none of it is in the index                                    |
| Fee payer                   | `GB5LCXFTBHXJ32XQBHX4EQKQPCHZRHU3XXHHN54QE3O3QTAN6RQZ3XEE` on 1,035 |

### 3.2 How Horizon behaves (verified, and it drives the design)

- **Recipients are participants, fee-bump payers are not.** `/accounts/{payTo}/operations` returned the MPP Router's full history in 7 requests. `/accounts/{relayer}/operations` returns 64 operations and zero payments for OZ Channels, because the relayer only pays the fee. So recipient anchors are cheap, and facilitator anchors cost one request per transaction (2,654 for a full OZ backfill) ([#5](https://github.com/EmanuXBe/x402scan/issues/5), [#7](https://github.com/EmanuXBe/x402scan/issues/7)).
- **Public Horizon keeps one year** of history since 2024-08-01 ([docs](https://developers.stellar.org/docs/data/apis/horizon)). OZ history starts 2026-03-06, so a cold backfill from public Horizon is complete until 2027-03-06 ([#3](https://github.com/EmanuXBe/x402scan/issues/3)).
- **Rate limit:** the documented default is 3,600 requests per hour per IP.
- **Hubble** (`crypto-stellar.crypto_stellar` on BigQuery) has full history and no rate limit, and Merit already runs a BigQuery provider.

### 3.3 The Stellar #x402 Discord (March to September 2026)

Read up to 2026-09-01. What it changes:

- **There is more than one facilitator.** ASG Card and ROZO run their own; VELLAR is building one. AgentPay pays with a classic `payment` plus memo, which our `invoke_host_function` filter drops by design ([#12](https://github.com/EmanuXBe/x402scan/issues/12)).
- **MPP traffic exists** (the MPP Router above), which contradicts our docs ([#13](https://github.com/EmanuXBe/x402scan/issues/13)).
- **Registries exist in part:** MPP Router (about 480 charge services), `trionlabs/awesome-stellar-ai` (`evidence.json`), Stellar 8004 (identity registry on mainnet), CDP and Binance Bazaars ([#14](https://github.com/EmanuXBe/x402scan/issues/14)).
- **A natural partner:** Arturofrrdiz's x402-observatory anchors on payTo; we anchor on facilitators ([#16](https://github.com/EmanuXBe/x402scan/issues/16)).
- **People are asking for us:** Shawn (ROZO) asked for a Stellar x402 and MPP dashboard and how to get indexed; Biconze asked what is live ([#15](https://github.com/EmanuXBe/x402scan/issues/15)).

### 3.4 Upstream (Merit-Systems/x402scan, checked 2026-09-29)

- A Stellar facilitator PR ([#740](https://github.com/Merit-Systems/x402scan/pull/740), OZ Channels) was closed without comment, likely because Stellar is not a supported chain.
- PRs adding chains sit unreviewed (XDC [#1001](https://github.com/Merit-Systems/x402scan/pull/1001) since June, Polygon [#1013](https://github.com/Merit-Systems/x402scan/pull/1013) since July). Small facilitator PRs on existing chains do get merged.
- In August and September Merit removed UI surfaces and invested in the indexer (Solana channels, sync state, sync tests in CI). Indexing is what fits.
- Polygon and Optimism sit in the `Chain` enum but outside `SUPPORTED_CHAINS`: the precedent for Stellar.
- A maintainer hit the `REDIS_DISABLE` parsing bug in [#1196](https://github.com/Merit-Systems/x402scan/pull/1196). Our first PR fixes it.
- Their README says Apache 2.0, but there is no LICENSE file.

## 4. Decisions

| #   | Decision                                                   | Why                                                                         | Date       |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| D1  | Propose upstream through an issue first, then small PRs    | Chain PRs sit unreviewed; a proposal lets Merit choose scope                | 2026-09-29 |
| D2  | Upstream PR 1 is indexing only, with no schema change      | `AcceptsNetwork` needs a scan DB migration; mixing it in slows both         | 2026-09-29 |
| D3  | Merit chooses the upstream data source (Horizon or Hubble) | They run the ops; Hubble fits their BigQuery provider                       | 2026-09-29 |
| D4  | Use the shared sync state (`useSyncState`) for Stellar     | It already exists here and upstream; less custom code to review             | 2026-09-29 |
| D5  | Keep and rebuild the recipient path on Horizon operations  | It reaches MPP traffic cheaply; this reverses the earlier plan to delete it | 2026-09-29 |
| D6  | Every public figure carries a date, a source and a method  | A relative figure ("dead for 80 days") went stale and wrong within weeks    | 2026-09-29 |
| D7  | Everything in the repo and every public post is in English | International team and audience                                             | 2026-09-29 |

## 5. Workstreams and milestones

Four areas, each with a label: `area: indexer`, `area: docs`, `area: upstream`, `area: ecosystem` (plus `area: meta`).

### M1 · Trustworthy index (do first)

The index loses nothing, reaches the anchors it can see today, and every claim is correct.

| Issue                                                                                                                                                           | What                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [#2](https://github.com/EmanuXBe/x402scan/issues/2) / [#11](https://github.com/EmanuXBe/x402scan/pull/11)                                                       | Stop dropping payments on Horizon errors (PR ready) |
| [#7](https://github.com/EmanuXBe/x402scan/issues/7)                                                                                                             | Index the MPP Router through the recipient anchor   |
| [#4](https://github.com/EmanuXBe/x402scan/issues/4)                                                                                                             | Use the shared sync state                           |
| [#6](https://github.com/EmanuXBe/x402scan/issues/6)                                                                                                             | Rename the adapter to Horizon                       |
| [#8](https://github.com/EmanuXBe/x402scan/issues/8)                                                                                                             | Unit tests for the transform                        |
| [#3](https://github.com/EmanuXBe/x402scan/issues/3), [#9](https://github.com/EmanuXBe/x402scan/issues/9), [#13](https://github.com/EmanuXBe/x402scan/issues/13) | Fix docs, figures and contradicted claims           |
| [#18](https://github.com/EmanuXBe/x402scan/issues/18)                                                                                                           | Make `pnpm check` pass on `main` (knip)             |

### M2 · Upstream proposal

| Issue                                                 | What                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| [#10](https://github.com/EmanuXBe/x402scan/issues/10) | Tracking: env flags PR, proposal issue, OpenZeppelin question |
| [#15](https://github.com/EmanuXBe/x402scan/issues/15) | Answer the open asks in the #x402 channel (after M1)          |

### M3 · Full Stellar coverage

| Issue                                                 | What                                               |
| ----------------------------------------------------- | -------------------------------------------------- |
| [#12](https://github.com/EmanuXBe/x402scan/issues/12) | Self-hosted facilitators and classic memo payments |
| [#14](https://github.com/EmanuXBe/x402scan/issues/14) | Registries for discovery and identity              |
| [#16](https://github.com/EmanuXBe/x402scan/issues/16) | Partnership with x402-observatory                  |

### M4 · Upstream PRs

Shaped by Merit's answer to the proposal. [#5](https://github.com/EmanuXBe/x402scan/issues/5) (Horizon vs Hubble) is decided here.

### Order

M1 and the env flags PR run in parallel. The proposal issue goes out once M1's claim fixes land, because it links to this repo. Discord outreach waits for the MPP Router to be indexed, or we would undercount ROZO's traffic in front of ROZO.

## 6. Upstream strategy

| Step | Content                                                                                                                                                                                                           | State                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | Env flags PR: `REDIS_DISABLE` and `HIDE_TRPC_LOGS` parsed with `z.stringbool()`                                                                                                                                   | Committed locally on `fix/env-boolean-flags`                                     |
| 2    | Proposal issue                                                                                                                                                                                                    | Drafted: [`merit-proposal-issue.md`](outreach/merit-proposal-issue.md)           |
| 3    | OpenZeppelin: is the fund account stable?                                                                                                                                                                         | Drafted: [`openzeppelin-fund-account.md`](outreach/openzeppelin-fund-account.md) |
| 4    | PR 1: `Chain.STELLAR` (outside `SUPPORTED_CHAINS`), `Network.STELLAR` with OZ Channels, `normalizeAddress` keeping Stellar case, `EvmChain` excluding Stellar, sync state, tests, and the data source Merit picks | After Merit answers                                                              |
| 5    | PR 2: `stellar` in `AcceptsNetwork` with its migration                                                                                                                                                            | After PR 1                                                                       |
| 6    | PR 3: SEP-1 seller attribution, framed as attribution rather than discovery                                                                                                                                       | Only if Merit wants it                                                           |

Rules for upstream work:

- Branch from `upstream/main` in a separate worktree (see [CONTRIBUTING.md](../CONTRIBUTING.md#upstream-work)). The old `upstream-pr` branch is stale: 59 commits behind with 16 conflicts.
- Upstream uses pnpm 11 and runs `pnpm check` (format, types, oxlint, knip, tests). Run it before any push.
- Follow their patterns: `buildQuery` returns a query string, a provider module runs it, and `transformResponse` maps rows. The fork's Horizon adapter makes HTTP calls inside the fetch layer and needs reshaping.
- If Merit declines, StellarScan continues as its own product and the proposal stays as a public record.

## 7. Team and roles

| Person                                                       | Role                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Emanuel Benavides ([@EmanuXBe](https://github.com/EmanuXBe)) | Product and ecosystem lead: priorities, outreach, public claims   |
| Collaborator (to confirm)                                    | Suggested: **indexer lead** (M1 indexer issues, #12)              |
| Collaborator (to confirm)                                    | Suggested: **data and upstream lead** (#5, the upstream PRs, #14) |

The split is a suggestion for the kickoff, not an assignment.

## 8. Open questions

| Question                                                       | Who answers  | Tracked in                                            |
| -------------------------------------------------------------- | ------------ | ----------------------------------------------------- |
| Is the OZ Channels fund account stable, and is there only one? | OpenZeppelin | [#10](https://github.com/EmanuXBe/x402scan/issues/10) |
| Horizon or Hubble for upstream?                                | Merit        | [#5](https://github.com/EmanuXBe/x402scan/issues/5)   |
| Do classic `payment` plus memo settlements count as x402?      | Us           | [#12](https://github.com/EmanuXBe/x402scan/issues/12) |
| How do we exclude test wallets, and do we publish the rule?    | Us           | [#7](https://github.com/EmanuXBe/x402scan/issues/7)   |
| Detach the fork, move to an organization, or both?             | Us           | [#17](https://github.com/EmanuXBe/x402scan/issues/17) |
| Will Merit add a LICENSE file matching the Apache 2.0 badge?   | Merit        | Proposal issue                                        |

## 9. Kickoff checklist

1. Read this document, then [`docs/STELLAR.md`](STELLAR.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
2. Decide the repo home ([#17](https://github.com/EmanuXBe/x402scan/issues/17)) and grant access.
3. Confirm roles (section 7).
4. Review and merge [#11](https://github.com/EmanuXBe/x402scan/pull/11).
5. Run `pnpm check` locally. It fails on `main` today for known reasons ([#18](https://github.com/EmanuXBe/x402scan/issues/18)); fixing that is a good first issue.
6. Pick M1 issues and assign them.
7. Agree on a weekly sync and where async discussion happens (issues first).
