import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

describe('Prisma Schema Additions', () => {
  it('includes nextAttemptAt and attemptCount in CompanyScalarFieldEnum', () => {
    expect(Prisma.CompanyScalarFieldEnum.nextAttemptAt).toBe('nextAttemptAt');
    expect(Prisma.CompanyScalarFieldEnum.attemptCount).toBe('attemptCount');
  });

  it('includes nextAttemptAt and attemptCount in ScrapeTaskScalarFieldEnum', () => {
    expect(Prisma.ScrapeTaskScalarFieldEnum.nextAttemptAt).toBe('nextAttemptAt');
    expect(Prisma.ScrapeTaskScalarFieldEnum.attemptCount).toBe('attemptCount');
  });

  it('includes CreditLedgerScalarFieldEnum', () => {
    expect(Prisma.CreditLedgerScalarFieldEnum.delta).toBe('delta');
    expect(Prisma.CreditLedgerScalarFieldEnum.reason).toBe('reason');
  });
});
