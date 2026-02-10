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
        const result = await prisma.$queryRaw<Company[]>`
            UPDATE "companies"
            SET status = 'PROCESSING'::"ProcessingStatus", 
                "worker_id" = ${workerId}, 
                "locked_at" = NOW(),
                "retries" = "retries" + 1
            WHERE id = (
                SELECT id
                FROM "companies"
                WHERE status = 'PENDING'
                ORDER BY "created_at" ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *;
        `;

        const rows = result as unknown as Company[];

        if (rows && rows.length > 0) {
            return rows[0];
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
 * @param success - Whether the scrape was successful
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
        // Release back to queue
        await prisma.company.update({
            where: { id: companyId },
            data: { 
                status: 'PENDING',
                workerId: null,
                lockedAt: null
            }
        });
    }
}
