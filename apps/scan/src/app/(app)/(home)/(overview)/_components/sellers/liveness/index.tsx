import { Suspense } from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { DataTable } from '@/components/ui/data-table';

import { Section } from '@/app/_components/layout/page-utils';

import { columns } from './columns';
import { SellerLivenessTable } from './table';
import { LIVENESS_LIMIT } from './constants';

import { api, HydrateClient } from '@/trpc/server';

import type { Chain } from '@/types/chain';

interface Props {
  chain?: Chain;
}

export const SellerLiveness: React.FC<Props> = ({ chain }) => {
  void api.public.stats.sellerLiveness.prefetch({
    chain,
    timeframe: 0,
    limit: LIVENESS_LIMIT,
  });

  return (
    <HydrateClient>
      <SellerLivenessContainer>
        <ErrorBoundary
          fallback={<p>There was an error loading the seller liveness data</p>}
        >
          <Suspense fallback={<LoadingSellerLivenessTable />}>
            <SellerLivenessTable />
          </Suspense>
        </ErrorBoundary>
      </SellerLivenessContainer>
    </HydrateClient>
  );
};

export const LoadingSellerLiveness = () => {
  return (
    <SellerLivenessContainer>
      <LoadingSellerLivenessTable />
    </SellerLivenessContainer>
  );
};

const LoadingSellerLivenessTable = () => {
  return (
    <DataTable
      columns={columns}
      data={[]}
      loadingRowCount={LIVENESS_LIMIT}
      isLoading
    />
  );
};

const SellerLivenessContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <Section
      title="Seller liveness"
      description="Which servers are still trading, and whether their totals were ever real. Ordered by most recently paid — a lifetime payment count ranks a two-day burst above a live business."
    >
      {children}
    </Section>
  );
};
