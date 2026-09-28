'use client';

import {
  Activity,
  Calendar,
  DollarSign,
  Flame,
  Hash,
  Server,
} from 'lucide-react';

import { HeaderCell } from '@/components/ui/data-table/header-cell';

import { Seller, SellerSkeleton } from '@/app/(app)/_components/seller';

import { formatTokenAmount } from '@/lib/token';
import { formatCompactAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

import { Skeleton } from '@/components/ui/skeleton';

import type { ExtendedColumnDef } from '@/components/ui/data-table';
import type { RouterOutputs } from '@/trpc/client';

type ColumnType = RouterOutputs['public']['stats']['sellerLiveness'][number];

const STATUS_STYLES: Record<ColumnType['status'], string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  idle: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  dormant: 'bg-muted text-muted-foreground',
};

export const columns: ExtendedColumnDef<ColumnType>[] = [
  {
    accessorKey: 'recipient',
    header: () => (
      <HeaderCell Icon={Server} label="Server" className="justify-start" />
    ),
    cell: ({ row }) => (
      <Seller
        address={row.original.recipient}
        disableCopy
        addressClassName="font-normal"
      />
    ),
    size: 225,
    loading: () => <SellerSkeleton />,
  },
  {
    accessorKey: 'status',
    header: () => (
      <HeaderCell Icon={Activity} label="Status" className="mx-auto" />
    ),
    cell: ({ row }) => (
      <div className="text-center">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
            STATUS_STYLES[row.original.status]
          )}
        >
          {row.original.status}
        </span>
      </div>
    ),
    size: 90,
    loading: () => <Skeleton className="h-4 w-14 mx-auto" />,
  },
  {
    accessorKey: 'payments',
    header: () => (
      <HeaderCell Icon={Hash} label="Payments" className="mx-auto" />
    ),
    cell: ({ row }) => (
      <div className="text-center font-mono text-xs">
        {row.original.payments.toLocaleString()}
      </div>
    ),
    size: 90,
    loading: () => <Skeleton className="h-4 w-12 mx-auto" />,
  },
  {
    accessorKey: 'volume',
    header: () => (
      <HeaderCell Icon={DollarSign} label="Volume" className="mx-auto" />
    ),
    cell: ({ row }) => (
      <div className="text-center font-mono text-xs">
        {/* volume arrives as a float from SUM(); amounts are integral base
            units, but round before BigInt so a float artefact cannot throw. */}
        {formatTokenAmount(BigInt(Math.round(row.original.volume)))}
      </div>
    ),
    size: 90,
    loading: () => <Skeleton className="h-4 w-12 mx-auto" />,
  },
  {
    accessorKey: 'active_days',
    header: () => (
      <HeaderCell Icon={Calendar} label="Active / span" className="mx-auto" />
    ),
    cell: ({ row }) => {
      const { active_days, span_days } = row.original;
      // The ratio is the point of this table: 2 active days inside a 17-day
      // span is a burst, 29 inside 33 is a business. Payment counts rank those
      // two in exactly the wrong order, so the denominator has to stay visible.
      const ratio = span_days > 0 ? active_days / span_days : 0;
      return (
        <div className="text-center font-mono text-xs">
          <span
            className={cn(ratio < 0.25 && 'text-amber-600 dark:text-amber-400')}
          >
            {active_days}
          </span>
          <span className="text-muted-foreground"> / {span_days}</span>
        </div>
      );
    },
    size: 110,
    loading: () => <Skeleton className="h-4 w-16 mx-auto" />,
  },
  {
    accessorKey: 'busiest_day_share',
    header: () => (
      <HeaderCell Icon={Flame} label="Peak day" className="mx-auto" />
    ),
    cell: ({ row }) => {
      const share = row.original.busiest_day_share;
      // Near 1.0 means the seller's entire history landed on one day — the
      // signature of a test run or benchmark rather than of customers.
      return (
        <div
          className={cn(
            'text-center font-mono text-xs',
            share >= 0.9 && 'text-red-600 dark:text-red-400 font-medium'
          )}
        >
          {(share * 100).toFixed(0)}%
        </div>
      );
    },
    size: 90,
    loading: () => <Skeleton className="h-4 w-12 mx-auto" />,
  },
  {
    accessorKey: 'unique_buyers',
    header: () => <HeaderCell Icon={Hash} label="Buyers" className="mx-auto" />,
    cell: ({ row }) => (
      <div className="text-center font-mono text-xs">
        {row.original.unique_buyers.toLocaleString()}
      </div>
    ),
    size: 80,
    loading: () => <Skeleton className="h-4 w-10 mx-auto" />,
  },
  {
    accessorKey: 'last_seen',
    header: () => (
      <HeaderCell Icon={Calendar} label="Last paid" className="mx-auto" />
    ),
    cell: ({ row }) => (
      <div className="text-center font-mono text-xs">
        {formatCompactAgo(row.original.last_seen)}
      </div>
    ),
    size: 90,
    loading: () => <Skeleton className="h-4 w-12 mx-auto" />,
  },
];
