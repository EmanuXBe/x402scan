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
 * `submitter`: the address submits or fee-bumps the transaction, as an x402
 * facilitator does. On Stellar, Horizon lists the transactions of a fee-bump
 * payer but not their operations, so each payment costs one extra request.
 *
 * `recipient`: the address receives the payment, as a service paid directly
 * does (for example, an MPP Charge service). Horizon lists every SAC transfer
 * under its recipient, so full history is one paginated query.
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
