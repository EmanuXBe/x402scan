import { Network } from '../types';
import { USDC_STELLAR_TOKEN } from '../constants';

import type { Facilitator } from '../types';

/**
 * ROZO's MPP Router: an open-source router that lets Stellar-funded clients pay
 * MPP services through one API (github.com/mpprouter/rozo-mpprouter).
 *
 * It is not an x402 facilitator. Payments are MPP Charge transfers to the
 * router's payTo, submitted and fee-bumped by ROZO's own account, and none of
 * them go through OZ Channels. So the router is anchored on the address that
 * receives, not on one that submits. As of 2026-09-29 that address had 1,046
 * inbound USDC transfers since 2026-04-10 (docs/data/2026-09-29-mpp-router.json).
 *
 * Some payers are likely ROZO's own test wallets; see docs/STELLAR.md before
 * reading these figures as third-party demand.
 */
export const rozoFacilitator = {
  id: 'rozo',
  metadata: {
    name: 'ROZO MPP Router',
    image: '/facilitators/rozo.svg',
    docsUrl: 'https://github.com/mpprouter/rozo-mpprouter',
    color: '#C2703D',
  },
  config: {
    url: 'https://apiserver.mpprouter.dev',
  },
  addresses: {
    [Network.STELLAR]: [
      {
        address: 'GDK3AVW3YE6UL3J4WLNKBMP65KSY32YPUKIOC6PXW65XJ3LEG3YIDXXB',
        tokens: [USDC_STELLAR_TOKEN],
        dateOfFirstTransaction: new Date('2026-04-10'),
        anchor: 'recipient',
      },
    ],
  },
} as const satisfies Facilitator;
