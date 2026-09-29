# Contributing to StellarScan

Start with [`docs/ROADMAP.md`](docs/ROADMAP.md) for context and priorities. This file covers how we work.

Everything in this repo is in English: code, comments, commits, issues, PRs and docs.

## Setup

Requirements: Node 24 or newer, pnpm 10.28 (pinned in `package.json`), Docker.

```bash
pnpm install
```

Local development needs no Neon, CDP or Stripe accounts. The full recipe (plain Postgres for the scan DB, TimescaleDB for transfers, Redis, the FDW migration workaround and the env values) is in [`docs/STELLAR.md` › Local development](docs/STELLAR.md#local-development-no-paid-accounts). Env templates: `apps/scan/.env.example`.

Run the app:

```bash
pnpm dev
```

Run the Stellar sync once, outside Trigger.dev:

```bash
pnpm --filter @x402scan/sync-transfers sync:once --chain stellar
pnpm --filter @x402scan/sync-transfers sync:once --chain stellar --since 2026-09-01T00:00:00Z
```

How to check the result visually and as an agent: [`docs/TESTING.md`](docs/TESTING.md). Deployment: [`deploy/README.md`](deploy/README.md).

## Checks

Before opening a PR:

```bash
pnpm check   # format, types, lint, knip, publish check across the monorepo
```

For a quicker loop on the indexer only:

```bash
pnpm --filter @x402scan/sync-transfers types:check
pnpm --filter @x402scan/sync-transfers lint
pnpm --filter @x402scan/sync-transfers format:check
```

## Branches, commits and PRs

- **Never push to `main`.** Every change goes through a PR with at least one review from another team member.
- **Branch names:** `feat/…`, `fix/…`, `docs/…`, `chore/…`, cut from `main`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), imperative subject, and a body that explains why. Example: `fix(sync): stop dropping Stellar payments when Horizon fails`.
- **PRs:** link the issue (`Fixes #n`), then describe the problem, the change and how you verified it. See [#11](https://github.com/EmanuXBe/x402scan/pull/11) for the shape.
- **Merging:** squash for single-purpose PRs; keep a merge commit when the individual commits are worth keeping. Both keep authorship.
- **Issues:** label an area (`area: indexer`, `area: docs`, `area: upstream`, `area: ecosystem`, `area: meta`) and a milestone.

## Figures and claims

StellarScan's value is being right about Stellar's agentic payments, so public numbers follow one rule:

**Every figure carries a value, a date (ISO, UTC), a source and a method.**

- Prefer fixed dates to relative ones: "silent since 2026-05-18", not "silent for 80 days". Relative figures go stale without anyone noticing.
- Keep the evidence. Audit snapshots go in [`docs/data/`](docs/data/) as `YYYY-MM-DD-<subject>.json`, produced by the scripts in [`scripts/audit/`](scripts/audit/).
- Verify on chain before claiming. A statement like "there is only one facilitator" needs evidence, and gets corrected in the open when it turns out wrong (see [#13](https://github.com/EmanuXBe/x402scan/issues/13)).

## Upstream work

Work meant for [Merit-Systems/x402scan](https://github.com/Merit-Systems/x402scan) is based on **their** `main`, not ours, and lives in a separate worktree so the two dependency trees never mix:

```bash
git remote add upstream https://github.com/Merit-Systems/x402scan.git   # once
git fetch upstream main
git worktree add ../x402scan-upstream -b fix/<topic> upstream/main
cd ../x402scan-upstream
npx pnpm@11 install        # upstream uses pnpm 11
npx pnpm@11 check          # what their CI runs
```

- Push the branch to your fork and open the PR against `Merit-Systems/x402scan:main`. Never target our `main` with an upstream branch.
- Follow their patterns (see [ROADMAP › Upstream strategy](docs/ROADMAP.md#6-upstream-strategy)) and keep PRs small.
- Do not use the old `upstream-pr` branch: it is 59 commits behind with 16 conflicts.
- Nothing goes to Merit's repo, their Discord or other public channels without the team agreeing on it first. Drafts live in [`docs/outreach/`](docs/outreach/).

## Secrets

Never commit `.env` files, API keys or private keys. The CDP values in the `Dockerfile` are build placeholders, not credentials.
