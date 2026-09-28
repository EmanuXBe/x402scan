import type { Chain, SupportedEVMChain, WalletChain } from '@/types/chain';
import type z from 'zod';
import type { getTokenBalanceSchema, sendTokensSchema } from './schemas';
import type { SolanaAddress } from '@/types/address';
import type { Address } from 'viem';
import type { CdpResultAsync } from '../../result';

export type NetworkServerWallet<T extends Chain> = (name: string) => {
  address: () => CdpResultAsync<
    T extends Chain.SOLANA ? SolanaAddress : Address
  >;
  getTokenBalance: (
    input: z.infer<typeof getTokenBalanceSchema>
  ) => CdpResultAsync<number>;
  getNativeTokenBalance: () => CdpResultAsync<number>;
  export: () => CdpResultAsync<string>;
  signer: () => Promise<unknown>;
  sendTokens: (
    input: z.infer<typeof sendTokensSchema>
  ) => CdpResultAsync<string>;
};

export type EvmWallets = {
  [K in SupportedEVMChain]: ReturnType<NetworkServerWallet<K>>;
};

// Keyed on WalletChain, not SupportedChain: the explorer indexes more chains
// than the embedded wallet can transact on.
export type Wallets = {
  [K in WalletChain]: ReturnType<NetworkServerWallet<K>>;
};
