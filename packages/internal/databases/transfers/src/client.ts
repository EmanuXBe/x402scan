import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

import { neon, neonConfig } from '@neondatabase/serverless';
import { Pool } from 'pg';

import { readReplicas } from './read-replicas/extension';

import ws from 'ws';

neonConfig.webSocketConstructor = ws;

/**
 * Neon's serverless driver only speaks to Neon endpoints, so the driver choice
 * has to follow the host.
 *
 * The test asks whether the host *is* Neon rather than whether it is localhost.
 * Matching on localhost was the first attempt and it only works on a developer
 * machine: inside a container the local database is `host.docker.internal`, and
 * on a platform like Railway it is `postgres.railway.internal`. Neither matches,
 * so both would take the Neon driver against a plain Postgres and fail with
 * "Error connecting to database: TypeError: fetch failed" — which reads as the
 * database being unreachable rather than the wrong client being used.
 *
 * Neon is the special case. Standard Postgres is the default.
 */
export const usesNeonDriver = (url: string | undefined) =>
  /\.neon\.tech|\.neon\.build/.test(url ?? '');

const IS_NEON = usesNeonDriver(process.env.TRANSFERS_DB_URL);

interface HttpQueryable {
  query: (query: string, params?: unknown[]) => Promise<unknown[]>;
}

const pgPools = new Map<string, Pool>();
const getPgPool = (url: string) => {
  const existing = pgPools.get(url);
  if (existing) return existing;
  const pool = new Pool({ connectionString: url });
  pgPools.set(url, pool);
  return pool;
};

// Mirrors the interface of neon()'s http client (rows array, not Result), so
// the two branches are interchangeable to callers.
const pgHttpClient = (url: string): HttpQueryable => ({
  query: async (query, params) => {
    // Annotated rather than returned inline: pg types `rows` as any[], and
    // returning that straight out erases the unknown[] the interface promises.
    const result: { rows: unknown[] } = await getPgPool(url).query(
      query,
      params
    );
    return result.rows;
  },
});

const createAdapter = (url: string) =>
  IS_NEON
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg(getPgPool(url));

const globalForPrisma = global as unknown as {
  transfersDb: PrismaClient;
  transfersDbAdapter: PrismaNeon | PrismaPg;
};

const transfersDbAdapter =
  globalForPrisma.transfersDbAdapter ||
  createAdapter(process.env.TRANSFERS_DB_URL!);
if (process.env.NODE_ENV !== 'production')
  globalForPrisma.transfersDbAdapter = transfersDbAdapter;

export const transfersHttpPrimary: HttpQueryable = IS_NEON
  ? neon(process.env.TRANSFERS_DB_URL!)
  : pgHttpClient(process.env.TRANSFERS_DB_URL!);

const replicaUrls = [
  process.env.TRANSFERS_DB_URL_REPLICA_1,
  process.env.TRANSFERS_DB_URL_REPLICA_2,
  process.env.TRANSFERS_DB_URL_REPLICA_3,
  process.env.TRANSFERS_DB_URL_REPLICA_4,
  process.env.TRANSFERS_DB_URL_REPLICA_5,
].filter((url): url is string => !!url);

export const transfersHttpReplicas: HttpQueryable[] = replicaUrls.map(url =>
  usesNeonDriver(url) ? neon(url) : pgHttpClient(url)
);

export const transfersDb =
  globalForPrisma.transfersDb ||
  new PrismaClient({
    adapter: transfersDbAdapter,
  });

const hasReplicas = replicaUrls.length > 0;

const createReplicaClient = (url: string) => {
  return new PrismaClient({
    adapter: usesNeonDriver(url)
      ? new PrismaNeon({ connectionString: url })
      : new PrismaPg(getPgPool(url)),
  });
};

export const transfersDbReadReplicas = hasReplicas
  ? transfersDb.$extends(
      readReplicas({
        replicas: replicaUrls.map(url => createReplicaClient(url)),
      })
    )
  : undefined;
