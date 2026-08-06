import { Suspense } from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { Section } from '@/app/_components/layout/page-utils';
import { Skeleton } from '@/components/ui/skeleton';

import { MachineProfilePanel } from './panel';

import { api, HydrateClient } from '@/trpc/server';

import type { Chain } from '@/types/chain';

interface Props {
  chain?: Chain;
}

export const MachineProfile: React.FC<Props> = ({ chain }) => {
  void api.public.stats.machineProfile.prefetch({ chain, timeframe: 0 });

  return (
    <HydrateClient>
      <MachineProfileContainer>
        <ErrorBoundary
          fallback={<p>There was an error loading the machine profile</p>}
        >
          <Suspense fallback={<LoadingMachineProfilePanel />}>
            <MachineProfilePanel />
          </Suspense>
        </ErrorBoundary>
      </MachineProfileContainer>
    </HydrateClient>
  );
};

export const LoadingMachineProfile = () => (
  <MachineProfileContainer>
    <LoadingMachineProfilePanel />
  </MachineProfileContainer>
);

const LoadingMachineProfilePanel = () => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
    {Array.from({ length: 8 }, (_, i) => (
      <Skeleton key={i} className="h-24" />
    ))}
  </div>
);

const MachineProfileContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <Section
    title="Machine payment profile"
    description="The shape of the payment flow rather than its size. Derived only from observed transfers, so it works on any chain from its first payment — unlike the registry-backed panels, which read zero until services self-register."
  >
    {children}
  </Section>
);
