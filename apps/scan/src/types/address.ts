import type { Address } from 'viem';

export type EthereumAddress = Address;
export type SolanaAddress = string & { readonly __brand: unique symbol };
/** Stellar strkey: `G…` account or `C…` contract. Case-sensitive base32. */
export type StellarAddress = string & { readonly __stellarBrand: unique symbol };
export type MixedAddress = EthereumAddress | SolanaAddress | StellarAddress;
