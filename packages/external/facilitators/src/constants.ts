import type { Token } from './types';

const USDC_DECIMALS = 6;
const USDC_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC on Polygon

export const USDC_BASE_TOKEN: Token = {
  address: USDC_BASE,
  decimals: USDC_DECIMALS,
  symbol: 'USDC',
};

export const USDC_SOLANA_TOKEN: Token = {
  address: USDC_SOLANA,
  decimals: USDC_DECIMALS,
  symbol: 'USDC',
};

export const USDC_POLYGON_TOKEN: Token = {
  address: USDC_POLYGON,
  decimals: USDC_DECIMALS,
  symbol: 'USDC',
};

// Stellar assets use 7 decimals, not 6. USDC is exposed to contracts through a
// Stellar Asset Contract (SAC), so the "address" here is a C... contract id.
const USDC_STELLAR_DECIMALS = 7;
const USDC_STELLAR_PUBNET =
  'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const USDC_STELLAR_TESTNET =
  'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

export const USDC_STELLAR_TOKEN: Token = {
  address: USDC_STELLAR_PUBNET,
  decimals: USDC_STELLAR_DECIMALS,
  symbol: 'USDC',
};

export const USDC_STELLAR_TESTNET_TOKEN: Token = {
  address: USDC_STELLAR_TESTNET,
  decimals: USDC_STELLAR_DECIMALS,
  symbol: 'USDC',
};
