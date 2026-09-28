import {
  optionalSupportedChainSchema,
  walletChainSchema,
} from '@/lib/schemas';

export const parseChain = (chain: unknown) => {
  const result = optionalSupportedChainSchema.safeParse(chain);
  if (!result.success) {
    return undefined;
  }
  return result.data;
};

/**
 * Narrower than parseChain: resolves only chains the embedded wallet supports.
 * Read-only chains (e.g. Stellar) parse to undefined here on purpose.
 */
export const parseWalletChain = (chain: unknown) => {
  const result = walletChainSchema.safeParse(chain);
  return result.success ? result.data : undefined;
};
