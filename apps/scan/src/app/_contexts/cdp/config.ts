import { env } from '@/env';
import type { Config } from '@coinbase/cdp-hooks';

export const cdpConfig: Config = {
  projectId:
    env.NEXT_PUBLIC_CDP_PROJECT_ID ?? "00000000-0000-0000-0000-000000000000",
  ethereum: {
    createOnLogin: 'eoa',
  },
  solana: {
    createOnLogin: true,
  },
};
