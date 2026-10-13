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
    isPostgresConnected = true;
    console.log('✅ Connected to PostgreSQL database via Prisma');
    return true;
  } catch (error) {
    isPostgresConnected = false;
    console.warn('⚠️ PostgreSQL connection failed or DATABASE_URL not active. Running in in-memory fallback mode for learning & rapid testing.');
    return false;
  }
}

export function isDbConnected(): boolean {
  return isPostgresConnected;
}
