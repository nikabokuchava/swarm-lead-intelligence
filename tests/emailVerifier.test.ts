import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// dns.promises Resolver is constructed at module load — mock before importing the module.
const mockResolveMx = vi.fn();
vi.mock('node:dns/promises', () => ({
    Resolver: class {
        setServers() { /* no-op */ }
        resolveMx(domain: string) { return mockResolveMx(domain); }
    },
}));

/**
 * Scripted SMTP socket. `smtpScript` holds the server responses in order
 * (greeting, HELO reply, MAIL FROM reply, RCPT TO reply); each client write
 * advances one step. `smtpMode = 'error'` simulates an unreachable server.
 * spyOn cannot intercept the module-internal probeSmtp call, so the transport
 * is what the tests drive.
 */
let smtpScript: string[] = [];
let smtpMode: 'script' | 'error' = 'script';
const socketConnect = vi.fn();

vi.mock('node:net', () => ({
    Socket: class {
        private handlers: Record<string, (arg?: unknown) => void> = {};
        private idx = 0;
        setTimeout() { /* no-op */ }
        on(event: string, cb: (arg?: unknown) => void) { this.handlers[event] = cb; }
        write() { queueMicrotask(() => this.next()); }
        destroy() { /* no-op */ }
        connect(...args: unknown[]) {
            socketConnect(...args);
            if (smtpMode === 'error') {
                queueMicrotask(() => this.handlers.error?.({ code: 'ECONNREFUSED' }));
                return;
            }
            queueMicrotask(() => this.next());
        }
        private next() {
            const line = smtpScript[this.idx++];
            if (line !== undefined) this.handlers.data?.(Buffer.from(line + '\r\n'));
        }
    },
}));

const CATCH_ALL_SCRIPT = ['220 ready', '250 helo ok', '250 sender ok', '250 recipient ok'];
const NOT_CATCH_ALL_SCRIPT = ['220 ready', '250 helo ok', '250 sender ok', '550 no such user'];

describe('emailVerifier — SMTP probing disabled (no SMTP_HELO_DOMAIN)', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        smtpMode = 'script';
        smtpScript = NOT_CATCH_ALL_SCRIPT;
        delete process.env.SMTP_HELO_DOMAIN;
        delete process.env.SMTP_PROBE_FROM;
        delete process.env.LOCAL_DEMO_MODE;
    });

    it('exports SMTP_PROBING_ENABLED = false when unconfigured', async () => {
        const { SMTP_PROBING_ENABLED } = await import('../src/services/emailVerifier');
        expect(SMTP_PROBING_ENABLED).toBe(false);
    });

    it('returns UNKNOWN (never VALID/INVALID) for a domain with valid MX, and opens no socket', async () => {
        mockResolveMx.mockResolvedValue([{ exchange: 'aspmx.l.google.com', priority: 10 }]);
        const { verifyEmail } = await import('../src/services/emailVerifier');

        const result = await verifyEmail('someone@example.com');

        expect(result.status).toBe('UNKNOWN');
        expect(result.status).not.toBe('VALID');
        expect(result.status).not.toBe('INVALID');
        expect(result.mxProvider).toBe('Google');
        expect(socketConnect).not.toHaveBeenCalled();
    });

    it('probeSmtp short-circuits to UNKNOWN without connecting', async () => {
        const { probeSmtp } = await import('../src/services/emailVerifier');

        const result = await probeSmtp('someone@example.com', 'aspmx.l.google.com');

        expect(result.status).toBe('UNKNOWN');
        expect(result.error).toMatch(/disabled/i);
        expect(socketConnect).not.toHaveBeenCalled();
    });

    it('still returns INVALID for structurally bad input (no probe needed)', async () => {
        const { verifyEmail } = await import('../src/services/emailVerifier');

        expect((await verifyEmail('not-an-email')).status).toBe('INVALID');
        expect(socketConnect).not.toHaveBeenCalled();
    });

    it('does not negative-cache the catch-all verdict when the probe never ran', async () => {
        mockResolveMx.mockResolvedValue([{ exchange: 'aspmx.l.google.com', priority: 10 }]);
        const { getMxInfo } = await import('../src/services/emailVerifier');

        await getMxInfo('example.com');
        await getMxInfo('example.com');

        // Undetermined probe => entry is not cached => DNS is consulted again.
        expect(mockResolveMx).toHaveBeenCalledTimes(2);
    });
});

describe('emailVerifier — SMTP probing enabled', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        smtpMode = 'script';
        delete process.env.LOCAL_DEMO_MODE;
        delete process.env.MX_CACHE_TTL_MS;
        process.env.SMTP_HELO_DOMAIN = 'probe.example.test';
        process.env.SMTP_PROBE_FROM = 'ping@probe.example.test';
        mockResolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
    });

    afterEach(() => {
        vi.useRealTimers();
        delete process.env.SMTP_HELO_DOMAIN;
        delete process.env.SMTP_PROBE_FROM;
        delete process.env.MX_CACHE_TTL_MS;
    });

    it('caches a determined result within the TTL window', async () => {
        process.env.MX_CACHE_TTL_MS = '3600000';
        smtpScript = NOT_CATCH_ALL_SCRIPT;
        const { getMxInfo } = await import('../src/services/emailVerifier');

        await getMxInfo('fresh.example.com');
        await getMxInfo('fresh.example.com');
        await getMxInfo('fresh.example.com');

        expect(mockResolveMx).toHaveBeenCalledTimes(1);
    });

    it('re-resolves after the TTL expires', async () => {
        process.env.MX_CACHE_TTL_MS = '1000';
        smtpScript = NOT_CATCH_ALL_SCRIPT;
        const { getMxInfo } = await import('../src/services/emailVerifier');

        await getMxInfo('cached.example.com');
        await getMxInfo('cached.example.com');
        expect(mockResolveMx).toHaveBeenCalledTimes(1); // served from cache

        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + 2000); // past the 1s TTL
        await getMxInfo('cached.example.com');

        expect(mockResolveMx).toHaveBeenCalledTimes(2); // expired => re-resolved
    });

    it('detects a catch-all domain and caches it', async () => {
        smtpScript = CATCH_ALL_SCRIPT;
        const { getMxInfo } = await import('../src/services/emailVerifier');

        const entry = await getMxInfo('catchall.example.com');

        expect(entry?.isCatchAll).toBe(true);
        expect(entry?.fetchedAt).toBeTypeOf('number');
    });

    it('does NOT negative-cache a domain whose catch-all probe failed', async () => {
        smtpMode = 'error'; // server unreachable => probe verdict UNKNOWN
        const { getMxInfo } = await import('../src/services/emailVerifier');

        const first = await getMxInfo('flaky.example.com');
        await getMxInfo('flaky.example.com');

        // isCatchAll=false was never stored, so a later real catch-all verdict can still win.
        expect(first?.isCatchAll).toBe(false);
        expect(mockResolveMx).toHaveBeenCalledTimes(2);
    });

    it('a failed probe followed by a successful one yields the true catch-all verdict', async () => {
        smtpMode = 'error';
        const { getMxInfo } = await import('../src/services/emailVerifier');
        expect((await getMxInfo('later.example.com'))?.isCatchAll).toBe(false);

        // Server recovers and reveals the domain really is a catch-all.
        smtpMode = 'script';
        smtpScript = CATCH_ALL_SCRIPT;
        expect((await getMxInfo('later.example.com'))?.isCatchAll).toBe(true);
    });
});
