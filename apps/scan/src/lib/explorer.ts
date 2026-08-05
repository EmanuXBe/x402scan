import { Chain } from '@/types/chain';

/**
 * Block explorer deep links per chain.
 *
 * Stellar is not EVM-shaped: accounts (`G…`) and contracts (`C…`) live under
 * different stellar.expert paths, so the account helper inspects the strkey
 * prefix rather than assuming a single address space.
 */
const EXPLORERS: Record<Chain, { tx: string; account: string }> = {
  [Chain.BASE]: {
    tx: 'https://basescan.org/tx/',
    account: 'https://basescan.org/address/',
  },
  [Chain.POLYGON]: {
    tx: 'https://polygonscan.com/tx/',
    account: 'https://polygonscan.com/address/',
  },
  [Chain.OPTIMISM]: {
    tx: 'https://optimistic.etherscan.io/tx/',
    account: 'https://optimistic.etherscan.io/address/',
  },
  [Chain.SOLANA]: {
    tx: 'https://solscan.io/tx/',
    account: 'https://solscan.io/account/',
  },
  [Chain.STELLAR]: {
    tx: 'https://stellar.expert/explorer/public/tx/',
    account: 'https://stellar.expert/explorer/public/account/',
  },
};

const STELLAR_CONTRACT_PATH = 'https://stellar.expert/explorer/public/contract/';

const isChain = (value: string): value is Chain =>
  (Object.values(Chain) as string[]).includes(value);

export const explorerTxUrl = (chain: string, txHash: string): string | null =>
  isChain(chain) ? `${EXPLORERS[chain].tx}${txHash}` : null;

export const explorerAccountUrl = (
  chain: string,
  address: string
): string | null => {
  if (!isChain(chain)) return null;
  if (chain === Chain.STELLAR && address.startsWith('C')) {
    return `${STELLAR_CONTRACT_PATH}${address}`;
  }
  return `${EXPLORERS[chain].account}${address}`;
};

export const explorerName = (chain: string): string =>
  chain === Chain.STELLAR
    ? 'stellar.expert'
    : chain === Chain.SOLANA
      ? 'Solscan'
      : chain === Chain.POLYGON
        ? 'Polygonscan'
        : chain === Chain.OPTIMISM
          ? 'Optimistic Etherscan'
          : 'Basescan';
