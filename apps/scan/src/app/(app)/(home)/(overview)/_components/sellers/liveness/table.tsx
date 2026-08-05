'use client';

import { api } from '@/trpc/client';

import { DataTable } from '@/components/ui/data-table';

import { columns } from './columns';
import { useChain } from '@/app/(app)/_contexts/chain/hook';

import { LIVENESS_LIMIT } from './constants';

export const SellerLivenessTable = () => {
  const { chain } = useChain();

  // All-time deliberately: a timeframe filter would hide exactly the sellers
  // this table exists to expose, since a dormant seller has no recent rows.
  const [sellers] = api.public.stats.sellerLiveness.useSuspenseQuery({
    chain,
    timeframe: 0,
    limit: LIVENESS_LIMIT,
  });

  return <DataTable columns={columns} data={sellers} />;
};
