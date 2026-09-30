import { logger } from '@trigger.dev/sdk/v3';

import type {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '../../types';

const DEFAULT_HORIZON_URL = 'https://horizon.stellar.org';
const PAGE_LIMIT = 200;
const MAX_PAGES = 50;

interface HorizonTransaction {
  id: string;
  hash: string;
  created_at: string;
  successful: boolean;
  source_account: string;
  fee_account?: string;
  paging_token: string;
}

interface HorizonOperation {
  id: string;
  type: string;
  type_i: number;
  transaction_hash: string;
  created_at: string;
  source_account: string;
  /** Present when the request passes `join=transactions`. */
  transaction?: HorizonTransaction;
  // invoke_host_function fields
  function?: string;
  parameters?: { type: string; value: string }[];
  asset_balance_changes?: {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    type: string;
    from: string;
    to: string;
    amount: string;
  }[];
}

interface HorizonPage<T> {
  _embedded?: { records: T[] };
  _links?: { next?: { href: string } };
}

interface SorobanTransferRow {
  txHash: string;
  ledgerClosedAt: string;
  from: string;
  to: string;
  rawAmount: string;
  transactionFrom: string;
  /**
   * Position of this balance change within its transaction.
   *
   * TransferEvent is unique on (tx_hash, log_index, chain, block_timestamp),
   * but Postgres treats NULLs as distinct in unique indexes — so any chain that
   * leaves log_index null loses that protection entirely and a re-run inserts
   * duplicates silently. A single transaction can also carry several transfers,
   * which would collide without an ordinal.
   */
  logIndex: number;
}

const MAX_ATTEMPTS = 4;
const MAX_RETRY_WAIT_MS = 30_000;

/**
 * GET from Horizon, retrying rate limits (429) and server errors (5xx).
 *
 * A final failure must propagate to the caller and fail the whole window.
 * Skipping one transaction instead would store the rest of the window, and
 * since the cursor moves past every window that completes, the skipped
 * payments would never be requested again. A cold backfill makes one request
 * per relayer transaction, so a 429 from the public Horizon is expected.
 */
async function horizonFetch<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) return (await res.json()) as T;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(`Horizon ${res.status} for ${url}`);
    }

    const retryAfterSeconds = Number(res.headers.get('retry-after'));
    const waitMs = Math.min(
      retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 1000 * 2 ** attempt,
      MAX_RETRY_WAIT_MS
    );
    logger.warn(
      `Horizon ${res.status} for ${url}, retry ${attempt} of ${MAX_ATTEMPTS - 1} in ${waitMs}ms`
    );
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}

function horizonGet<T>(url: string): Promise<HorizonPage<T>> {
  return horizonFetch<HorizonPage<T>>(url);
}

/**
 * Stellar agentic payments are Soroban contract invocations against the USDC
 * SAC. Two properties make them attributable, and both are needed:
 *
 *  1. An anchor account: the facilitator that submits or fee-bumps the
 *     transaction (`submitter`), or the service that receives it (`recipient`).
 *  2. The operation is `invoke_host_function`, not a classic `payment`.
 *
 * The second filter matters more than it looks: a SAC mirrors its classic
 * asset, so ordinary USDC payments also emit `transfer` contract events.
 * Filtering on events alone sweeps in the entire classic payment volume of the
 * network. Only contract invocations are protocol-level agentic payments.
 *
 * Horizon is used rather than Soroban RPC because RPC keeps days of history,
 * while SDF's public Horizon keeps one year and returns `asset_balance_changes`
 * already decoded, with no XDR handling required.
 */
export async function fetchSorobanRpc(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): Promise<TransferEventData[]> {
  if ((facilitatorConfig.anchor ?? 'submitter') === 'recipient') {
    return fetchByRecipient(config, facilitator, facilitatorConfig, since, now);
  }
  return fetchBySubmitter(config, facilitator, facilitatorConfig, since, now);
}

async function fetchBySubmitter(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): Promise<TransferEventData[]> {
  const baseUrl = config.apiUrl ?? DEFAULT_HORIZON_URL;
  const relayer = facilitatorConfig.address;
  const { symbol } = facilitatorConfig.token;

  logger.log(
    `[${config.chain}] Horizon: transactions for relayer ${relayer} in ${since.toISOString()}..${now.toISOString()}`
  );

  // Walk the relayer's transactions newest-first and stop once we fall out of
  // the requested window.
  const transactions: HorizonTransaction[] = [];
  let url =
    `${baseUrl}/accounts/${relayer}/transactions` +
    `?order=desc&limit=${PAGE_LIMIT}&include_failed=false`;

  outer: for (let page = 0; page < MAX_PAGES; page++) {
    const body = await horizonGet<HorizonTransaction>(url);
    const records = body._embedded?.records ?? [];
    if (records.length === 0) break;

    for (const tx of records) {
      const at = new Date(tx.created_at);
      if (at < since) break outer;
      if (at > now) continue;
      if (tx.successful) transactions.push(tx);
    }

    const next = body._links?.next?.href;
    if (!next) break;
    url = next;
  }

  logger.log(
    `[${config.chain}] ${transactions.length} relayer transactions in window`
  );
  if (transactions.length === 0) return [];

  // Pull operations per transaction and keep only contract invocations that
  // moved the facilitator's token.
  const rows: SorobanTransferRow[] = [];

  for (const tx of transactions) {
    // No try/catch: a failed lookup has to fail the window (see horizonFetch).
    const body = await horizonGet<HorizonOperation>(
      `${baseUrl}/transactions/${tx.hash}/operations?limit=${PAGE_LIMIT}`
    );
    const ops = body._embedded?.records ?? [];

    let logIndex = 0;
    for (const op of ops) {
      if (op.type !== 'invoke_host_function') continue;
      for (const change of op.asset_balance_changes ?? []) {
        const index = logIndex++;
        if (change.type !== 'transfer') continue;
        if (change.asset_code && change.asset_code !== symbol) continue;

        rows.push({
          logIndex: index,
          txHash: tx.hash,
          ledgerClosedAt: tx.created_at,
          from: change.from,
          to: change.to,
          // Horizon renders Stellar amounts in human units with 7 decimals.
          rawAmount: change.amount,
          transactionFrom: tx.fee_account ?? tx.source_account,
        });
      }
    }
  }

  logger.log(
    `[${config.chain}] ${rows.length} contract-invocation transfers attributed to ${relayer}`
  );

  return config.transformResponse(rows, config, facilitator, facilitatorConfig);
}

/**
 * Recipient-anchored discovery, for services such as ROZO's MPP Router that
 * are paid directly and settled by their own submitter rather than by a
 * registered facilitator.
 *
 * Horizon lists an `invoke_host_function` operation under every account whose
 * balance it changes, so `/accounts/{recipient}/operations` returns every SAC
 * transfer credited to the service, newest first, in pages of 200. The account
 * that only pays a fee bump is not a participant in that sense, which is why
 * the submitter path above needs one request per transaction and this path
 * does not: the MPP Router's full history (1,046 transfers on 2026-09-29) is
 * six pages. `join=transactions` embeds the transaction, so the fee payer comes
 * with each operation.
 *
 * A Soroban transaction carries exactly one operation, so counting balance
 * changes within the operation yields the same `log_index` as the submitter
 * path, which counts them across the transaction.
 */
async function fetchByRecipient(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): Promise<TransferEventData[]> {
  const baseUrl = config.apiUrl ?? DEFAULT_HORIZON_URL;
  const service = facilitatorConfig.address;
  const { symbol } = facilitatorConfig.token;

  logger.log(
    `[${config.chain}] Horizon: operations crediting ${service} in ${since.toISOString()}..${now.toISOString()}`
  );

  const rows: SorobanTransferRow[] = [];
  let url =
    `${baseUrl}/accounts/${service}/operations` +
    `?order=desc&limit=${PAGE_LIMIT}&include_failed=false&join=transactions`;

  outer: for (let page = 0; page < MAX_PAGES; page++) {
    const body = await horizonGet<HorizonOperation>(url);
    const records = body._embedded?.records ?? [];
    if (records.length === 0) break;

    for (const op of records) {
      const at = new Date(op.created_at);
      if (at < since) break outer;
      if (at > now) continue;
      if (op.type !== 'invoke_host_function') continue;

      let logIndex = 0;
      for (const change of op.asset_balance_changes ?? []) {
        const index = logIndex++;
        if (change.type !== 'transfer') continue;
        if (change.to !== service) continue;
        if (change.asset_code && change.asset_code !== symbol) continue;

        rows.push({
          logIndex: index,
          txHash: op.transaction_hash,
          ledgerClosedAt: op.created_at,
          from: change.from,
          to: change.to,
          rawAmount: change.amount,
          transactionFrom:
            op.transaction?.fee_account ??
            op.transaction?.source_account ??
            op.source_account,
        });
      }
    }

    const next = body._links?.next?.href;
    if (!next) break;
    url = next;
  }

  logger.log(
    `[${config.chain}] ${rows.length} transfers credited to service ${service}`
  );

  return config.transformResponse(rows, config, facilitator, facilitatorConfig);
}
