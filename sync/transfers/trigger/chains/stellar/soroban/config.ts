import type { SyncConfig } from '@/trigger/types';
import { PaginationStrategy, QueryProvider, Network } from '@/trigger/types';
import { buildQuery, transformResponse } from './query';
import { ONE_DAY_IN_MS, ONE_MINUTE_IN_SECONDS } from '@/trigger/lib/constants';
import { FACILITATORS_BY_CHAIN } from '@/trigger/lib/facilitators';

export const stellarSorobanConfig: SyncConfig = {
  cron: '*/15 * * * *',
  maxDurationInSeconds: ONE_MINUTE_IN_SECONDS * 5,
  chain: 'stellar',
  provider: QueryProvider.HORIZON,
  paginationStrategy: PaginationStrategy.TIME_WINDOW,
  // Windows must be LARGE here, which is the opposite of the instinct that
  // small windows are safer. The BigQuery adapters window to bound result-set
  // size; Horizon has no such limit — it is cursor-paginated with no time
  // filter, so every window restarts at the relayer's newest transaction and
  // pages backwards until it falls out of the window. Halving the window
  // therefore doubles the work rather than halving it.
  //
  // Measured on mainnet: the relayer's full history is 2,590 transactions =
  // 14 pages ≈ 8.5s. At the original 6h window, a backfill from the first
  // transaction (2026-03-06) meant ~610 windows each re-walking most of that
  // history — roughly 40 minutes of pagination against a 5 minute maxDuration,
  // so the task could never finish a backfill. At 30 days it is ~6 windows,
  // and a steady-state 15-minute run is a single window and a single page.
  //
  // A cold backfill of a submitter anchor is still slower than maxDuration,
  // because operations are fetched one transaction at a time (~26 min for
  // 2,590). Run those from the CLI (`pnpm sync:once --chain stellar`); the
  // scheduled task only has to keep up. Recipient anchors are cheap either way.
  timeWindowInMs: ONE_DAY_IN_MS * 30,
  limit: 5_000,
  facilitators: FACILITATORS_BY_CHAIN(Network.STELLAR),
  buildQuery,
  transformResponse,
  enabled: true,
  machine: 'small-1x',
  // The shared cursor, keyed by facilitator and anchor address and advanced
  // after every window. The newest-stored-transfer cursor cannot serve a
  // recipient anchor: it looks transfers up by `transaction_from`, which for a
  // recipient anchor is the service's fee payer, never the anchor itself, so
  // every run would restart at syncStartDate.
  useSyncState: true,
};
