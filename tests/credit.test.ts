import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma singleton BEFORE importing the module under test
vi.mock('../src/db/prisma', () => ({
    prisma: {
        user: {
            updateMany: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

import { deductCredit, hasCredits, getOrCreateUser } from '../src/db/user';
import { prisma } from '../src/db/prisma';

const mockPrisma = vi.mocked(prisma);

describe('Credit System', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('deductCredit', () => {
        it('should deduct credits when balance is sufficient', async () => {
            mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
            mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
                id: 'uuid-1',
                clerkId: 'user_123',
                email: 'test@test.com',
                credits: 99,
                createdAt: new Date(),
            });

            const result = await deductCredit('user_123', 1);

            expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
                where: {
                    clerkId: 'user_123',
                    credits: { gte: 1 },
                },
                data: { credits: { decrement: 1 } },
            });
            expect(result.credits).toBe(99);
        });

        it('should throw when credits are insufficient', async () => {
            // Simulate: updateMany matched 0 rows (balance < amount)
            mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

            await expect(deductCredit('user_123', 5)).rejects.toThrow(
                'Insufficient credits for user user_123'
            );

            expect(mockPrisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
        });

        it('should deduct a custom amount', async () => {
            mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
            mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
                id: 'uuid-1',
                clerkId: 'user_123',
                email: 'test@test.com',
                credits: 45,
                createdAt: new Date(),
            });

            await deductCredit('user_123', 5);

            expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
                where: {
                    clerkId: 'user_123',
                    credits: { gte: 5 },
                },
                data: { credits: { decrement: 5 } },
            });
        });

        it('should prevent concurrent double-deduction (race condition simulation)', async () => {
            // First call succeeds, second fails (balance already spent)
            mockPrisma.user.updateMany
                .mockResolvedValueOnce({ count: 1 })
                .mockResolvedValueOnce({ count: 0 });

            mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
                id: 'uuid-1',
                clerkId: 'user_123',
                email: 'test@test.com',
                credits: 0,
                createdAt: new Date(),
            });

            // First call succeeds
            await expect(deductCredit('user_123', 1)).resolves.toBeDefined();

            // Second concurrent call fails — credits already spent
            await expect(deductCredit('user_123', 1)).rejects.toThrow(
                'Insufficient credits'
            );
        });
    });

    describe('hasCredits', () => {
        it('should return true when user has credits', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'uuid-1',
                clerkId: 'user_123',
                email: 'test@test.com',
                credits: 50,
                createdAt: new Date(),
            });

            const result = await hasCredits('user_123');
            expect(result).toBe(true);
        });

        it('should return false when user has zero credits', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'uuid-1',
                clerkId: 'user_123',
                email: 'test@test.com',
                credits: 0,
                createdAt: new Date(),
            });

            const result = await hasCredits('user_123');
            expect(result).toBe(false);
        });

        it('should return false when user does not exist', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const result = await hasCredits('nonexistent');
            expect(result).toBe(false);
        });
    });

    describe('getOrCreateUser', () => {
        it('should upsert user with 100 initial credits', async () => {
            mockPrisma.user.upsert.mockResolvedValue({
                id: 'uuid-1',
                clerkId: 'user_new',
                email: 'new@test.com',
                credits: 100,
                createdAt: new Date(),
            });

            const user = await getOrCreateUser('user_new', 'new@test.com');

            expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
                where: { clerkId: 'user_new' },
                update: {},
                create: {
                    clerkId: 'user_new',
                    email: 'new@test.com',
                    credits: 100,
                },
            });
            expect(user.credits).toBe(100);
        });
    });
});
