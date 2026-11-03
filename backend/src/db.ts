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

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    // Verify Job table actually exists in the database
    await prisma.job.findFirst();
    isPostgresConnected = true;
    console.log('✅ Connected to PostgreSQL database via Prisma (Tables verified)');
    return true;
  } catch (error) {
    isPostgresConnected = false;
    console.warn('⚠️ PostgreSQL tables not yet created (run `npx prisma db push`). Running in in-memory fallback mode.');
    return false;
  }
}

export function isDbConnected(): boolean {
  return isPostgresConnected;
}
