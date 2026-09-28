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

const STELLAR_CONTRACT_PATH =
  'https://stellar.expert/explorer/public/contract/';

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

const EXPLORER_NAMES: Record<Chain, string> = {
  [Chain.BASE]: 'Basescan',
  [Chain.POLYGON]: 'Polygonscan',
  [Chain.OPTIMISM]: 'Optimistic Etherscan',
  [Chain.SOLANA]: 'Solscan',
  [Chain.STELLAR]: 'stellar.expert',
};

/**
 * Returns null for an unrecognised chain rather than a default name.
 *
 * This was a ternary chain ending in `: 'Basescan'`, which meant any value that
 * matched nothing — a new chain, a typo, a string from the database — was
 * labelled Basescan and linked nowhere near it. A Record also makes the mapping
 * exhaustive: adding a Chain member now fails to compile until it has a name,
 * which a fallback branch silently absorbed.
 */
export const explorerName = (chain: string): string | null =>
  isChain(chain) ? EXPLORER_NAMES[chain] : null;
