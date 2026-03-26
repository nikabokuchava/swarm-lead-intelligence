import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Connection pool sizing:
 * Prisma defaults to `num_physical_cpus * 2 + 1` connections (minimum 5).
 * For production with multiple workers, append `?connection_limit=N` to DATABASE_URL.
 * Example: postgresql://user:pass@host:5432/db?connection_limit=10
 */
export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
