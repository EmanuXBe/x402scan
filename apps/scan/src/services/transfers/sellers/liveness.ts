import z from 'zod';
import { Prisma } from '@x402scan/transfers-db';

import { baseQuerySchema } from '../schemas';
import { mixedAddressSchema } from '@/lib/schemas';
import { createCachedArrayQuery, createStandardCacheKey } from '@/lib/cache';
import { queryRaw } from '@/services/transfers/client';

export const sellerLivenessInputSchema = baseQuerySchema
  .pick({ chain: true, timeframe: true })
  .extend({ limit: z.number().min(1).max(200).default(25) });

const rowSchema = z.object({
  // Not z.string(): the Seller component takes a MixedAddress, and typing the
  // column loosely here would push a cast into the UI instead.
  recipient: mixedAddressSchema,
  payments: z.number(),
  volume: z.number(),
  unique_buyers: z.number(),
  first_seen: z.date(),
  last_seen: z.date(),
  active_days: z.number(),
  span_days: z.number(),
  days_since_last_payment: z.number(),
  busiest_day_payments: z.number(),
  busiest_day_share: z.number(),
  status: z.enum(['active', 'idle', 'dormant']),
});

export type SellerLiveness = z.infer<typeof rowSchema>;

/**
 * Days since the last payment that still count a seller as trading.
 *
 * Agent traffic is high frequency by nature — the median gap between one
 * buyer's consecutive payments on Stellar mainnet is 29 seconds. A service
 * that has not been paid in a week is therefore not "quiet", it has stopped.
 * Both thresholds are deliberately short for that reason, and
 * days_since_last_payment is returned raw so a consumer can pick its own.
 */
const ACTIVE_WITHIN_DAYS = 7;
const IDLE_WITHIN_DAYS = 30;

/**
 * Whether each seller is still trading, and whether its total was ever real.
 *
 * Ranking sellers by lifetime payment count is the obvious thing to do and it
 * is misleading: a service that took 1,581 payments across two days in May and
 * then stopped outranks every service still trading today. The aggregate says
 * the market is busy; the market is not busy.
 *
 * Two columns separate the cases, and neither is derivable from a total:
 *
 *  - `active_days` vs `span_days` — a seller with 1,581 payments over 2 active
 *    days in a 16-day span is a burst. One with 96 payments over 29 active days
 *    is a business. The payment counts point the wrong way.
 *  - `busiest_day_share` — the fraction of a seller's payments that landed on
 *    its single busiest day. Near 1.0 means the entire history is one spike,
 *    which is the signature of a test run or a benchmark, not of customers.
 *
 * Derived purely from observed transfers, so this works on any chain from its
 * first payment and needs nothing from the service registry.
 */
const getSellerLivenessUncached = async (
  input: z.infer<typeof sellerLivenessInputSchema>
) => {
  const { chain, timeframe, limit } = input;

  const conditions: Prisma.Sql[] = [Prisma.sql`WHERE 1=1`];
  if (chain) conditions.push(Prisma.sql`AND chain = ${chain}`);
  // A timeframe of 0 days means "all time" everywhere else in the app.
  const days = typeof timeframe === 'number' ? timeframe : timeframe.period;
  if (days > 0) {
    conditions.push(
      Prisma.sql`AND block_timestamp >= NOW() - (${days} * INTERVAL '1 day')`
    );
  }
  const where = Prisma.join(conditions, ' ');

  return await queryRaw(
    Prisma.sql`
      WITH scoped AS (
        SELECT recipient, sender, amount, block_timestamp
        FROM "TransferEvent"
        ${where}
      ),
      per_day AS (
        SELECT recipient, DATE_TRUNC('day', block_timestamp) AS day, COUNT(*) AS n
        FROM scoped
        GROUP BY 1, 2
      ),
      busiest AS (
        SELECT recipient, MAX(n) AS busiest_day_payments
        FROM per_day
        GROUP BY 1
      )
      SELECT
        s.recipient,
        COUNT(*)::int AS payments,
        SUM(s.amount)::float AS volume,
        COUNT(DISTINCT s.sender)::int AS unique_buyers,
        MIN(s.block_timestamp) AS first_seen,
        MAX(s.block_timestamp) AS last_seen,
        COUNT(DISTINCT DATE_TRUNC('day', s.block_timestamp))::int AS active_days,
        -- Both endpoints are truncated to the day before subtracting, because
        -- active_days counts calendar days while a raw interval counts 24h
        -- units. Mixing them lets active_days exceed span_days: payments at
        -- Jul 22 16:02 and Jul 24 12:49 are an interval of 1 day 20h — day part
        -- 1 — but touch three calendar days. Inclusive (+1) so a seller active
        -- on one day spans 1, keeping active_days <= span_days and the ratio
        -- between them meaningful.
        (DATE_PART(
          'day',
          DATE_TRUNC('day', MAX(s.block_timestamp)) - DATE_TRUNC('day', MIN(s.block_timestamp))
        ) + 1)::int AS span_days,
        DATE_PART('day', NOW() - MAX(s.block_timestamp))::int AS days_since_last_payment,
        b.busiest_day_payments::int AS busiest_day_payments,
        (b.busiest_day_payments::float / COUNT(*)::float) AS busiest_day_share,
        CASE
          WHEN MAX(s.block_timestamp) >= NOW() - (${ACTIVE_WITHIN_DAYS} * INTERVAL '1 day') THEN 'active'
          WHEN MAX(s.block_timestamp) >= NOW() - (${IDLE_WITHIN_DAYS} * INTERVAL '1 day') THEN 'idle'
          ELSE 'dormant'
        END AS status
      FROM scoped s
      JOIN busiest b ON b.recipient = s.recipient
      GROUP BY s.recipient, b.busiest_day_payments
      -- Ordered by recency, not by volume. Ordering by payments here would
      -- reproduce exactly the ranking this metric exists to correct.
      ORDER BY MAX(s.block_timestamp) DESC
      LIMIT ${limit}
    `,
    z.array(rowSchema)
  );
};

// Array variant: dateFields on createCachedQuery are keys of the whole result,
// which for a list would be array indices rather than row columns.
export const getSellerLiveness = createCachedArrayQuery({
  queryFn: getSellerLivenessUncached,
  cacheKeyPrefix: 'seller-liveness',
  createCacheKey: input => createStandardCacheKey(input),
  dateFields: ['first_seen', 'last_seen'],
  tags: ['statistics'],
});
