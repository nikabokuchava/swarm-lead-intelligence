import { prisma } from './company.js';
import { Company, ProcessingStatus } from '@prisma/client';

/**
 * Get next pending lead using SKIP LOCKED for safe concurrency.
 * @param workerId - Unique ID of the worker claiming the job
 * @returns The locked Company record or null if no jobs available
 */
export async function getNextPendingLead(workerId: string): Promise<Company | null> {
    try {
        // Use raw query for SKIP LOCKED functionality which isn't natively supported in Prisma Client yet
        // Only return the id — then use Prisma findUnique to get properly mapped camelCase fields
        const result = await prisma.$queryRaw<{ id: string }[]>`
            UPDATE "companies"
            SET status = 'PROCESSING'::"ProcessingStatus",
                "worker_id" = ${workerId},
                "locked_at" = NOW()
            WHERE id = (
                SELECT id
                FROM "companies"
                WHERE status = 'PENDING'
                ORDER BY "created_at" ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id;
        `;

        const rows = result as unknown as { id: string }[];

        if (rows && rows.length > 0) {
            // Re-fetch via Prisma to get proper camelCase field mapping (jobId, workerId, etc.)
            return await prisma.company.findUnique({ where: { id: rows[0].id } });
        }

        return null;
    } catch (error) {
        console.error('Error fetching next job:', error);
        return null;
    }
}

/**
 * Reset stuck jobs that have been processing for too long.
 * @param timeoutMinutes - Number of minutes before a job is considered stuck (default: 10)
 */
export async function resetStalledJobs(timeoutMinutes = 10): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    
    const result = await prisma.company.updateMany({
        where: {
            status: 'PROCESSING',
            lockedAt: {
                lt: cutoff
            }
        },
        data: {
            status: 'PENDING',
            workerId: null,
            lockedAt: null
        }
    });

    return result.count;
}

/**
 * Mark a job as completed.
 * @param companyId - ID of the company
 * @param success - Whether the data extraction was successful
 */
export async function completeJob(companyId: string, success: boolean, errorMessage?: string) {
    await prisma.company.update({
        where: { id: companyId },
        data: {
            status: success ? 'COMPLETED' : 'FAILED',
        }
    });
}

/**
 * Recover stale locks on both ScrapeTask and Company records.
 * Any record stuck in PROCESSING with lockedAt older than `timeoutMinutes` is reset to PENDING.
 * Should be called once at worker/poller startup to clear orphaned locks from crashed processes.
 */
export async function recoverStaleLocks(timeoutMinutes = 10): Promise<{ tasks: number; companies: number }> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const [taskResult, companyResult] = await Promise.all([
        prisma.scrapeTask.updateMany({
            where: {
                status: 'PROCESSING',
                lockedAt: { lt: cutoff }
            },
            data: {
                status: 'PENDING',
                workerId: null,
                lockedAt: null
            }
        }),
        prisma.company.updateMany({
            where: {
                status: 'PROCESSING',
                lockedAt: { lt: cutoff }
            },
            data: {
                status: 'PENDING',
                workerId: null,
                lockedAt: null
            }
        })
    ]);

    if (taskResult.count > 0 || companyResult.count > 0) {
        console.log(`🔓 Recovered stale locks: ${taskResult.count} tasks, ${companyResult.count} companies reset to PENDING`);
    }

    return { tasks: taskResult.count, companies: companyResult.count };
}

/**
 * Handle job failure: retry if under limit, fail otherwise.
 */
export async function failJobOrRetry(companyId: string, currentRetries: number, errorMessage?: string) {
    const MAX_RETRIES = 3;
    
    if (currentRetries >= MAX_RETRIES) {
        // Hard fail
        await prisma.company.update({
            where: { id: companyId },
            data: { status: 'FAILED' }
        });
    } else {
        // Release back to queue with atomic retry increment
        await prisma.company.update({
            where: { id: companyId },
            data: {
                status: 'PENDING',
                workerId: null,
                lockedAt: null,
                retries: { increment: 1 }
            }
        });
    }
}
