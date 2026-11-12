import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;
let isPostgresConnected = false;

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return prismaInstance;
}

const IN_MEMORY_NOTE = 'Running in in-memory mode: runs are lost when the server restarts.';

function describeDbError(err: unknown): string {
  const lines = String((err as Error)?.message ?? err).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /can't|cannot|denied|authentication|timed out|does not exist|refused/i.test(l)) ?? lines[0] ?? 'unknown error';
}

export async function checkDatabaseConnection(): Promise<boolean> {
  isPostgresConnected = false;
  if (!process.env.DATABASE_URL) {
    console.warn(`⚠️  DATABASE_URL is not set. ${IN_MEMORY_NOTE}`);
    return false;
  }

  const prisma = getPrismaClient();
  // Serverless Postgres (Neon, Supabase) suspends when idle and can take a few seconds to wake.
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      break;
    } catch (err) {
      if (attempt >= 3) {
        console.warn(`⚠️  Can't reach the database (${describeDbError(err)}). ${IN_MEMORY_NOTE}`);
        return false;
      }
      console.log(`… Database not reachable yet (attempt ${attempt}/3), retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  try {
    await prisma.job.findFirst();
  } catch (err) {
    console.warn(`⚠️  Connected, but the schema is missing or out of date (${describeDbError(err)}). Run \`npm run db:push\`. ${IN_MEMORY_NOTE}`);
    return false;
  }

  isPostgresConnected = true;
  console.log('✅ Connected to PostgreSQL database via Prisma (Tables verified)');
  return true;
}

export function isDbConnected(): boolean {
  return isPostgresConnected;
}
