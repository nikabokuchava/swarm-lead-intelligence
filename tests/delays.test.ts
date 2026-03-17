import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StealthBrowser } from '../src/scraper/stealthBrowser';

describe('StealthBrowser Simulation Delays', () => {
    let stealthBrowser: StealthBrowser;

    beforeEach(() => {
        vi.useFakeTimers();
        stealthBrowser = new StealthBrowser();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should wait ~0.3-1s for low risk level', async () => {
        const mockPage = {
            mouse: { move: vi.fn().mockResolvedValue(undefined) },
            evaluate: vi.fn().mockResolvedValue(undefined)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        const promise = stealthBrowser.simulateHuman(mockPage, 'low');
        
        let isResolved = false;
        promise.then(() => { isResolved = true; });

        await vi.advanceTimersByTimeAsync(299);
        expect(isResolved).toBe(false);

        await vi.advanceTimersByTimeAsync(701);
        expect(isResolved).toBe(true);
    });

    it('should wait ~1-3s for high risk level', async () => {
         const mockPage = {
            mouse: { move: vi.fn().mockResolvedValue(undefined) },
            evaluate: vi.fn().mockResolvedValue(undefined)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        const promise = stealthBrowser.simulateHuman(mockPage, 'high');
        
        let isResolved = false;
        promise.then(() => { isResolved = true; });
        
        await vi.advanceTimersByTimeAsync(999);
        expect(isResolved).toBe(false);

        await vi.advanceTimersByTimeAsync(2001);
        expect(isResolved).toBe(true);
    });
});
