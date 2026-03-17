#!/usr/bin/env tsx
/**
 * Pre-worker build guard: ensures dist/ is in sync with src/.
 * Run this before starting workers to prevent stale JS execution.
 *
 * Usage: npx tsx src/scripts/ensure-build.ts
 * Or add to package.json: "preworker": "tsx src/scripts/ensure-build.ts && node dist/worker.js"
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');

function newestMtime(dir: string, ext: string): number {
    let newest = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            newest = Math.max(newest, newestMtime(full, ext));
        } else if (entry.name.endsWith(ext)) {
            newest = Math.max(newest, fs.statSync(full).mtimeMs);
        }
    }
    return newest;
}

const srcTime = newestMtime(SRC, '.ts');
const distTime = fs.existsSync(DIST) ? newestMtime(DIST, '.js') : 0;

if (srcTime > distTime) {
    console.log('⚠️  dist/ is stale — rebuilding...');
    execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });
    console.log('✅ Build complete. dist/ is now in sync.');
} else {
    console.log('✅ dist/ is up to date.');
}
