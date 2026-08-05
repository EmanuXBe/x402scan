import { Chain } from '@/types/chain';
import type { WalletChain } from '@/types/chain';
import { SIWE_PROVIDER_ID } from './siwe/constants';
import { SIWS_PROVIDER_ID } from './siws/constants';

// Keyed on WalletChain: only chains the wallet can sign with have an auth
// provider. Read-only chains (e.g. Stellar) are intentionally absent.
export const chainToAuthProviderId: Record<WalletChain, string> = {
  [Chain.BASE]: SIWE_PROVIDER_ID,
  [Chain.SOLANA]: SIWS_PROVIDER_ID,
};
