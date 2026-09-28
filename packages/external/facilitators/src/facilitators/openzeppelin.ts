import { Network } from '../types';
import { USDC_STELLAR_TOKEN } from '../constants';

import type { Facilitator } from '../types';

/**
 * OpenZeppelin Channels — the x402 facilitator for Stellar.
 *
 * Unlike EVM facilitators, the Stellar flow has clients sign contract auth
 * entries while the relayer assembles, sponsors and submits the transaction.
 * The relayer therefore shows up as the transaction's source account, which is
 * the anchor the sync adapter matches on (see docs/STELLAR.md).
 *
 * The relayer account is published by the facilitator itself: an authenticated
 * GET on `/x402/supported` returns `signers["stellar:pubnet"]`. It is confirmed
 * on-chain — funded, and settling `invoke_host_function` USDC transfers since
 * 2026-03-06.
 */
export const openzeppelinFacilitator = {
  id: 'openzeppelin',
  metadata: {
    name: 'OpenZeppelin Channels',
    image: '/facilitators/openzeppelin.svg',
    docsUrl: 'https://channels.openzeppelin.com',
    color: '#4E5EE4',
  },
  config: {
    url: 'https://channels.openzeppelin.com/x402',
  },
  addresses: {
    [Network.STELLAR]: [
      {
        address: 'GA5SXMFJTUPTZRIEKM6XZLCYOZRMUEE6KGAHL3GXDBG64DYOUIWYIF3M',
        tokens: [USDC_STELLAR_TOKEN],
        dateOfFirstTransaction: new Date('2026-03-06'),
      },
    ],
  },
} as const satisfies Facilitator;

export { USDC_STELLAR_TOKEN };
