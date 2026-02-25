import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

const workerSource = fs.readFileSync('src/worker.ts', 'utf-8');

describe('Worker: Runtime Invariants', () => {

    it('should rotate browser every 50 jobs', () => {
        expect(workerSource).toContain('JOBS_PER_BROWSER_SESSION = 50');
    });

    it('should export runWorker for testability', () => {
        expect(workerSource).toContain('export { runWorker }');
    });

    it('should have graceful shutdown on SIGINT and SIGTERM', () => {
        expect(workerSource).toContain("process.on('SIGINT'");
        expect(workerSource).toContain("process.on('SIGTERM'");
    });

    it('should attempt DB reconnection on catastrophic error', () => {
        expect(workerSource).toContain('await disconnectDB()');
        expect(workerSource).toContain('await connectDB()');
        expect(workerSource).toContain('Database reconnected successfully');
    });

    it('should use SKIP LOCKED queue via getNextPendingLead', () => {
        expect(workerSource).toContain('getNextPendingLead');
    });
});

describe('Worker: Memory Safety', () => {

    it('should call rotateBrowser after reaching job threshold', () => {
        const rotateCallPattern = /if\s*\(\s*jobCount\s*>=\s*JOBS_PER_BROWSER_SESSION\s*\)/;
        expect(rotateCallPattern.test(workerSource)).toBe(true);
    });

    it('should force browser restart on crash recovery', () => {
        expect(workerSource).toContain("rotateBrowser('crash recovery')");
    });
});
