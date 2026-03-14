import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
    prisma: {
        scrapeTask: {
            findUnique: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        scrapeJob: {
            update: vi.fn(),
        },
        company: {
            count: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));



vi.mock('../src/scraper/googleMapsScraper', () => ({
    GoogleMapsScraper: class {
        init() { return Promise.resolve(); }
        search() { return Promise.resolve(); }
        collectResultLinks() { return Promise.reject(new Error('Simulated failure')); }
        extractDetails() { return Promise.resolve({}); }
        close() { return Promise.resolve(); }
    }
}));

vi.mock('../src/scraper/stealthBrowser', () => ({
    StealthBrowser: class {
        launch() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
    }
}));

import { processJob } from '../src/services/scraperService';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('Retry Mechanism in scraperService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should increment retries and set status to PENDING if retries < maxRetries', async () => {
        (mockPrisma.scrapeTask.findUnique as any).mockResolvedValue({
            id: 'task-1',
            jobId: 'job-1',
            query: 'test query',
            retries: 1,
            maxRetries: 3,
            scrapeJob: { id: 'job-1', userId: 'user-1' }
        } as any);

        const result = await processJob('task-1', true);

        expect(result.success).toBe(false);
        expect(mockPrisma.scrapeTask.update).toHaveBeenCalledWith({
            where: { id: 'task-1' },
            data: expect.objectContaining({ 
                retries: { increment: 1 }, 
                status: 'PENDING' 
            })
        });
    });

    it('should set status to FAILED if retries >= maxRetries', async () => {
        (mockPrisma.scrapeTask.findUnique as any).mockResolvedValue({
            id: 'task-2',
            jobId: 'job-2',
            query: 'test query',
            retries: 3,
            maxRetries: 3,
            scrapeJob: { id: 'job-2', userId: 'user-2' }
        } as any);

        const result = await processJob('task-2', true);

        expect(result.success).toBe(false);
        expect(mockPrisma.scrapeTask.update).toHaveBeenCalledWith({
            where: { id: 'task-2' },
            data: { status: 'FAILED' }
        });
    });
});
