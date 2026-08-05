import { USDC_MULTIPLIER } from '@/trigger/lib/constants';

import type {
  SyncConfig,
  Facilitator,
  FacilitatorConfig,
  TransferEventData,
} from '@/trigger/types';

/**
 * Rows handed over by fetch/soroban/fetch.ts. Unlike the SQL-backed providers,
 * the Soroban adapter does its own decoding, so buildQuery is a no-op and this
 * shape is already normalized.
 */
interface SorobanTransferRow {
  txHash: string;
  ledgerClosedAt: string;
  from: string;
  to: string;
  /** Horizon renders Stellar amounts in human units, e.g. "0.0010000". */
  rawAmount: string;
  transactionFrom: string;
}

/**
 * The Soroban provider talks JSON-RPC, not SQL. The SyncConfig contract still
 * requires a buildQuery, so it returns a descriptive string for the logs.
 */
export function buildQuery(
  config: SyncConfig,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): string {
  return `soroban getEvents contract=${facilitatorConfig.token.address} relayer=${facilitatorConfig.address} window=${since.toISOString()}..${now.toISOString()}`;
}

export function transformResponse(
  data: unknown,
  _config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): TransferEventData[] {
  const rows = data as SorobanTransferRow[];
  const { decimals } = facilitatorConfig.token;

  return rows.map(row => {
    // TransferEvent.amount is stored in 6-decimal base units on every chain
    // (see USDC_MULTIPLIER). Horizon already returns human units, so this only
    // has to scale — but never assume base units here: Stellar assets carry 7
    // decimals, and storing raw 7-decimal units would silently inflate every
    // Stellar figure in the dashboard by 10x.
    const human = Number(row.rawAmount);

    return {
      address: facilitatorConfig.token.address,
      transaction_from: row.transactionFrom,
      sender: row.from,
      recipient: row.to,
      amount: Math.round(human * USDC_MULTIPLIER),
      block_timestamp: new Date(row.ledgerClosedAt),
      tx_hash: row.txHash,
      chain: 'stellar',
      provider: 'horizon',
      decimals,
      facilitator_id: facilitator.id,
    };
  });
}
