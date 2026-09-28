'use client';

import { createContext } from 'react';

import type { WalletChain } from '@/types/chain';

interface WalletChainContextType {
  chain: WalletChain;
  setChain: (chain: WalletChain) => void;
  isFixed: boolean;
}

export const WalletChainContext = createContext<
  WalletChainContextType | undefined
>(undefined);
