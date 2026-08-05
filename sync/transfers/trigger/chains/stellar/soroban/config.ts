import type { SyncConfig } from '@/trigger/types';
import { PaginationStrategy, QueryProvider, Network } from '@/trigger/types';
import { buildQuery, transformResponse } from './query';
import { ONE_HOUR_IN_MS, ONE_MINUTE_IN_SECONDS } from '@/trigger/lib/constants';
import { FACILITATORS_BY_CHAIN } from '@/trigger/lib/facilitators';

export const stellarSorobanConfig: SyncConfig = {
  cron: '*/15 * * * *',
  maxDurationInSeconds: ONE_MINUTE_IN_SECONDS * 5,
  chain: 'stellar',
  provider: QueryProvider.SOROBAN_RPC,
  paginationStrategy: PaginationStrategy.TIME_WINDOW,
  // Public Soroban RPC endpoints retain roughly 24h of events, so windows are
  // hours rather than the 30-day windows the BigQuery adapters use.
  timeWindowInMs: ONE_HOUR_IN_MS * 6,
  limit: 5_000,
  facilitators: FACILITATORS_BY_CHAIN(Network.STELLAR),
  buildQuery,
  transformResponse,
  enabled: true,
  machine: 'small-1x',
};
