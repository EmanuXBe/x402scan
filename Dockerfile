# Deploy target for the StellarScan fork.
#
# Upstream assumes Vercel, which needs no Dockerfile — the fork needs one to run
# anywhere else. Next's standalone output is what makes this tractable in a pnpm
# workspace: it emits a server plus only the modules actually imported, instead
# of an image carrying the whole monorepo.
#
# The app needs a full Node runtime, not an edge one: Prisma opens TCP sockets
# through the pg driver, and next-auth, ioredis and the Coinbase SDK all assume
# Node built-ins.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# ── build ───────────────────────────────────────────────────────────────────
# The whole workspace is copied in one step rather than staging manifests for a
# cacheable install layer. Enumerating eighteen package.json paths across
# apps/, packages/internal/, packages/external/ and sync/ is the kind of list
# that goes stale silently and fails the build months later; a slower cold build
# is the better trade for a deploy path that is run rarely.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts

# Prisma clients are generated into each db package and imported by the app, so
# they must exist before the Next build resolves those imports.
RUN pnpm --filter @x402scan/scan-db exec prisma generate \
 && pnpm --filter @x402scan/transfers-db exec prisma generate

# apps/scan's postinstall copies facilitator logos into public/, and
# --ignore-scripts skipped it above. Without this the facilitator icons 404.
RUN pnpm --filter @x402scan/app exec sh -c \
    'cp -f ../../packages/external/facilitators/images/* public/ 2>/dev/null || true'

# SKIP_ENV_VALIDATION keeps production secrets out of image layers. The same
# schema runs again at boot against the real runtime environment, so nothing is
# left unchecked — see the comment on skipValidation in apps/scan/src/env.ts.
ENV NEXT_OUTPUT_STANDALONE=true \
    NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=1

# NEXT_PUBLIC_* must be present at BUILD time, not runtime.
#
# Next inlines them into the client bundle while compiling, so setting them on
# the running service is too late — the bundle already contains `undefined` and
# the browser fails t3-env's client validation with "Invalid environment
# variables". Nothing shows in the server logs and curl still returns 200,
# because the page renders and only breaks once it hydrates.
#
# ARG rather than plain ENV so a platform can override per deployment: the app
# URL in particular differs for every environment, and Railway passes service
# variables to a Dockerfile build as build args.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_PROXY_URL=https://proxy.x402scan.com
ARG NEXT_PUBLIC_NODE_ENV=production
ARG NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_PROXY_URL=$NEXT_PUBLIC_PROXY_URL \
    NEXT_PUBLIC_NODE_ENV=$NEXT_PUBLIC_NODE_ENV \
    NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Every required server variable from apps/scan/src/env.ts, as placeholders.
#
# Skipping env validation is necessary but not sufficient. Next evaluates route
# modules while collecting page data, and several of them have module-scope side
# effects that read the environment directly: the x402 router throws without CDP
# credentials, and neon() throws without a connection string. Each one fails on
# a route rather than on a missing variable, so chasing them individually costs
# a four-minute build per discovery. Setting the whole set at once is cheaper
# and does not depend on having found all of them.
#
# The database URLs point at localhost deliberately. That routes the db clients
# down the pg branch, whose Pool connects lazily — the neon branch constructs
# eagerly and would fail here. Nothing connects during a build either way.
#
# All of these are visibly fake and are replaced by the real runtime
# environment, which the same schema validates again at boot.
ENV SCAN_DATABASE_URL=postgresql://build:build@localhost:5432/build \
    SCAN_DATABASE_URL_UNPOOLED=postgresql://build:build@localhost:5432/build \
    TRANSFERS_DB_URL=postgresql://build:build@localhost:5432/build \
    CDP_API_KEY_ID=build-placeholder \
    CDP_API_KEY_SECRET=build-placeholder \
    CDP_API_KEY_NAME=build-placeholder \
    CDP_WALLET_SECRET=build-placeholder \
    FREE_TIER_WALLET_NAME=build-placeholder \
    ECHO_APP_ID=build-placeholder \
    STRIPE_SECRET_KEY=build-placeholder \
    AUTH_SECRET=build-placeholder \
    CRON_SECRET=build-placeholder

# `--filter=@x402scan/app...` (with the trailing dots) builds the app *and its
# workspace dependencies*. facilitators and neverthrow both publish from dist/
# rather than source, so building the app alone resolves them to nothing.
RUN pnpm exec turbo run build --filter=@x402scan/app...

# ── runtime ─────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build --chown=nextjs:nodejs /app/apps/scan/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/scan/.next/static ./apps/scan/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/scan/public ./apps/scan/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Standalone puts the server at the app's path inside the workspace layout.
CMD ["node", "apps/scan/server.js"]
