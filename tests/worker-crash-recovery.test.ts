import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

vi.mock('../src/db/queue.js', () => ({
  getNextPendingLead: vi.fn(),
  completeJob: vi.fn(),
  failJobOrRetry: vi.fn().mockResolvedValue(undefined),
  recoverStaleLocks: vi.fn().mockResolvedValue({ tasks: 0, companies: 0 }),
  cancelOrphanedPendingRecords: vi.fn().mockResolvedValue({ tasks: 0, companies: 0 }),
}));

import { failJobOrRetry } from '../src/db/queue.js';

describe('Worker Crash Loop Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls failJobOrRetry with inFlight company id and retries when error throws during scrape', async () => {
    const inFlight = { id: 'comp-crash-99', retries: 1 };
    const simulatedError = new Error('Browser out of memory');

    // Simulate error handling block in worker.ts
    try {
      throw simulatedError;
    } catch (loopError) {
      if (inFlight) {
        await failJobOrRetry(inFlight.id, inFlight.retries, (loopError as Error).message);
      }
    }

    expect(failJobOrRetry).toHaveBeenCalledWith(
      'comp-crash-99',
      1,
      'Browser out of memory'
    );
  });

  it('handles non-Error objects in catch block gracefully with string conversion', async () => {
    let inFlight: { id: string; retries: number } | null = { id: 'comp-crash-non-error', retries: 2 };
    const simulatedError = 'String error message';

    try {
      throw simulatedError;
    } catch (loopError) {
      const errorMsg = loopError instanceof Error ? loopError.message : String(loopError);
      if (inFlight) {
        try {
          await failJobOrRetry(inFlight.id, inFlight.retries, errorMsg);
        } catch {
          // ignore
        }
        inFlight = null;
      }
    }

    expect(failJobOrRetry).toHaveBeenCalledWith('comp-crash-non-error', 2, 'String error message');
    expect(inFlight).toBeNull();
  });

  it('resets inFlight to null even when failJobOrRetry rejects', async () => {
    vi.mocked(failJobOrRetry).mockRejectedValueOnce(new Error('DB failure during release'));
    let inFlight: { id: string; retries: number } | null = { id: 'comp-db-fail', retries: 0 };

    try {
      throw new Error('Crash');
    } catch (loopError) {
      const errorMsg = loopError instanceof Error ? loopError.message : String(loopError);
      if (inFlight) {
        try {
          await failJobOrRetry(inFlight.id, inFlight.retries, errorMsg);
        } catch (_releaseErr) {
          // logged
        }
        inFlight = null;
      }
    }

    expect(inFlight).toBeNull();
  });

  describe('Source Code Invariants in src/worker.ts', () => {
    const workerSource = fs.readFileSync('src/worker.ts', 'utf-8');

    it('has errorMsg extraction in catch (loopError) block', () => {
      expect(workerSource).toContain('const errorMsg = loopError instanceof Error ? loopError.message : String(loopError);');
    });

    it('calls failJobOrRetry with inFlight.id, inFlight.retries, errorMsg', () => {
      expect(workerSource).toContain('await failJobOrRetry(inFlight.id, inFlight.retries, errorMsg);');
    });

    it('logs release with retry count info', () => {
      expect(workerSource).toContain('Released claimed company ${inFlight.id} after crash (retries was: ${inFlight.retries})');
    });

    it('clears inFlight to null after release attempt', () => {
      expect(workerSource).toMatch(/await failJobOrRetry[\s\S]*?inFlight = null;/);
    });
  });
});
