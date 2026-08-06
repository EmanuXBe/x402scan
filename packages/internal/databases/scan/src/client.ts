import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

import { neonConfig } from '@neondatabase/serverless';
import { Pool } from 'pg';

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

const IS_NEON = usesNeonDriver(process.env.SCAN_DATABASE_URL);

const globalForPrisma = global as unknown as {
  scanDb: PrismaClient;
  scanDbAdapter: PrismaNeon | PrismaPg;
};

const scanDbAdapter =
  globalForPrisma.scanDbAdapter ||
  (IS_NEON
    ? new PrismaNeon({ connectionString: process.env.SCAN_DATABASE_URL! })
    : new PrismaPg(
        new Pool({ connectionString: process.env.SCAN_DATABASE_URL })
      ));
if (process.env.NODE_ENV !== 'production')
  globalForPrisma.scanDbAdapter = scanDbAdapter;

export const scanDb =
  globalForPrisma.scanDb ||
  new PrismaClient({
    adapter: scanDbAdapter,
    omit: { resourceOrigin: { email: true } },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.scanDb = scanDb;
