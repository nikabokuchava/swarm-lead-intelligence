import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface CreateJobParams {
    query: string;
    maxResults: number;
}

interface UpdateJobParams {
    resultsFound?: number;
    status?: JobStatus;
    completedAt?: Date;
}

/**
 * Create a new scrape job
 */
export async function createScrapeJob(params: CreateJobParams) {
    return prisma.scrapeJob.create({
        data: {
            query: params.query,
            maxResults: params.maxResults,
            status: 'running',
            resultsFound: 0
        }
    });
}

/**
 * Update an existing scrape job
 */
export async function updateScrapeJob(jobId: string, params: UpdateJobParams) {
    return prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
            ...params,
            completedAt: params.status === 'completed' || params.status === 'failed' 
                ? new Date() 
                : undefined
        }
    });
}

/**
 * Get a scrape job by ID
 */
export async function getScrapeJob(jobId: string) {
    return prisma.scrapeJob.findUnique({
        where: { id: jobId }
    });
}

/**
 * Get all scrape jobs ordered by creation date
 */
export async function listScrapeJobs(limit = 10) {
    return prisma.scrapeJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}

/**
 * Get incomplete/failed jobs that can be resumed
 */
export async function getResumableJobs() {
    return prisma.scrapeJob.findMany({
        where: {
            status: { in: ['running', 'failed'] }
        },
        orderBy: { createdAt: 'desc' }
    });
}

/**
 * Mark job as completed with final stats
 */
export async function completeJob(jobId: string, resultsFound: number) {
    return updateScrapeJob(jobId, {
        status: 'completed',
        resultsFound,
        completedAt: new Date()
    });
}

/**
 * Mark job as failed
 */
export async function failJob(jobId: string, resultsFound: number) {
    return updateScrapeJob(jobId, {
        status: 'failed',
        resultsFound,
        completedAt: new Date()
    });
}
