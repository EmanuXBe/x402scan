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
 * since the cursor resumes from the newest stored transfer, the skipped
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

function horizonGetOne<T>(url: string): Promise<T> {
  return horizonFetch<T>(url);
}

function horizonGet<T>(url: string): Promise<HorizonPage<T>> {
  return horizonFetch<HorizonPage<T>>(url);
}

/**
 * Stellar x402 settlements are Soroban contract invocations against the USDC
 * SAC, submitted by the facilitator's relayer. Two properties make them
 * attributable, and both are needed:
 *
 *  1. The relayer is the transaction's source (or fee) account — the anchor.
 *  2. The operation is `invoke_host_function`, not a classic `payment`.
 *
 * The second filter matters more than it looks: a SAC mirrors its classic
 * asset, so ordinary USDC payments also emit `transfer` contract events.
 * Filtering on events alone sweeps in the entire classic payment volume of the
 * network. Only contract invocations are protocol-level agentic payments.
 *
 * Horizon is used rather than Soroban RPC because RPC `getTransaction` retains
 * only a short window — a scan of 4,012 transactions resolved just 61 — while
 * Horizon keeps full history and returns `asset_balance_changes` already
 * decoded, with no XDR handling required.
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

const DEFAULT_SOROBAN_RPC_URL = 'https://mainnet.sorobanrpc.com';
/** Stellar closes a ledger roughly every 5 seconds. */
const LEDGER_SECONDS = 5;
const EVENT_PAGE_LIMIT = 200;
const MAX_EVENT_PAGES = 40;

interface SorobanEvent {
  txHash: string;
  ledger: number;
  ledgerClosedAt: string;
  topic: string[];
  value: string;
  inSuccessfulContractCall?: boolean;
}

async function sorobanRpc<T>(
  url: string,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: unknown };
  if (json.error) {
    throw new Error(`Soroban RPC ${method}: ${JSON.stringify(json.error)}`);
  }
  return json.result as T;
}

/**
 * Recipient-anchored discovery, for protocols like MPP Charge that settle
 * agent-to-service with no intermediary.
 *
 * This path exists because of an indexing asymmetry in Stellar's own tooling:
 * Horizon keys transactions by source account, so a submitter anchor gets full
 * history from one paginated query — but it does NOT index contract transfers
 * by receiving account, and `/accounts/{id}/payments` returns nothing for them.
 * The only way to find "everything paid to this service" is to scan contract
 * events, which the public RPC retains for days rather than months — the exact
 * window is reported by `getHealth` and must be read, not assumed.
 *
 * The practical consequence is that submitter-anchored protocols are cheap to
 * index and recipient-anchored ones are not. See docs/MPP-ATTRIBUTION.md.
 */
async function fetchByRecipient(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): Promise<TransferEventData[]> {
  const rpcUrl = config.rpcUrl ?? DEFAULT_SOROBAN_RPC_URL;
  const horizonUrl = config.apiUrl ?? DEFAULT_HORIZON_URL;
  const service = facilitatorConfig.address;
  const sac = facilitatorConfig.token.address;

  const health = await sorobanRpc<{
    latestLedger: number;
    oldestLedger: number;
  }>(rpcUrl, 'getHealth');

  const secondsBack = Math.max(0, (now.getTime() - since.getTime()) / 1000);
  const requestedStart = Math.max(
    1,
    health.latestLedger - Math.ceil(secondsBack / LEDGER_SECONDS)
  );

  // getEvents rejects a startLedger outside the node's retention window, so the
  // request has to be clamped rather than derived from the sync window alone.
  // The two Stellar anchors are bounded by opposite things: the submitter path
  // wants windows as wide as possible because Horizon keeps full history, while
  // this path can never see further back than the RPC retains (7 days on
  // mainnet.sorobanrpc.com as of 2026-08-05, per its own `ledgerRetentionWindow`
  // — but that is a node setting, hence the runtime read). A clamp is not a fix
  // for that gap — history older than
  // oldestLedger is simply unobservable here, and needs Hubble or a Galexie
  // data lake. See docs/MPP-ATTRIBUTION.md.
  const startLedger = Math.max(requestedStart, health.oldestLedger);

  if (startLedger > requestedStart) {
    const missedLedgers = startLedger - requestedStart;
    logger.warn(
      `[${config.chain}] recipient anchor ${service}: requested ledger ` +
        `${requestedStart} predates RPC retention (oldest ${health.oldestLedger}); ` +
        `${missedLedgers} ledgers (~${Math.round(
          (missedLedgers * LEDGER_SECONDS) / 3600
        )}h) of this window cannot be observed`
    );
  }

  logger.log(
    `[${config.chain}] recipient anchor ${service}: scanning events from ledger ${startLedger}`
  );

  const candidateHashes = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const filters = [{ type: 'contract', contractIds: [sac] }];
    const params = cursor
      ? { filters, pagination: { cursor, limit: EVENT_PAGE_LIMIT } }
      : { startLedger, filters, pagination: { limit: EVENT_PAGE_LIMIT } };

    const result = await sorobanRpc<{
      events?: SorobanEvent[];
      cursor?: string;
    }>(rpcUrl, 'getEvents', params);

    const events = result.events ?? [];
    for (const event of events) {
      if (event.inSuccessfulContractCall === false) continue;
      candidateHashes.add(event.txHash);
    }
    cursor = result.cursor;
    if (events.length < EVENT_PAGE_LIMIT || !cursor) break;
  }

  logger.log(
    `[${config.chain}] ${candidateHashes.size} candidate transactions in RPC retention window`
  );

  // Resolve each candidate through Horizon and keep only contract invocations
  // that credited this service.
  const rows: SorobanTransferRow[] = [];

  for (const hash of candidateHashes) {
    // No try/catch, for the same reason as the submitter path.
    const [tx, opsBody] = await Promise.all([
      horizonGetOne<HorizonTransaction>(`${horizonUrl}/transactions/${hash}`),
      horizonGet<HorizonOperation>(
        `${horizonUrl}/transactions/${hash}/operations?limit=${PAGE_LIMIT}`
      ),
    ]);

    let logIndex = 0;
    for (const op of opsBody._embedded?.records ?? []) {
      if (op.type !== 'invoke_host_function') continue;
      for (const change of op.asset_balance_changes ?? []) {
        const index = logIndex++;
        if (change.type !== 'transfer') continue;
        if (change.to !== service) continue;
        if (
          change.asset_code &&
          change.asset_code !== facilitatorConfig.token.symbol
        ) {
          continue;
        }

        rows.push({
          logIndex: index,
          txHash: hash,
          ledgerClosedAt: tx.created_at,
          from: change.from,
          to: change.to,
          rawAmount: change.amount,
          transactionFrom: tx.fee_account ?? tx.source_account,
        });
      }
    }
  }

  logger.log(
    `[${config.chain}] ${rows.length} transfers credited to service ${service}`
  );

  return config.transformResponse(rows, config, facilitator, facilitatorConfig);
}
