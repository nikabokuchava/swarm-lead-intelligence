import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
    prisma: {
        $transaction: vi.fn(),
        company: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        scrapeJob: {
            update: vi.fn(),
        }
    }
}));

import { createCompanyIfNotExists } from '../src/db/company';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('DB-Level Company Deduplication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns isDuplicate: true when unique constraint P2002 error is thrown', async () => {
        (mockPrisma.$transaction as any).mockImplementation(async (callback: any) => {
            const tx = {
                company: {
                    create: vi.fn().mockRejectedValue({
                        code: 'P2002',
                        message: 'Unique constraint failed on the fields: (name, COALESCE(address, ""))'
                    })
                },
                scrapeJob: {
                    update: vi.fn()
                }
            };
            return callback(tx);
        });

        const result = await createCompanyIfNotExists({
            name: 'Dup HVAC',
            phone: '555-0199',
            website: 'https://duphvac.com',
            address: '123 Main St',
            source: 'google_maps',
            userId: 'user_123',
            jobId: 'job_123'
        });

        expect(result.isDuplicate).toBe(true);
        expect(result.company).toBeNull();
    });

    it('increments parent scrapeJob resultsFound atomically on successful insert', async () => {
        const mockCreatedCompany = { id: 'c-new-1', name: 'Clean HVAC' };
        const mockJobUpdate = vi.fn().mockResolvedValue({});

        (mockPrisma.$transaction as any).mockImplementation(async (callback: any) => {
            const tx = {
                company: {
                    create: vi.fn().mockResolvedValue(mockCreatedCompany)
                },
                scrapeJob: {
                    update: mockJobUpdate
                }
            };
            return callback(tx);
        });

        const result = await createCompanyIfNotExists({
            name: 'Clean HVAC',
            phone: '555-0100',
            website: 'https://cleanhvac.com',
            address: '456 Oak St',
            source: 'google_maps',
            userId: 'user_123',
            jobId: 'job_456'
        });

        expect(result.isDuplicate).toBe(false);
        expect(result.company).toEqual(mockCreatedCompany);
        expect(mockJobUpdate).toHaveBeenCalledWith({
            where: { id: 'job_456' },
            data: { resultsFound: { increment: 1 } }
        });
    });
});
