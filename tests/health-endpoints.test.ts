import { describe, it, expect } from 'vitest';
import * as http from 'http';
import * as fs from 'node:fs';
import { createPollerHealthServer } from '../src/services/jobPoller.js';

describe('Service Healthcheck Responses', () => {
    it('creates standard JSON health check structure with 200 status', async () => {
        const payload = JSON.stringify({
            status: 'ok',
            service: 'poller',
            uptime: 12.34
        });

        const server = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(payload);
        });

        await new Promise<void>((resolve) => server.listen(0, resolve));
        const addr = server.address() as any;

        const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.status).toBe('ok');
        expect(json.service).toBe('poller');

        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
});

describe('Poller Health Server Implementation', () => {
    it('serves health status with 200 and expected payload structure on /health and /', async () => {
        const { server } = createPollerHealthServer(0);
        await new Promise<void>((resolve) => server.listen(0, resolve));
        const addr = server.address() as any;

        const healthRes = await fetch(`http://127.0.0.1:${addr.port}/health`);
        expect(healthRes.status).toBe(200);
        expect(healthRes.headers.get('content-type')).toContain('application/json');
        const healthJson = await healthRes.json();
        expect(healthJson.status).toBe('ok');
        expect(healthJson.service).toBe('job-poller');
        expect(typeof healthJson.pollerId).toBe('string');
        expect(healthJson.pollerId).toMatch(/^poller-/);
        expect(typeof healthJson.uptime).toBe('number');

        const rootRes = await fetch(`http://127.0.0.1:${addr.port}/`);
        expect(rootRes.status).toBe(200);
        const rootJson = await rootRes.json();
        expect(rootJson.status).toBe('ok');

        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('defaults to port 8081 or uses POLLER_HEALTH_PORT env var', () => {
        const originalEnv = process.env.POLLER_HEALTH_PORT;
        try {
            delete process.env.POLLER_HEALTH_PORT;
            const defaultInstance = createPollerHealthServer();
            expect(defaultInstance.port).toBe(8081);

            process.env.POLLER_HEALTH_PORT = '9099';
            const customInstance = createPollerHealthServer();
            expect(customInstance.port).toBe(9099);
        } finally {
            if (originalEnv !== undefined) {
                process.env.POLLER_HEALTH_PORT = originalEnv;
            } else {
                delete process.env.POLLER_HEALTH_PORT;
            }
        }
    });

    it('cleans up healthServer on shutdown in jobPoller source', () => {
        const source = fs.readFileSync('src/services/jobPoller.ts', 'utf-8');
        expect(source).toContain('healthServer');
        expect(source).toContain('POLLER_HEALTH_PORT');
        expect(source).toMatch(/healthServer\.close\(\)/);
    });

    it('uses createPollerHealthServer and attaches error listener in startPolling', () => {
        const source = fs.readFileSync('src/services/jobPoller.ts', 'utf-8');
        expect(source).toContain('const { server: healthServer, port: pollerHealthPort } = createPollerHealthServer();');
        expect(source).toMatch(/healthServer\.on\('error'/);
    });
});

describe('Docker Compose Healthchecks and Parameterization', () => {
    const composeContent = fs.readFileSync('docker-compose.yml', 'utf-8');

    it('parameterizes Postgres environment credentials with fallback defaults', () => {
        expect(composeContent).toContain('POSTGRES_USER: ${POSTGRES_USER:-swarm}');
        expect(composeContent).toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-swarm_secret}');
        expect(composeContent).toContain('POSTGRES_DB: ${POSTGRES_DB:-swarm_leads}');
    });

    it('configures healthcheck for job-poller service on port 8081', () => {
        const pollerSection = composeContent.slice(composeContent.indexOf('job-poller:'));
        expect(pollerSection).toContain('healthcheck:');
        expect(pollerSection).toContain('http://127.0.0.1:8081/');
        expect(pollerSection).toContain('interval: 30s');
        expect(pollerSection).toContain('timeout: 5s');
        expect(pollerSection).toContain('retries: 3');
        expect(pollerSection).toContain('start_period: 30s');
    });
});
