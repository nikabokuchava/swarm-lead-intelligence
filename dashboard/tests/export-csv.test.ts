import { describe, it, expect } from 'vitest';
import { escapeCsvCell } from '@/lib/csvEscape';
import fs from 'fs';
import path from 'path';

describe('CSV Formula Injection Defense (CWE-1236)', () => {
  it('neutralizes dangerous formula characters at cell start', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+SUM(A1:A10)')).toBe("'+SUM(A1:A10)");
    expect(escapeCsvCell('-20*5')).toBe("'-20*5");
    expect(escapeCsvCell('@cmd|calc')).toBe("'@cmd|calc");
    expect(escapeCsvCell('\t=2+2')).toBe("'\t=2+2");
    // Bare \r is a row-terminating character in CSV (RFC 4180), so escapeCsvCell wraps it in double-quotes
    expect(escapeCsvCell('\r=3+3')).toBe('"\'\r=3+3"');
  });

  it('escapes quotes and wraps in double quotes when formula and comma coincide', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil.com","Click")')).toBe('"\'=HYPERLINK(""http://evil.com"",""Click"")"');
  });

  it('preserves clean numeric and text strings unmodified', () => {
    expect(escapeCsvCell('Acme Plumbing LLC')).toBe('Acme Plumbing LLC');
    expect(escapeCsvCell(4.8)).toBe('4.8');
    expect(escapeCsvCell(120)).toBe('120');
  });

  it('verifies db.ts does not log DATABASE_URL on startup (S1 credential leak)', () => {
    const dbSource = fs.readFileSync(path.resolve(__dirname, '../src/lib/db.ts'), 'utf-8');
    expect(dbSource).not.toMatch(/console\.log\(.*DATABASE_URL.*\)/);
  });

  it('verifies api/leads/export/route.ts uses escapeCsvCell for CSV serialization', () => {
    const routeSource = fs.readFileSync(path.resolve(__dirname, '../src/app/api/leads/export/route.ts'), 'utf-8');
    expect(routeSource).toContain("import { escapeCsvCell } from '@/lib/csvEscape'");
    expect(routeSource).toContain('const escape = escapeCsvCell');
  });
});
