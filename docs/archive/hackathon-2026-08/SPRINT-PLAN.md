# Sprint Plan — StellarScan

2 people · ~36 usable hours (Aug 4 afternoon → Aug 5 night) · Parent doc: [PRD.md](PRD.md)

---

## Status — Aug 4

**Blocks A and B are DONE. C is code-complete, blocked on data.**

Scanner runs locally (home, /facilitators, /resources → 200). Both packages typecheck clean: `@x402scan/app` 0 errors, `@x402scan/sync-transfers` 0 errors.

Landed:
- Local dev without paid accounts: `pg` fallback in both DB clients, TimescaleDB container, FDW migration workaround, CDP/wagmi guards, Redis.
- `Network.STELLAR`, `USDC_STELLAR_TOKEN` (7 decimals), `openzeppelinFacilitator`, `stellarFacilitators` list.
- `Chain.STELLAR` + **`WALLET_CHAINS` split from `SUPPORTED_CHAINS`** — the whole cascade resolved through this one distinction. Every wallet/onramp/resource-fetch surface now keys on `WalletChain`; only read/analytics sees Stellar.
- `StellarAddress` branded type + `stellarAddressSchema` (`/^[GC][A-Z2-7]{55}$/`).
- `normalizeAddress` case-sensitivity fix (B-7).
- Prisma `AcceptsNetwork` + `stellar`/`stellar_testnet`, migration applied.
- **`QueryProvider.HORIZON`** + `fetch/soroban/fetch.ts` + `chains/stellar/soroban/{config,query,sync}.ts`.

**Data-source decision (supersedes the Hubble-first plan):** Hubble needs Google Cloud credentials we don't have, and it only covers **mainnet**. Soroban RPC `getEvents` needs **no credentials**, and a probe against mainnet decoded **2,399 USDC SAC transfers in ~22h, 43% of them ≤1 USDC**. Since our own demo traffic will be on testnet — which Hubble does not cover at all — RPC is the correct primary source. Hubble stays documented as the deep-history path.

**Facilitator discovery — empirical, not by asking.** The x402 SDK ships no relayer addresses (only the two USDC SAC ids). The relayer is discoverable as the **transaction source account** on a settlement, which `fetch/soroban/fetch.ts` already resolves. Probing mainnet found no x402 facilitator: the top repeat submitter (`GAUA7XL5…`) sponsors 3.8M accounts with a multisig coordinator — a wallet provider, not a facilitator. **Conclusion: x402 on Stellar mainnet is not live yet.** Testnet + our own traffic is the honest demo, and the relayer address falls out of our first settlement.

**Remaining blockers — two manual web steps (captcha/auth forms, cannot be scripted):**
1. Fund payer with testnet USDC: https://faucet.circle.com → `GAEMU5YIKFSL6DLIGBIU3LSEQ76VGB6GR2KRUGI6E2NNOH2QLITK2IWI`
2. OZ Channels testnet key: https://channels.openzeppelin.com/testnet/gen

Testnet accounts are already created and funded with XLM, both carrying USDC trustlines. Keys in the scratchpad `.env.testnet`.

## ★ Gate C-5 PASSED — Aug 5

**1,561 real x402 payments from Stellar mainnet are indexed in `TransferEvent`.** Not our own demo traffic — live ecosystem activity nobody had ever surfaced.

| | |
|---|---|
| Facilitator relayer | `GA5SXMFJTUPTZRIEKM6XZLCYOZRMUEE6KGAHL3GXDBG64DYOUIWYIF3M` |
| Transfers indexed | 1,561 across 1,600 relayer transactions |
| Range | 2026-05-02 → 2026-08-05 (relayer live since **2026-03-06**) |
| Volume | 3.9234 USDC |
| Payment size | min 0.0001 · **median 0.001** · max 0.1 USDC |
| Participants | 11 buyers, 9 sellers |

A median payment of **one tenth of a cent** is the finding. This is a machine-scale micropayment economy running in production on Stellar mainnet, invisible to every explorer.

**A-6 solved by the API, not by asking.** An authenticated `GET /x402/supported` returns `signers["stellar:pubnet"]` — the facilitator publishes its own relayer address. No SDF outreach needed.

**Budget impact: zero.** Funding accounts to generate demo traffic is no longer necessary. Real data exists.

## MPP — capability built, no mainnet traffic yet

A mainnet sweep of contract-invocation USDC transfers found **no MPP activity**. Every non-x402 flow lands at `C…` contract addresses in the hundreds-to-thousands of USDC with **0% micropayments** — AMMs and lending pools, not agentic payments. The micropayment signature belongs exclusively to the x402 facilitator.

That is itself a finding: **x402 via OZ Channels is currently the only agentic payment protocol with live mainnet traffic on Stellar.**

### The sharper thesis: an indexing asymmetry, not just a missing registry

Discovery hit a hard infrastructure limit that reframes the whole attribution argument.

| | x402 | MPP Charge |
|---|---|---|
| Anchor | Submitter (relayer) | Recipient (service) |
| Horizon index | `/accounts/{id}/transactions` — **full history** | none — `/payments` returns **0** for contract transfers |
| Fallback | not needed | scan contract events, **~24h RPC retention** |

Horizon keys transactions by source account, so submitter-anchored protocols get complete history from one paginated query. It does **not** index contract transfers by receiving account, so recipient-anchored protocols can only be discovered by scanning events inside the RPC retention window.

So it isn't merely that no directory of MPP services exists. **Stellar's own indexing infrastructure makes submitter-anchored protocols cheap to observe and recipient-anchored ones expensive** — regardless of who publishes what. Any explorer that wants MPP coverage has to run its own event archive.

Both anchor modes are implemented: `AttributionAnchor = 'submitter' | 'recipient'` on `FacilitatorAddress`, dispatched in `fetch/soroban/fetch.ts`. Registering an MPP service is now a data change, not a code change.

## Decisions — Aug 5

| Decision | Choice |
|---|---|
| Network | **Mainnet.** OZ Channels facilitator is free on both networks; mainnet key via GitHub OAuth at [channels.openzeppelin.com/gen](https://channels.openzeppelin.com/gen). Cost is ~3 XLM of reserves + $1–2 USDC |
| Data | **100% real.** No fabricated rows anywhere, including Base/Solana — pull real transfers from a free source rather than seeding |
| Artifact | **The x402scan fork**, framed as a Stellar adapter demonstrated inside x402scan |
| Composability | **Integrate existing Stellar protocols**, not just be composable |

### Originality risk — accepted, mitigated

The rules state **"All submissions must be 100% original work."** Submitting a fork carries a real risk that a strict judge reads it as someone else's product. This was raised and the call was made to proceed with the fork. Mitigations, all mandatory:

1. **The original work is separable and must be presented as such.** Nothing below existed anywhere before this project: the Soroban SAC event decoder, the RPC fetcher, relayer discovery by transaction source account, the attribution framework, and the protocol integrations. The upstream PR makes the boundary literal — the diff *is* the work.
2. **Disclose the fork everywhere** — README, demo, submission form. Concealment is what actually disqualifies.
3. **Lead with what's new, not with the app.** The demo opens on the attribution finding and the first x402 payments on Stellar mainnet, not on a tour of x402scan's UI.

### Composability — integrate, don't just expose

Judges want integration with existing Stellar protocols (Trustless Work, DeFindex, Caatinga), which is stronger than merely being composable. The natural fit is **the attribution framework itself** — every protocol is another anchor type:

| Protocol | Anchor | Same code path? |
|---|---|---|
| x402 | Facilitator relayer address | Built |
| MPP Charge | Service receiving address | Built |
| MPP Channel | `one-way-channel` WASM hash | Same technique |
| **Trustless Work** | **Escrow contract WASM hash** | **Same technique** |

Trustless Work escrows are Soroban contracts deployed from a shared WASM, so the exact discovery method built for MPP channels enumerates them. Agent-pays-into-escrow-released-on-delivery is a real agentic payment pattern x402 cannot express — this extends the thesis rather than decorating it.

**DeFindex** is the follow-the-money layer: a seller earning USDC from agentic payments has idle capital. Showing revenue flowing into DeFindex vaults makes the explorer the only place the full path is visible — payment in, escrow, yield.

Secondary (free, no paywall): the indexer as a reusable open package, a free MCP server, and a public read API.

**Open question:** Caatinga returns nothing in search — need a link before scoping it.

## Verified technical constraints

Facts measured against the code. They are load-bearing — the tickets assume them.

0. **Why Stellar was never integrated — now with evidence.** Upstream pins `x402@0.6.6`, the pre-v2 SDK line; Stellar support lives in the `@x402/*` v2 packages (`@x402/stellar`, exact-v2 scheme, OZ Channels facilitator). Their tooling predates Stellar's x402 support. Also: the scan DB's `AcceptsNetwork` enum (11 networks, no Stellar) shows the *resources* side needs a scan-DB migration eventually — but the *transfers/dashboard* side needs none.

0b. **Amount convention (supersedes the naive "7 decimals" warning).** `TransferEvent.amount` is 6-decimal base units on every chain: ingest multiplies human units by `USDC_MULTIPLIER = 1_000_000`, Timescale MVs `SUM(amount)` raw grouped by `(facilitator_id, chain)`, and the UI hardcodes `decimals = 6` (`lib/token.ts:21`). B-2/C-3 rule: divide Stellar raw by `1e7`, multiply by `USDC_MULTIPLIER`. The MV chain-grouping also means Stellar rows reach every dashboard aggregate automatically.

1. **Stellar goes into the read path, not the wallet path.** `Chain.SOLANA` appears in 49 files, nearly all wallet/onramp/withdraw — out of scope. We split `WALLET_CHAINS` from `SUPPORTED_CHAINS` (ticket B-6). Without that one line, the change leaks into 40+ files and the sprint dies. The `EvmChain` cascade itself is minor: 7 files, 13 references.

2. **Hubble needs no new `QueryProvider`.** [fetch/bigquery/fetch.ts](sync/transfers/trigger/fetch/bigquery/fetch.ts) is generic — the dataset lives inside the SQL string returned by `buildQuery`. Hubble is just another BigQuery dataset. We reuse `QueryProvider.BIGQUERY`; the adapter is two new files.

3. **`normalizeAddress` corrupts Stellar addresses.** [sync.ts:17](sync/transfers/trigger/sync.ts#L17) lowercases everything that isn't Solana; Stellar addresses are case-sensitive base32. It feeds the sync state key → the cursor would never match and the sync would re-query the same window forever. Ticket B-7.

4. **The template adapter is switched off.** `solana/bigquery/config.ts` has `enabled: false`; the live path is bitquery. It may be bit-rotted. Ticket A-5 turns it on to validate the BigQuery path end-to-end before writing any Stellar code.

---

## Roles

| | **S — Systems eng.** | **I — Industrial eng.** |
|---|---|---|
| Domain | Repo, TypeScript, sync adapter, frontend, PR | SQL, data verification, narrative, submission |
| Critical path | Yes | No — works in parallel and unblocks S |

**Key assignment:** risk #1 (does Hubble expose SAC events?) is solved with SQL in the BigQuery console, without touching the repo. That's I's work. While S brings up the local environment, I explores the schema and hands over a query that returns real rows. That takes risk #1 off the critical path.

---

## Backlog

### A · Hour 0–4 — Parallel unblocking

| ID | Task | Owner | Gate |
|---|---|---|---|
| A-1 | Fork + `pnpm install` | S | Installs clean |
| A-2 | **Relax `apps/scan/src/env.ts`**: make the 6 CDP + Stripe vars `.optional()` | S | App boots without third-party accounts |
| A-3 | Two local Postgres DBs + both Prisma schemas migrated | S | `TransferEvent` queryable |
| A-4 | `pnpm dev` + `apps/proxy` running | S | App loads at localhost |
| A-5 | **Hubble schema discovery in the BigQuery console** | **I** | Query returning ≥1 USDC SAC transfer |
| A-6 | **Stellar facilitator addresses** (SDF Discord, OZ Relayer docs) | **I** | ≥1 `G…` address verifiable on stellar.expert |
| A-7 | Enable `solana/bigquery` and run it | S | BigQuery path writes rows, or fails with a known error |

**A-5 and A-6 are the project's only hard blockers.**

**Environment reality — budget 4h for A-1..A-4, not 2.** `env.ts` uses `@t3-oss/env-nextjs`, which throws at startup on any missing required var. There are 12 with no default: two Postgres URLs plus a third for transfers, four CDP keys, two Stripe keys, `FREE_TIER_WALLET_NAME`, `NEXT_PUBLIC_PROXY_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`. There is no docker-compose and no seed script; upstream's README admits the setup is rough.

A-2 kills six of those. CDP and Stripe back the embedded wallet and payments — both out of scope — so making them optional is 15 minutes and removes two account signups. **It's also a standalone upstream PR** ("allow local dev without paid provider accounts"), same category as E-8.

**On looking like x402scan.com:** don't chase it. That site looks alive because it has months of indexed transfers; a fresh clone shows zeros. Backfilling Base history burns Bitquery quota and adds nothing — SDF is evaluating Stellar coverage, not Base parity. If the dashboard looks too empty, a 7-day backfill is enough, and it happens **after C-5**, never before.

*A-3 — what to look for in `crypto-stellar.crypto_stellar`:* `history_contract_events` (SAC events), `history_transactions` (hash), `enriched_history_operations`. For a given facilitator address, the query must return `tx_hash`, `sender`, `recipient`, `amount`, `block_timestamp`, `contract_id` — i.e. the columns of `TransferEventData`.

### B · Hour 4–10 — Declarative groundwork

| ID | Task | Owner | Gate |
|---|---|---|---|
| B-1 | `Network.STELLAR` in `facilitators/src/types.ts` | S | Compiles |
| B-2 | `USDC_STELLAR_TOKEN` — **7 decimals, not 6** | S | Compiles |
| B-3 | `openzeppelin.ts` facilitator + Stellar block in `coinbase.ts` + export | S | Shows up in the list |
| B-4 | `Chain.STELLAR` + labels + icons + `CHAIN_ID: 0` | S | `pnpm build` green |
| B-5 | `EvmChain = Exclude<Chain, Chain.SOLANA \| Chain.STELLAR>` + the ~4 call sites | S | `tsc` clean |
| B-6 | **Split `WALLET_CHAINS` from `SUPPORTED_CHAINS`** | S | Wallet still works, without Stellar |
| B-7 | **Fix `normalizeAddress`: preserve case for Stellar** | S | `G…` survives the round-trip |
| B-8 | `stellar.png` in `apps/scan/public/` | I | Icon renders |
| B-9 | **`docs/MPP-ATTRIBUTION.md`: close the `<!-- VERIFY -->` markers** — `one-way-channel` contract, Charge mode has no intermediary, sources | **I** | No open markers |

### C · Hour 10–20 — The adapter

| ID | Task | Owner | Gate |
|---|---|---|---|
| C-1 | `chains/stellar/hubble/query.ts` — `buildQuery` with A-5's SQL | S | Executes against Hubble |
| C-2 | `chains/stellar/hubble/config.ts` — `SyncConfig`, `QueryProvider.BIGQUERY` | S | Sync starts |
| C-3 | `transformResponse` → `TransferEventData`, 7 decimals | S | Types correct |
| C-4 | `FACILITATORS_BY_CHAIN(Network.STELLAR)` | S | Sync resolves addresses |
| C-5 | **Run the sync** | S | **★ ≥1 row with `chain = 'stellar'`** (RF-02) |
| C-6 | **Cross-check against stellar.expert** | **I** | Amount, hash and addresses match |
| C-7 | Generate x402 traffic on testnet | I + S | ≥10 self-generated transactions indexed |

**C-5 is the project gate.** If there's no row by H+20, the fallback fires — no debate.

**C-6 is where I's profile pays off:** verifying the numbers are *correct*, not just that they exist. A dashboard with amounts mis-scaled by the 7-vs-6 decimals bug is worse than an empty one — and it's the single most likely error of the sprint.

### D · Hour 20–28 — Visible frontend

| ID | Task | Owner | RF |
|---|---|---|---|
| D-1 | Stellar in the navbar chain selector | S | RF-01 |
| D-2 | `tx_hash` → stellar.expert | S | RF-04 |
| D-3 | `G…`/`C…` formatting and truncation · chain filter | S | RF-08 |
| D-4 | `chain-mapping.ts` — CAIP-2 `stellar:pubnet` / `stellar:testnet` | S | RF-08 |
| D-5 | Stellar facilitator with stats | S | RF-07 |
| D-6 | **Dashboard QA** with Stellar and with "all chains" | **I** | RF-03 |

*D-6, the case that breaks:* aggregations summing 6- and 7-decimal amounts without normalizing.

### E · Hour 28–34 — Delivery

| ID | Task | Owner | RF |
|---|---|---|---|
| E-1 | Fill in `README-FORK.draft.md` → fork's `README.md` | I | — |
| E-2 | Fill in `docs/MPP-ATTRIBUTION.md` — final, with sources | I | RF-05 |
| E-3 | Fill in `docs/STELLAR.md` — final query and env vars | S | — |
| E-4 | Demo video (~3 min) | I | — |
| E-5 | **Upstream PR** — opened as draft as soon as C-5 passes | S + I | RF-06 |
| E-6 | Diff cleanup: no secrets, no `console.log`, readable commits | S | — |
| E-7 | Submission sent | I | — |
| E-8 | Separate PR fixing upstream's stale README *(optional, 10 min)* | S | — |
| E-9 | Separate PR: optional CDP/Stripe env vars for local dev *(from A-2)* | S | — |

**E-5 is not left for the end.** A draft PR from hour 20 is evidence of contribution; one opened at 11:50pm looks rushed.

**E-8** — upstream's README describes `scan/`/`sync/`/`facilitators/` workspaces that no longer exist, and its link to `facilitators/config.ts` 404s. A three-line PR, separate from the main one. It opens a conversation with the maintainers before the big one lands.

### G · P2 — MPP Charge coverage *(hard gate: C-5 has passed)*

**Do not start before C-5.** Time-boxed to 3h; abort at H+30 regardless of state.

| ID | Task | Owner | Gate |
|---|---|---|---|
| G-1 | Deploy an MPP Charge server on testnet + generate traffic | I + S | SAC transfers landing at an address we control |
| G-2 | Register the service address in the registry *(see shortcut below)* | S | Sync resolves it |
| G-3 | Reuse the Hubble query against the MPP recipient address | S | Rows returned |
| G-4 | Verify rows land with `provider` distinguishing MPP from x402 | I | Cross-checked on stellar.expert |

**Why this is worth 3h:** x402 is Coinbase's protocol; **MPP is Stellar's.** Showing SDF coverage of their own protocol is likely the highest-return marginal work in the project. And the marginal cost is genuinely small — an MPP Charge payment is a SAC transfer to a known address, mechanically identical to x402. Same query, same `transformResponse`, different address in the registry.

**The honest shortcut:** the registry is built around `Facilitator`, and an MPP service is not a facilitator. For this window, register it as a pseudo-facilitator keyed on its `recipient` address. **Label it as a deliberate shortcut in `docs/STELLAR.md`**, so Merit doesn't read it as the proposed design. The correct model is a separate service registry — that's in `docs/MPP-ATTRIBUTION.md`.

**Scope honesty:** this covers *one known MPP service*, not the MPP ecosystem. There is no directory of MPP services to enumerate. The README and demo must say so — the claim is "MPP is indexable and here's proof", not "we index MPP."

### Documents: destination and status

The skeletons already exist. E-1/E-2/E-3 are filling in `<!-- TODO -->` markers, not writing from scratch.

| File | Goes upstream? | Audience |
|---|---|---|
| `docs/STELLAR.md` | Yes | Merit maintainers |
| `docs/MPP-ATTRIBUTION.md` | Yes | Merit + SDF + judges |
| `README-FORK.draft.md` → `README.md` | **No** | Judges |

The attribution finding going *inside* the PR is what turns it from a code drop into a contribution with judgment behind it.

**Honesty rule:** no `<!-- TODO -->` gets deleted without verifying it. The README's "Data status" block is mandatory — if C-5 ended in a fallback, it says so there.

### Branching tactic *(decide before the first commit)*

- Work on `feat/stellar-support`, branched from upstream `main`. That's what gets PR'd.
- The fork README commit goes **only** to the fork's `main`, never to the PR branch.

Mix them and you're cherry-picking at hour 33 on no sleep.

---

## Critical path

```
S:  A-1..A-4 ── A-7 ── B-1..B-7 ── C-1..C-4 ── C-5 ★ ── D-1..D-5 ── [G] ── E-3 E-5 E-6
                                       ▲                   │
                                       │ validated SQL     └─ P2, only if C-5 passed
I:  A-5 ── A-6 ───────────────────────┘  B-9 ── C-6 ── C-7 ── D-6 ── E-1 E-2 E-4 E-7
```

**There are only three real dependencies:** C-1 ← A-5 · C-4 ← A-6 · D-6 ← C-5.
Everything else on I's track is independent of S. If S loses 4 hours to environment setup, I loses nothing.

**Staggered sleep:** S sleeps in the 20–26 stretch (after C-5). I sleeps in the 10–16 stretch (after handing over the SQL).

---

## Fallback ladder

**Every fallback has a trigger time. When the time comes, it fires — no debate.**

| If this fails | Trigger | Fallback |
|---|---|---|
| Hubble doesn't expose SAC events | **H+4** | Soroban RPC `getEvents`, 24h window. ~3h extra. Stated plainly: history limited by RPC retention |
| No facilitator addresses | **H+6** | Deploy our own testnet facilitator (OZ Relayer) or use Coinbase testnet. We control the address → no longer a blocker |
| The type cascade overflows | **H+12** | Isolate Stellar in the sync pipeline + a dedicated `/stellar` view, without touching shared components. Satisfies RF-02/03/04 |
| No real x402 volume | **H+20** | C-7: generate the traffic ourselves. **Labeled as demonstration data** in the UI and README |
| The sync writes no rows at all | **H+24** | Manual verified insertion, adapter still shipped in the PR, explicitly documenting that the automated sync went unvalidated |
| Everything technical collapses | **H+30** | Ship the attribution document + the declarative changes in the PR. Still a real contribution |

**On the H+24 fallback:** it exists as a safety net, not as a plan. If it's used, the README and the demo say so in plain words. Presenting hand-inserted rows as working indexing is the one move that turns an honest project into a disqualifiable one.

---

## Definition of Done

- `pnpm build` and `tsc` with no new errors
- Committed with a descriptive message
- If it touches data: cross-checked against stellar.expert by I
- If it touches UI: tested with Stellar **and** with the default chain — don't break Base/Solana

---

## Submission checklist

- [ ] RF-01 · Stellar in the selector
- [ ] RF-02 · ≥1 `chain = 'stellar'` row from a real facilitator
- [ ] RF-03 · Dashboard with verified metrics
- [ ] RF-04 · Hash linking to stellar.expert
- [ ] RF-05 · MPP attribution document
- [ ] RF-06 · **PR opened against `Merit-Systems/x402scan`**
- [ ] Fork README · public repo · demo video
- [ ] Demonstration data labeled as such, if any
- [ ] Apache 2.0 attribution preserved · no secrets in the diff
