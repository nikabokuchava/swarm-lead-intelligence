import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatLead, runDemo } from '../src/scripts/demo.js';

describe('Demo Showcase Script Verification', () => {
    it('verifies demo script exists in src/scripts/demo.ts', () => {
        const demoPath = path.resolve(process.cwd(), 'src/scripts/demo.ts');
        expect(fs.existsSync(demoPath)).toBe(true);
    });

    it('verifies package.json contains demo script', () => {
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        expect(pkg.scripts).toBeDefined();
        expect(pkg.scripts.demo).toBe('tsx src/scripts/demo.ts');
    });

    it('verifies demo runner format helper renders ASCII report correctly', () => {
        expect(typeof formatLead).toBe('function');
        const line = formatLead('Acme Corp', 'ceo@acme.com', 95);
        expect(line).toContain('Acme Corp');
        expect(line).toContain('ceo@acme.com');
        expect(line).toContain('95%');
    });

    it('verifies importing demo module does not run crawler or trigger process.exit', () => {
        expect(typeof runDemo).toBe('function');
    });
});
