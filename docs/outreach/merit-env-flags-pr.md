# PR to Merit: boolean env flags

Branch: `fix/env-boolean-flags`, cut from `upstream/main` at `131a5d3c`. Tracked in [#10](https://github.com/EmanuXBe/x402scan/issues/10).

---

**Title:** fix(env): parse boolean flags instead of coercing them

`REDIS_DISABLE` and `HIDE_TRPC_LOGS` use `z.coerce.boolean()`, which runs `Boolean(value)`. Any non-empty string becomes `true`, so:

- `REDIS_DISABLE=false` disables Redis
- `HIDE_TRPC_LOGS=false` hides tRPC logs

The cache benchmark in #1196 ran into this: its `REDIS_DISABLE` override had to be an empty string to mean "enabled".

This switches both to `z.stringbool()` from Zod 4, which accepts `true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off`, `y`/`n` and `enabled`/`disabled`, case insensitive.

**Unchanged:** an unset or empty variable still falls back to the current default, because `createEnv` runs with `emptyStringAsUndefined: true`.

**Behavior change:** a value outside that list, such as `REDIS_DISABLE=maybe`, now fails env validation at boot instead of silently meaning `true`.

**Checked:** `pnpm check` passes (format, oxlint, knip, publish check, and types for every package) except `@x402scan/app` types, which fail on current `main` without this change: `src/app/(app)/(home)/resources/register/_components/form.tsx(930,23): Type 'string' is not assignable to type 'UrlObject | RouteImpl<string>'`.
