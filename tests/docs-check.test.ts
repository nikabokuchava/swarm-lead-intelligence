import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';

describe('Repository Documentation Completeness', () => {
    it('README contains Mermaid architecture diagram', () => {
        const readme = fs.readFileSync('README.md', 'utf-8');
        expect(readme).toContain('```mermaid');
        expect(readme).toContain('graph TD');
    });

    it('docs directory includes COMPLIANCE, TERMS, and PRIVACY templates', () => {
        expect(fs.existsSync('docs/COMPLIANCE.md')).toBe(true);
        expect(fs.existsSync('docs/TERMS_TEMPLATE.md')).toBe(true);
        expect(fs.existsSync('docs/PRIVACY_TEMPLATE.md')).toBe(true);
    });

    it('.env.example documents all essential runtime variables', () => {
        const envExample = fs.readFileSync('.env.example', 'utf-8');
        expect(envExample).toContain('DATABASE_URL');
        expect(envExample).toContain('WORKER_HEALTH_PORT');
        expect(envExample).toContain('SMTP_HELO_DOMAIN');
        expect(envExample).toContain('MX_CACHE_TTL_MS');
    });
});
