'use client';

import { api } from '@/trpc/client';

import { Card, CardContent } from '@/components/ui/card';
import { formatTokenAmount } from '@/lib/token';
import { cn } from '@/lib/utils';
import { useChain } from '@/app/(app)/_contexts/chain/hook';

/** Base-6 units off the wire; round before BigInt so a float artefact cannot throw. */
const usdc = (v: number | null) =>
  v === null ? '—' : formatTokenAmount(BigInt(Math.round(v)));

const duration = (seconds: number | null) => {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
};

const Tile = ({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) => (
  <Card className={cn(highlight && 'border-emerald-500/40')}>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </CardContent>
  </Card>
);

export const MachineProfilePanel = () => {
  const { chain } = useChain();

  // All-time: these are shape-of-traffic signals, and a short window on a
  // low-volume chain produces a median drawn from a handful of payments.
  const [p] = api.public.stats.machineProfile.useSuspenseQuery({
    chain,
    timeframe: 0,
  });

  // Flatness is the modal share, not a percentile comparison: most payments
  // sitting on one exact amount is a per-call price list, which is what a
  // machine buyer produces and a human buyer does not.
  const flatPricing = p.modal_share !== null && p.modal_share >= 0.5;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Payments" value={p.payments.toLocaleString()} />
      <Tile
        label="Most common payment"
        value={usdc(p.modal_amount)}
        hint={
          p.modal_share === null
            ? undefined
            : `${(p.modal_share * 100).toFixed(1)}% of payments${flatPricing ? ' — flat per-call price' : ''}`
        }
        highlight={flatPricing}
      />
      <Tile
        label="Median payment"
        value={usdc(p.median_amount)}
        hint={`p95 ${usdc(p.p95_amount)}`}
      />
      <Tile
        label="Median gap between a buyer's payments"
        value={duration(p.median_gap_seconds)}
        hint={
          p.median_gap_seconds !== null && p.median_gap_seconds < 300
            ? 'machine cadence'
            : undefined
        }
        highlight={p.median_gap_seconds !== null && p.median_gap_seconds < 300}
      />
      <Tile
        label="Busiest day"
        value={p.busiest_day_payments.toLocaleString()}
        hint={`across ${p.active_days.toLocaleString()} active days`}
      />
      <Tile label="Buyers" value={p.unique_buyers.toLocaleString()} />
      <Tile label="Sellers" value={p.unique_sellers.toLocaleString()} />
      <Tile
        label="Buyer–seller pairs"
        value={p.pairs.toLocaleString()}
        hint={
          p.unique_buyers > 0
            ? `${(p.pairs / p.unique_buyers).toFixed(1)} sellers per buyer`
            : undefined
        }
      />
      <Tile label="Active days" value={p.active_days.toLocaleString()} />
    </div>
  );
};
