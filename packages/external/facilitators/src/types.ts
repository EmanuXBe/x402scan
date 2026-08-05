import type { FacilitatorConfig } from 'x402/types';

export type { FacilitatorConfig } from 'x402/types';
export type FacilitatorConfigConstructor<Props = void> = (
  requirements: Props
) => FacilitatorConfig;

type FacilitatorConfigProp<Props = void> =
  | FacilitatorConfig
  | FacilitatorConfigConstructor<Props>;

export interface Facilitator<Props = void> {
  id: string;
  metadata: FacilitatorMetadata;
  config: FacilitatorConfigProp<Props>;
  addresses: Partial<Record<Network, FacilitatorAddress[]>>;
  discoveryConfig?: FacilitatorConfig;
  deprecated?: boolean;
}

export interface FacilitatorMetadata {
  name: string;
  image: string;
  docsUrl: string;
  color: string;
}

/**
 * How an on-chain address identifies payments belonging to this entity.
 *
 * `submitter` — the address submits (and usually sponsors) the transaction, as
 * an x402 facilitator relayer does. Cheap to index: block explorers key
 * transactions by source account, so full history is one paginated query.
 *
 * `recipient` — the address only receives, as an MPP Charge service does. There
 * is no intermediary to key on, and Horizon does not index contract transfers
 * by receiving account, so discovery falls back to scanning contract events
 * within the RPC retention window.
 */
export type AttributionAnchor = 'submitter' | 'recipient';

export interface FacilitatorAddress {
  address: string;
  tokens: Token[];
  dateOfFirstTransaction: Date;
  deprecated?: boolean;
  /** Defaults to `submitter`, which is how every EVM/Solana facilitator works. */
  anchor?: AttributionAnchor;
}

export interface Token {
  address: string;
  decimals: number;
  symbol: string;
}

export enum Network {
  BASE = 'base',
  POLYGON = 'polygon',
  SOLANA = 'solana',
  STELLAR = 'stellar',
}
