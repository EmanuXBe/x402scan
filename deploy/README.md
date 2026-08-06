# Deploying the StellarScan fork

Upstream deploys to Vercel and needs no Dockerfile. This fork adds one, plus the
pieces Vercel provides implicitly, so the explorer can run somewhere else.

## The constraint that drives the shape

**The transfers database must be TimescaleDB.** Every dashboard aggregate is a
Timescale materialized view. Stock Postgres accepts the schema and then fails on
the views, which is a confusing failure — it looks like the app is broken rather
than the database being wrong. Neon and Supabase are out for that half.

**The app must run on a full Node runtime.** Prisma opens TCP sockets through
the pg driver, and next-auth, ioredis and the Coinbase SDK assume Node built-ins.
Cloudflare Workers can host Next through OpenNext, but for this dependency set
that is a runtime migration rather than a deployment.

## Layout

| Piece        | Where               | Why                                       |
| ------------ | ------------------- | ----------------------------------------- |
| App          | Railway (Docker)    | full Node runtime, no edge constraints    |
| Transfers DB | Railway (Timescale) | the materialized views need the extension |
| Scan DB      | Railway (Postgres)  | ordinary relational data                  |
| Redis        | Railway             | without it every dashboard query re-runs  |
| Public URL   | Cloudflare Pages    | free `*.pages.dev`, proxying to Railway   |

## 1. Databases

Create a Timescale service and a Postgres service. Then load the local data:

```bash
scripts/deploy/migrate-to-remote.sh "$REMOTE_SCAN_URL" "$REMOTE_TRANSFERS_URL"
```

The script refuses to run if `timescaledb` is not available on the transfers
target, and verifies afterwards that the remote row count matches local and that
no row has a null `log_index`. That second check matters: a null `log_index`
defeats the `(tx_hash, log_index, chain, block_timestamp)` unique index, because
Postgres treats NULLs as distinct — see `docs/STELLAR.md`.

## 2. App

`railway.json` points Railway at the Dockerfile and at `/api/health`, which is
deliberately dependency-free so it reports process liveness rather than the
health of a downstream.

Required environment variables:

```
SCAN_DATABASE_URL           # Postgres service
SCAN_DATABASE_URL_UNPOOLED  # same value is fine
TRANSFERS_DB_URL            # Timescale service
REDIS_URL                   # Redis service
AUTH_SECRET                 # openssl rand -base64 32
CRON_SECRET                 # openssl rand -base64 32
NEXT_PUBLIC_NODE_ENV=production
```

CDP and Stripe variables can stay dummies. They are only read by the wallet and
payment surfaces, which are Base and Solana only — the explorer never touches
them. Do not set `REDIS_DISABLE=false`: `z.coerce.boolean()` makes
`Boolean("false") === true`, so that string _disables_ Redis. Omit the variable.

## 3. Public URL

```bash
cd deploy/cloudflare-pages
wrangler pages deploy . --project-name stellarscan
```

Then set `ORIGIN` in the Pages project to the Railway URL, without a trailing
slash. The Function forwards everything and streams the response body, so React
Server Components still arrive incrementally.

Skipping this step is fine — Railway's own `*.up.railway.app` name works. The
proxy exists because `stellarscan.pages.dev` reads better.

## Keeping the index current

The sync adapter normally runs as a trigger.dev scheduled task. Without a
trigger.dev project, run it directly:

```bash
pnpm --filter @x402scan/sync-transfers sync:once --chain stellar
```

It resumes from its own cursor, so repeated runs are cheap — a steady-state run
is a single Horizon page and about two seconds. After a bulk insert, refresh the
materialized views and flush Redis, or the dashboard keeps serving the old
numbers.
