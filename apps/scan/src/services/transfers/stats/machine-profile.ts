import z from 'zod';
import { Prisma } from '@x402scan/transfers-db';

import { baseQuerySchema } from '../schemas';
import { createCachedQuery, createStandardCacheKey } from '@/lib/cache';
import { queryRaw } from '@/services/transfers/client';

export const machineProfileInputSchema = baseQuerySchema.pick({
  chain: true,
  timeframe: true,
});

const rowSchema = z.object({
  payments: z.number(),
  median_amount: z.number().nullable(),
  p95_amount: z.number().nullable(),
  unique_buyers: z.number(),
  unique_sellers: z.number(),
  pairs: z.number(),
  active_days: z.number(),
  busiest_day_payments: z.number(),
  median_gap_seconds: z.number().nullable(),
});

/**
 * Shape of the payment flow rather than its size.
 *
 * The registry-backed panels (Featured Services, Top Servers, merchants) all
 * depend on services self-registering a discovery document. That directory is
 * empty for any chain the ecosystem has not adopted yet, so those panels read
 * zero even when real payments are settling on-chain.
 *
 * These metrics are derived purely from observed transfers, so they work for
 * any chain from its very first payment. They also answer a different and more
 * useful question for someone deciding whether to sell an API to agents: not
 * "who is registered" but "what does agent traffic actually look like here".
 *
 * Two signals distinguish machine traffic from human traffic:
 *  - median ≈ p95 amount, meaning a flat per-call price with no human variance
 *  - a short, regular gap between a buyer's consecutive payments
 */
const getMachineProfileUncached = async (
  input: z.infer<typeof machineProfileInputSchema>
) => {
  const { chain, timeframe } = input;

  const conditions: Prisma.Sql[] = [Prisma.sql`WHERE 1=1`];
  if (chain) conditions.push(Prisma.sql`AND chain = ${chain}`);
  // timeframe is either a day count or a { period, offset } window; 0 days
  // means "all time" everywhere else in the app.
  const days = typeof timeframe === 'number' ? timeframe : timeframe.period;
  if (days > 0) {
    conditions.push(
      Prisma.sql`AND block_timestamp >= NOW() - (${days} * INTERVAL '1 day')`
    );
  }
  const where = Prisma.join(conditions, ' ');

  const results = await queryRaw(
    Prisma.sql`
      WITH scoped AS (
        SELECT sender, recipient, amount, block_timestamp
        FROM "TransferEvent"
        ${where}
      ),
      gaps AS (
        SELECT EXTRACT(EPOCH FROM (
          block_timestamp - LAG(block_timestamp)
            OVER (PARTITION BY sender ORDER BY block_timestamp)
        )) AS gap
        FROM scoped
      ),
      daily AS (
        SELECT COUNT(*) AS n
        FROM scoped
        GROUP BY DATE_TRUNC('day', block_timestamp)
      )
      SELECT
        (SELECT COUNT(*) FROM scoped)::int AS payments,
        (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) FROM scoped)::float AS median_amount,
        (SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY amount) FROM scoped)::float AS p95_amount,
        (SELECT COUNT(DISTINCT sender) FROM scoped)::int AS unique_buyers,
        (SELECT COUNT(DISTINCT recipient) FROM scoped)::int AS unique_sellers,
        (SELECT COUNT(*) FROM (SELECT DISTINCT sender, recipient FROM scoped) p)::int AS pairs,
        (SELECT COUNT(DISTINCT DATE_TRUNC('day', block_timestamp)) FROM scoped)::int AS active_days,
        COALESCE((SELECT MAX(n) FROM daily), 0)::int AS busiest_day_payments,
        (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap) FROM gaps WHERE gap IS NOT NULL)::float AS median_gap_seconds
    `,
    z.array(rowSchema)
  );

  return (
    results[0] ?? {
      payments: 0,
      median_amount: null,
      p95_amount: null,
      unique_buyers: 0,
      unique_sellers: 0,
      pairs: 0,
      active_days: 0,
      busiest_day_payments: 0,
      median_gap_seconds: null,
    }
  );
};

export const getMachineProfile = createCachedQuery({
  queryFn: getMachineProfileUncached,
  cacheKeyPrefix: 'machine-profile',
  createCacheKey: input => createStandardCacheKey(input),
  dateFields: [],
  tags: ['statistics'],
});
