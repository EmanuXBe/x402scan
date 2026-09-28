'use client';

import { useState } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import type { EcosystemCategory, EcosystemItem } from '@/lib/ecosystem/schema';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface Props {
  item: EcosystemItem;
  showBadge?: boolean;
}

export const EcosystemCard: React.FC<Props> = ({ item, showBadge }) => {
  return (
    <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer">
      <Card className="justify-between flex flex-col hover:border-primary transition-colors h-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <EcosystemLogo name={item.name} logoUrl={item.logoUrl} />
            <CardTitle>{item.name}</CardTitle>
          </div>
          <CardDescription>{item.description}</CardDescription>
        </CardHeader>
        {showBadge && (
          <CardContent>
            <Badge category={item.category} />
          </CardContent>
        )}
      </Card>
    </a>
  );
};

/**
 * Several ecosystem logos are hosted on x402.org and currently 404 there, so a
 * broken <Image> would render as a torn-icon on every card. Fall back to a
 * monogram tile instead of showing the failure.
 */
const EcosystemLogo = ({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string;
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="size-4 rounded-md bg-muted flex items-center justify-center text-[8px] font-semibold text-muted-foreground shrink-0">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={logoUrl}
      alt={name}
      width={16}
      height={16}
      className="rounded-md"
      onError={() => setFailed(true)}
    />
  );
};

const Badge = ({ category }: { category: EcosystemCategory }) => {
  const categoryClassName: Record<EcosystemCategory, string> = {
    'Client-Side Integrations': 'bg-blue-600/10 border-blue-600',
    'Services/Endpoints': 'bg-green-600/10 border-green-600',
    'Infrastructure & Tooling': 'bg-purple-600/10 border-purple-600',
    'Learning & Community Resources': 'bg-orange-600/10 border-orange-600',
    Facilitators: 'bg-red-600/10 border-red-600',
  };

  return (
    <div
      className={cn(
        'text-xs font-semibold bg-muted rounded-md px-2 py-1 w-fit',
        categoryClassName[category]
      )}
    >
      {category}
    </div>
  );
};
