# Sprint Plan — StellarScan

2 people · ~36 usable hours (Aug 4 afternoon → Aug 5 night) · Parent doc: [PRD.md](PRD.md)

---

## Verified technical constraints

Four facts measured against the code. They are load-bearing — the tickets assume them.

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
| A-1 | Fork + `pnpm install` + `pnpm dev` | S | App loads |
| A-2 | Local DB + Prisma + Trigger.dev credentials | S | `TransferEvent` queryable |
| A-3 | **Hubble schema discovery in the BigQuery console** | **I** | Query returning ≥1 USDC SAC transfer |
| A-4 | **Stellar facilitator addresses** (SDF Discord, OZ Relayer docs) | **I** | ≥1 `G…` address verifiable on stellar.expert |
| A-5 | Enable `solana/bigquery` and run it | S | BigQuery path writes rows, or fails with a known error |

**A-3 and A-4 are the project's only hard blockers.**

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
| C-1 | `chains/stellar/hubble/query.ts` — `buildQuery` with A-3's SQL | S | Executes against Hubble |
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

**E-5 is not left for the end.** A draft PR from hour 20 is evidence of contribution; one opened at 11:50pm looks rushed.

**E-8** — upstream's README describes `scan/`/`sync/`/`facilitators/` workspaces that no longer exist, and its link to `facilitators/config.ts` 404s. A three-line PR, separate from the main one. It opens a conversation with the maintainers before the big one lands.

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
S:  A-1 A-2 ── A-5 ── B-1..B-7 ── C-1..C-4 ── C-5 ★ ── D-1..D-5 ── E-3 E-5 E-6
                                     ▲
                                     │ validated SQL
I:  A-3 ── A-4 ─────────────────────┘  B-9 ── C-6 ── C-7 ── D-6 ── E-1 E-2 E-4 E-7
```

**There are only three real dependencies:** C-1 ← A-3 · C-4 ← A-4 · D-6 ← C-5.
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
