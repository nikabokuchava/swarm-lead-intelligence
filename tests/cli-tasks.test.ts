import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('commander', () => ({
    program: {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        parse: vi.fn().mockReturnThis(),
        opts: vi.fn().mockReturnValue({
            query: 'test query',
            max: '5',
            headless: true,
        }),
    }
}));

const mockProcessJob = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/services/scraperService.js', () => ({
    processJob: mockProcessJob
}));

const mockCreateJob = vi.fn().mockResolvedValue({ id: 'job-123' });
const mockCreateTask = vi.fn().mockResolvedValue({ id: 'task-456' });

vi.mock('../src/db/company.js', () => ({
    connectDB: vi.fn().mockResolvedValue(undefined),
    disconnectDB: vi.fn().mockResolvedValue(undefined),
    prisma: {
        scrapeJob: {
            create: mockCreateJob
        },
        scrapeTask: {
            create: mockCreateTask
        }
    }
}));

describe('CLI Task Creation', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalExit: any;

    beforeEach(() => {
        vi.clearAllMocks();
        originalExit = process.exit;
        Object.defineProperty(process, 'exit', { value: vi.fn(), writable: true });
    });

    afterEach(() => {
        Object.defineProperty(process, 'exit', { value: originalExit, writable: true });
        vi.resetModules(); 
    });

    it('should create a ScrapeJob and a corresponding ScrapeTask when run from CLI', async () => {
        await import('../src/index');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                query: 'test query',
                maxResults: 5,
                status: 'PENDING'
            })
        }));

        expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                jobId: 'job-123',
                query: 'test query',
                status: 'PENDING'
            })
        }));

        expect(mockProcessJob).toHaveBeenCalledWith('task-456', true);
    });
});
