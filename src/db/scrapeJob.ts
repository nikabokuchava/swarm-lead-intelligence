import { prisma } from './prisma.js';
import { ProcessingStatus } from '@prisma/client';

interface CreateJobParams {
    query: string;
    maxResults: number;
}

interface UpdateJobParams {
    resultsFound?: number;
    status?: ProcessingStatus;
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
            status: ProcessingStatus.PROCESSING,
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
            completedAt: params.status === ProcessingStatus.COMPLETED || params.status === ProcessingStatus.FAILED
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
            status: { in: [ProcessingStatus.PROCESSING, ProcessingStatus.FAILED] }
        },
        orderBy: { createdAt: 'desc' }
    });
}

/**
 * Mark job as completed with final stats
 */
export async function completeJob(jobId: string, resultsFound: number) {
    return updateScrapeJob(jobId, {
        status: ProcessingStatus.COMPLETED,
        resultsFound,
        completedAt: new Date()
    });
}

/**
 * Mark job as failed
 */
export async function failJob(jobId: string, resultsFound: number) {
    return updateScrapeJob(jobId, {
        status: ProcessingStatus.FAILED,
        resultsFound,
        completedAt: new Date()
    });
}
