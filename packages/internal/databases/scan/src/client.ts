import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

import { neonConfig } from '@neondatabase/serverless';
import { Pool } from 'pg';

import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// Local Postgres support: Neon's serverless driver only speaks to Neon
// endpoints. When the connection string points at localhost, fall back to the
// standard pg driver so the app runs without a Neon account.
const isLocal = /localhost|127\.0\.0\.1/.test(
  process.env.SCAN_DATABASE_URL ?? ''
);

const globalForPrisma = global as unknown as {
  scanDb: PrismaClient;
  scanDbAdapter: PrismaNeon | PrismaPg;
};

const scanDbAdapter =
  globalForPrisma.scanDbAdapter ||
  (isLocal
    ? new PrismaPg(new Pool({ connectionString: process.env.SCAN_DATABASE_URL }))
    : new PrismaNeon({ connectionString: process.env.SCAN_DATABASE_URL! }));
if (process.env.NODE_ENV !== 'production')
  globalForPrisma.scanDbAdapter = scanDbAdapter;

export const scanDb =
  globalForPrisma.scanDb ||
  new PrismaClient({
    adapter: scanDbAdapter,
    omit: { resourceOrigin: { email: true } },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.scanDb = scanDb;
