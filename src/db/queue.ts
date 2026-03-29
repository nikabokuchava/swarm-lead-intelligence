import { prisma } from './company.js';
import { Company, ProcessingStatus } from '@prisma/client';

/** Raw row shape from PostgreSQL RETURNING * (snake_case columns) */
interface CompanyRawRow {
    id: string;
    user_id: string;
    name: string;
    website: string | null;
    phone: string | null;
    address: string | null;
    source: string | null;
    rating: number | null;
    review_count: number | null;
    emails: string[];
    email_scraped: boolean;
    email_scraped_at: Date | null;
    status: string;
    worker_id: string | null;
    locked_at: Date | null;
    retries: number;
    job_id: string | null;
    created_at: Date;
}

/** Map snake_case raw row to camelCase Prisma Company type */
function mapRawToCompany(row: CompanyRawRow): Company {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        website: row.website,
        phone: row.phone,
        address: row.address,
        source: row.source,
        rating: row.rating,
        reviewCount: row.review_count,
        emails: Array.isArray(row.emails) ? row.emails : [],
        emailScraped: row.email_scraped,
        emailScrapedAt: row.email_scraped_at,
        status: row.status as ProcessingStatus,
        workerId: row.worker_id,
        lockedAt: row.locked_at,
        retries: row.retries,
        jobId: row.job_id,
        createdAt: row.created_at,
    };
}

/**
 * Get next pending lead using SKIP LOCKED for safe concurrency.
 * HI13: Single-query with RETURNING * — eliminates second findUnique round-trip.
 * @param workerId - Unique ID of the worker claiming the job
 * @returns The locked Company record or null if no jobs available
 */
export async function getNextPendingLead(workerId: string): Promise<Company | null> {
    try {
        const rows = await prisma.$queryRaw<CompanyRawRow[]>`
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
            RETURNING *;
        `;

        if (rows && rows.length > 0) {
            return mapRawToCompany(rows[0]);
        }

        return null;
    } catch (error) {
        // HI1: Re-throw connection errors so worker's reconnection logic triggers
        const prismaError = error as { code?: string };
        if (prismaError.code === 'P1001' || prismaError.code === 'P1017' || prismaError.code === 'P2024' ||
            (error instanceof Error && error.message.toLowerCase().includes('connect'))) {
            throw error;
        }
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
 * Cancel orphaned PENDING tasks/companies whose parent ScrapeJob is already FAILED or COMPLETED.
 * Prevents zombie PENDING records from accumulating when a job terminates without cleaning up children.
 */
export async function cancelOrphanedPendingRecords(): Promise<{ tasks: number; companies: number }> {
    const terminatedJobIds = await prisma.scrapeJob.findMany({
        where: { status: { in: ['FAILED', 'COMPLETED'] } },
        select: { id: true }
    });

    if (terminatedJobIds.length === 0) {
        return { tasks: 0, companies: 0 };
    }

    const ids = terminatedJobIds.map(j => j.id);

    const [taskResult, companyResult] = await Promise.all([
        prisma.scrapeTask.updateMany({
            where: {
                jobId: { in: ids },
                status: 'PENDING'
            },
            data: { status: 'FAILED' }
        }),
        prisma.company.updateMany({
            where: {
                jobId: { in: ids },
                status: 'PENDING'
            },
            data: { status: 'FAILED' }
        })
    ]);

    if (taskResult.count > 0 || companyResult.count > 0) {
        console.log(`🧹 Orphan cleanup: ${taskResult.count} tasks, ${companyResult.count} companies marked FAILED (parent job terminated)`);
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
