import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

import { neon, neonConfig } from '@neondatabase/serverless';
import { Pool } from 'pg';

import { readReplicas } from './read-replicas/extension';

import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// Local Postgres support: Neon's serverless driver only speaks to Neon
// endpoints. When the connection string points at localhost, fall back to the
// standard pg driver so the app runs without a Neon account.
const isLocalUrl = (url: string | undefined) =>
  !!url && /localhost|127\.0\.0\.1/.test(url);

const IS_LOCAL = isLocalUrl(process.env.TRANSFERS_DB_URL);

interface HttpQueryable {
  query: (query: string, params?: unknown[]) => Promise<unknown[]>;
}

const localPools = new Map<string, Pool>();
const getLocalPool = (url: string) => {
  const existing = localPools.get(url);
  if (existing) return existing;
  const pool = new Pool({ connectionString: url });
  localPools.set(url, pool);
  return pool;
};

// Mirrors the interface of neon()'s http client (rows array, not Result).
const localHttpClient = (url: string): HttpQueryable => ({
  query: async (query, params) => {
    // Annotated rather than returned inline: pg types `rows` as any[], and
    // returning that straight out erases the unknown[] the interface promises.
    const result: { rows: unknown[] } = await getLocalPool(url).query(
      query,
      params
    );
    return result.rows;
  },
});

const createAdapter = (url: string) =>
  IS_LOCAL
    ? new PrismaPg(getLocalPool(url))
    : new PrismaNeon({ connectionString: url });

const globalForPrisma = global as unknown as {
  transfersDb: PrismaClient;
  transfersDbAdapter: PrismaNeon | PrismaPg;
};

const transfersDbAdapter =
  globalForPrisma.transfersDbAdapter ||
  createAdapter(process.env.TRANSFERS_DB_URL!);
if (process.env.NODE_ENV !== 'production')
  globalForPrisma.transfersDbAdapter = transfersDbAdapter;

export const transfersHttpPrimary: HttpQueryable = IS_LOCAL
  ? localHttpClient(process.env.TRANSFERS_DB_URL!)
  : neon(process.env.TRANSFERS_DB_URL!);

const replicaUrls = [
  process.env.TRANSFERS_DB_URL_REPLICA_1,
  process.env.TRANSFERS_DB_URL_REPLICA_2,
  process.env.TRANSFERS_DB_URL_REPLICA_3,
  process.env.TRANSFERS_DB_URL_REPLICA_4,
  process.env.TRANSFERS_DB_URL_REPLICA_5,
].filter((url): url is string => !!url);

export const transfersHttpReplicas: HttpQueryable[] = replicaUrls.map(url =>
  isLocalUrl(url) ? localHttpClient(url) : neon(url)
);

export const transfersDb =
  globalForPrisma.transfersDb ||
  new PrismaClient({
    adapter: transfersDbAdapter,
  });

const hasReplicas = replicaUrls.length > 0;

const createReplicaClient = (url: string) => {
  return new PrismaClient({
    adapter: isLocalUrl(url)
      ? new PrismaPg(getLocalPool(url))
      : new PrismaNeon({ connectionString: url }),
  });
};

export const transfersDbReadReplicas = hasReplicas
  ? transfersDb.$extends(
      readReplicas({
        replicas: replicaUrls.map(url => createReplicaClient(url)),
      })
    )
  : undefined;
