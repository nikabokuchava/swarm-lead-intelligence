import { describe, it, expect } from 'vitest';
import { escapeCsvCell } from '../src/utils/csvEscape';

describe('escapeCsvCell (CWE-1236)', () => {
    it('returns empty string for null/undefined/empty', () => {
        expect(escapeCsvCell(null)).toBe('');
        expect(escapeCsvCell(undefined)).toBe('');
        expect(escapeCsvCell('')).toBe('');
    });

    it('passes plain values through unchanged', () => {
        expect(escapeCsvCell('Acme HVAC')).toBe('Acme HVAC');
        expect(escapeCsvCell(42)).toBe('42');
    });

    it('neutralizes formula-injection prefixes = + - @', () => {
        expect(escapeCsvCell('=CMD|calc!A1')).toBe("'=CMD|calc!A1");
        expect(escapeCsvCell('+1234')).toBe("'+1234");
        expect(escapeCsvCell('-2+3')).toBe("'-2+3");
        expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    });

    it('neutralizes tab/CR-prefixed formula variants', () => {
        expect(escapeCsvCell('\t=1+1')).toMatch(/^'/);
        expect(escapeCsvCell('\r=1+1')).toMatch(/^["']/);
    });

    it('quotes cells containing commas, quotes and newlines', () => {
        expect(escapeCsvCell('a,b')).toBe('"a,b"');
        expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
        expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    });

    it('quotes cells containing bare \\r (previously unhandled)', () => {
        expect(escapeCsvCell('line1\rline2')).toBe('"line1\rline2"');
    });

    it('handles formula prefix + quoting together', () => {
        expect(escapeCsvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    });
});
