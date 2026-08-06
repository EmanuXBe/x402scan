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
    SKIP_ENV_VALIDATION=1 \
    NEXT_PUBLIC_NODE_ENV=production

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
