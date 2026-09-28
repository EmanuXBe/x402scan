import type { EcosystemItem } from './schema';

export const defaultEcosystemItems: EcosystemItem[] = [
  {
    name: 'awesome-x402',
    description: 'A curated list of resources for the x402 ecosystem.',
    logoUrl: 'https://www.merit.systems/logo/dark.svg',
    websiteUrl: 'https://github.com/Merit-Systems/awesome-x402',
    category: 'Learning & Community Resources',
  },
  // Stellar had no ecosystem entries upstream despite running live x402 traffic
  // on mainnet since 2026-03-06.
  {
    name: 'OpenZeppelin Channels',
    description:
      'The x402 facilitator for Stellar. Verifies and settles per-request payments with sponsored fees, so agents pay in USDC without holding XLM. ~5s finality.',
    logoUrl: '/openzeppelin.svg',
    websiteUrl: 'https://channels.openzeppelin.com',
    category: 'Facilitators',
  },
  {
    name: 'x402 on Stellar',
    description:
      'Stellar Development Foundation documentation for building x402 sellers and agent buyers on Stellar, using SAC-based USDC and contract auth-entry signing.',
    logoUrl: '/stellar.svg',
    websiteUrl: 'https://developers.stellar.org/docs/build/agentic-payments',
    category: 'Learning & Community Resources',
  },
  {
    name: 'Stellar MPP',
    description:
      'Machine Payments Protocol — Stellar-native agent payments with no facilitator. Charge mode settles per request; Channel mode signs off-chain commitments and settles once.',
    logoUrl: '/stellar.svg',
    websiteUrl: 'https://github.com/stellar/stellar-mpp-sdk',
    category: 'Infrastructure & Tooling',
  },
];
