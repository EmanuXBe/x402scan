import { base, optimism, polygon } from 'wagmi/chains';

export enum Chain {
  BASE = 'base',
  SOLANA = 'solana',
  POLYGON = 'polygon',
  OPTIMISM = 'optimism',
  STELLAR = 'stellar',
}

/** Chains that are neither EVM nor addressable by a numeric chain id. */
export type NonEvmChain = Chain.SOLANA | Chain.STELLAR;

export type EvmChain = Exclude<Chain, NonEvmChain>;

/** Chains the explorer indexes and can display analytics for. */
export const SUPPORTED_CHAINS = [
  Chain.BASE,
  Chain.SOLANA,
  Chain.STELLAR,
] as const;

/**
 * Chains the embedded wallet can hold funds on and transact with. Deliberately
 * narrower than SUPPORTED_CHAINS: read/analytics support for a chain does not
 * imply wallet, onramp, deposit or withdraw support.
 */
export const WALLET_CHAINS = [Chain.BASE, Chain.SOLANA] as const;

export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export type WalletChain = (typeof WALLET_CHAINS)[number];

export type SupportedEVMChain = Exclude<SupportedChain, NonEvmChain>;

export const CHAIN_LABELS: Record<Chain, string> = {
  [Chain.BASE]: 'Base',
  [Chain.SOLANA]: 'Solana',
  [Chain.POLYGON]: 'Polygon',
  [Chain.OPTIMISM]: 'Optimism',
  [Chain.STELLAR]: 'Stellar',
};

export const CHAIN_ICONS: Record<Chain, string> = {
  [Chain.BASE]: '/base.png',
  [Chain.SOLANA]: '/solana.png',
  [Chain.POLYGON]: '/polygon.png',
  [Chain.OPTIMISM]: '/optimism.png',
  [Chain.STELLAR]: '/stellar.svg',
};

/**
 * Numeric chain ids only exist for EVM networks. Solana and Stellar use 0 —
 * they are identified by CAIP-2 strings instead (see lib/x402/chain-mapping).
 */
export const CHAIN_ID: Record<Chain, number> = {
  [Chain.BASE]: base.id,
  [Chain.POLYGON]: polygon.id,
  [Chain.OPTIMISM]: optimism.id,
  [Chain.SOLANA]: 0,
  [Chain.STELLAR]: 0,
};
