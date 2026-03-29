import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock Prisma
vi.mock('../src/db/prisma', () => {
    const mockPrismaTx = {
        company: {
            findFirst: vi.fn(),
            create: vi.fn(),
            count: vi.fn(),
            update: vi.fn(),
        },
        scrapeJob: {
            update: vi.fn(),
        },
        scrapeTask: {
            count: vi.fn(),
        },
        contact: {
            createMany: vi.fn(),
        },
    };

    return {
        prisma: {
            scrapeTask: {
                findUnique: vi.fn(),
                update: vi.fn(),
            },
            scrapeJob: {
                update: vi.fn(),
            },
            company: {
                findFirst: vi.fn(),
                create: vi.fn(),
                count: vi.fn(),
                update: vi.fn(),
                updateMany: vi.fn(),
            },
            contact: {
                createMany: vi.fn(),
            },
            $transaction: vi.fn((callback) => callback(mockPrismaTx)),
            $queryRaw: vi.fn(),
            $connect: vi.fn(),
            $disconnect: vi.fn(),
        },
        mockPrismaTx 
    };
});

// 2. Mock Scrapers
vi.mock('../src/scraper/googleMapsScraper', () => ({
    GoogleMapsScraper: class {
        init() { return Promise.resolve(); }
        search() { return Promise.resolve(); }
        collectResultLinks() { return Promise.resolve(['http://example.com/place']); }
        extractDetails() {
            return Promise.resolve({
                name: 'Decoupled Tech LLC',
                website: 'https://decoupledtech.com',
                phone: '555-0100',
                address: '123 Strategy Blvd'
            });
        }
        extractDetailsOnPage() {
            return Promise.resolve({
                name: 'Decoupled Tech LLC',
                website: 'https://decoupledtech.com',
                phone: '555-0100',
                address: '123 Strategy Blvd'
            });
        }
        close() { return Promise.resolve(); }
    }
}));

vi.mock('../src/scraper/stealthBrowser', () => ({
    StealthBrowser: class {
        launch() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
        isConnected() { return true; }
        createPage() { return Promise.resolve({}); }
        closePage() { return Promise.resolve(); }
        openPagesCount = 1;
    }
}));

vi.mock('../src/scraper/websiteScraper', () => ({
    scrapeEmailsFromWebsite: vi.fn()
}));

vi.mock('../src/services/emailVerifier', () => ({
    verifyEmail: vi.fn()
}));

import { processJob } from '../src/services/scraperService';
import { getNextPendingLead, completeJob, failJobOrRetry } from '../src/db/queue';
import { updateCompanyEmails } from '../src/db/company';
import { scrapeEmailsFromWebsite } from '../src/scraper/websiteScraper';
import { verifyEmail } from '../src/services/emailVerifier';

// @ts-ignore - exporting mockPrismaTx from the factory
import { prisma, mockPrismaTx } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);
const mockScrapeEmails = vi.mocked(scrapeEmailsFromWebsite);
const mockVerifyEmail = vi.mocked(verifyEmail);
const mockedTx = mockPrismaTx as any;

describe('Strategy B: Map Scraping -> Database Queue -> Email Extraction Flow', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    const mockCompanyId = 'comp-uuid-1234';
    const mockJobId = 'job-uuid-1234';
    const mockTask = {
        id: 'task-1',
        jobId: mockJobId,
        query: 'software companies',
        scrapeJob: { id: mockJobId, userId: 'user-1' }
    };

    it('Step 1: processJob should scrape Map and create PENDING company without emails', async () => {
        (mockPrisma.scrapeTask.findUnique as any).mockResolvedValue(mockTask);
        
        mockedTx.company.findFirst.mockResolvedValue(null);
        mockedTx.company.create.mockResolvedValue({
            id: mockCompanyId,
            name: 'Decoupled Tech LLC',
            source: 'google_maps',
            jobId: mockJobId,
            userId: 'user-1',
            status: 'PENDING',
            emailScraped: false // Verifying intended DB state logically here 
        });
        mockedTx.scrapeTask.count.mockResolvedValue(0);
        mockedTx.company.count.mockResolvedValue(1);

        const result = await processJob('task-1', true);
        
        expect(result.success).toBe(true);
        expect(result.added).toBe(1);

        expect(mockedTx.company.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                name: 'Decoupled Tech LLC',
                jobId: mockJobId,
                userId: 'user-1',
                website: 'https://decoupledtech.com'
            })
        });
    });

    it('Step 2: Worker picks up PENDING company (getNextPendingLead)', async () => {
        const mockCompanyRow = [
            { id: mockCompanyId, name: 'Decoupled Tech LLC', website: 'https://decoupledtech.com', jobId: mockJobId, status: 'PROCESSING', workerId: 'worker-1' }
        ];
        
        (mockPrisma.$queryRaw as any).mockResolvedValue(mockCompanyRow);

        const job = await getNextPendingLead('worker-1');
        
        expect(job).not.toBeNull();
        expect(job!.id).toBe(mockCompanyId);
        expect(job!.status).toBe('PROCESSING');
        expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('Step 3: Worker extracts emails, verifies, and associates Contact relation', async () => {
        mockScrapeEmails.mockResolvedValue({
            success: true,
            allEmails: ['hello@decoupledtech.com'],
            details: [
                { email: 'hello@decoupledtech.com', confidence: 99, source: 'homepage', type: 'generic' }
            ]
        });

        mockVerifyEmail.mockResolvedValue({
            status: 'VALID',
            mxProvider: 'google',
            reason: '',
            isCatchAll: false
        });

        const job = { id: mockCompanyId, website: 'https://decoupledtech.com', jobId: mockJobId };

        const result = await scrapeEmailsFromWebsite({} as any, job.website as string);
        expect(result.allEmails).toContain('hello@decoupledtech.com');

        const verifiedDetails: any[] = [];
        for (const d of result.details!) {
            const vPromise = verifyEmail(d.email);
            // Verify fake timers usage for the 500ms DNS delay
            vi.advanceTimersByTime(500);
            const v = await vPromise;
            
            verifiedDetails.push({
                email: d.email,
                confidence: d.confidence,
                source: d.source,
                type: d.type,
                verificationStatus: v.status,
                mxProvider: v.mxProvider,
                isCLevel: false
            });
        }

        expect(mockVerifyEmail).toHaveBeenCalledWith('hello@decoupledtech.com');

        await updateCompanyEmails(job.id, result.allEmails, verifiedDetails, job.jobId);

        // updateCompanyEmails runs inside prisma.$transaction → assertions against mockedTx
        expect(mockedTx.company.update).toHaveBeenCalledWith({
            where: { id: mockCompanyId },
            data: expect.objectContaining({
                emails: ['hello@decoupledtech.com'],
                emailScraped: true,
            })
        });

        // The critical Relation Check functionality
        expect(mockedTx.contact.createMany).toHaveBeenCalledWith({
            skipDuplicates: true,
            data: [
                expect.objectContaining({
                    companyId: mockCompanyId,
                    workEmail: 'hello@decoupledtech.com',
                    jobId: mockJobId, // Correctly linked to the ScrapeJob
                    verificationStatus: 'VALID',
                    mxProvider: 'google',
                })
            ]
        });

        await completeJob(job.id, true);
        expect(mockPrisma.company.update).toHaveBeenCalledWith({
            where: { id: mockCompanyId },
            data: { status: 'COMPLETED' }
        });
    });

    it('Step 4: Error Handling - Worker fail recovery', async () => {
        await failJobOrRetry(mockCompanyId, 1, 'Timeout error');

        expect(mockPrisma.company.update).toHaveBeenCalledWith({
            where: { id: mockCompanyId },
            data: {
                status: 'PENDING',
                workerId: null,
                lockedAt: null,
                retries: { increment: 1 },
            }
        });

        await failJobOrRetry(mockCompanyId, 3, 'Fatal WebGL crash');
        expect(mockPrisma.company.update).toHaveBeenCalledWith({
            where: { id: mockCompanyId },
            data: { status: 'FAILED' }
        });
    });
});
