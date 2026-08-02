/**
 * Shared CSV cell escaper for all root-package CSV emitters.
 *
 * Handles (CWE-1236 formula injection + standard CSV quoting):
 * - Cells starting with = + - @ (or tab/CR variants) get a leading single quote
 *   so Excel/Sheets render them as text instead of executing them as formulas.
 * - Cells containing commas, quotes, CR or LF are wrapped in double quotes with
 *   internal quotes doubled. \r is included — bare CR also breaks CSV rows.
 *
 * NOTE: dashboard/ is a separate npm package and cannot import this file;
 * dashboard/src/lib/csvEscape.ts is its intentionally-duplicated counterpart.
 */
export function escapeCsvCell(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    let str = String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
