import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
    prisma: {
        creditLedger: {
            create: vi.fn(),
            findMany: vi.fn(),
        }
    }
}));

import { recordCreditMutation, getCreditHistory } from '../src/db/creditLedger';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('CreditLedger DB Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('records an auditable credit mutation in credit_ledger', async () => {
        const mockRow = {
            id: 'ledger-uuid-1',
            clerkId: 'user_clerk_123',
            userId: 'db-user-uuid-1',
            delta: 50,
            reason: 'stripe_purchase',
            refId: 'evt_stripe_123',
            createdAt: new Date()
        };
        (mockPrisma.creditLedger.create as any).mockResolvedValue(mockRow);

        const result = await recordCreditMutation('user_clerk_123', 'db-user-uuid-1', 50, 'stripe_purchase', 'evt_stripe_123');

        expect(mockPrisma.creditLedger.create).toHaveBeenCalledWith({
            data: {
                clerkId: 'user_clerk_123',
                userId: 'db-user-uuid-1',
                delta: 50,
                reason: 'stripe_purchase',
                refId: 'evt_stripe_123'
            }
        });
        expect(result).toEqual(mockRow);
    });

    it('defaults refId to null when omitted', async () => {
        const mockRow = {
            id: 'ledger-uuid-2',
            clerkId: 'user_clerk_456',
            userId: 'db-user-uuid-2',
            delta: -5,
            reason: 'job_reserved',
            refId: null,
            createdAt: new Date()
        };
        (mockPrisma.creditLedger.create as any).mockResolvedValue(mockRow);

        const result = await recordCreditMutation('user_clerk_456', 'db-user-uuid-2', -5, 'job_reserved');

        expect(mockPrisma.creditLedger.create).toHaveBeenCalledWith({
            data: {
                clerkId: 'user_clerk_456',
                userId: 'db-user-uuid-2',
                delta: -5,
                reason: 'job_reserved',
                refId: null
            }
        });
        expect(result).toEqual(mockRow);
    });

    it('retrieves credit history ordered by createdAt desc with custom limit', async () => {
        (mockPrisma.creditLedger.findMany as any).mockResolvedValue([]);

        await getCreditHistory('user_clerk_123', 20);

        expect(mockPrisma.creditLedger.findMany).toHaveBeenCalledWith({
            where: { clerkId: 'user_clerk_123' },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
    });

    it('retrieves credit history with default limit of 50', async () => {
        (mockPrisma.creditLedger.findMany as any).mockResolvedValue([]);

        await getCreditHistory('user_clerk_123');

        expect(mockPrisma.creditLedger.findMany).toHaveBeenCalledWith({
            where: { clerkId: 'user_clerk_123' },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
    });
});
