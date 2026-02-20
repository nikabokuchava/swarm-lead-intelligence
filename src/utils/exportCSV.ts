import * as fs from 'fs';

interface Company {
    id: string;
    name: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    emails: string[];
    source: string | null;
    createdAt: Date;
}

/**
 * Exports companies to CSV format
 * @param companies - Array of company objects to export
 * @param outputPath - Path where CSV will be saved (optional)
 * @returns The path of the generated CSV file
 */
export function exportToCSV(companies: Company[], outputPath?: string): string {
    if (companies.length === 0) {
        throw new Error('No companies to export');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = outputPath || `leads_${timestamp}.csv`;

    // CSV Headers
    const headers = ['Name', 'Phone', 'Website', 'Address', 'Emails', 'Source', 'Created At'];
    
    // CSV Rows
    const rows = companies.map(company => [
        escapeCSV(company.name),
        escapeCSV(company.phone || ''),
        escapeCSV(company.website || ''),
        escapeCSV(company.address || ''),
        escapeCSV(company.emails?.join('; ') || ''),
        escapeCSV(company.source || ''),
        company.createdAt.toISOString()
    ]);

    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    // Write to file (using Node.js fs)
    fs.writeFileSync(filename, csvContent, 'utf-8');

    return filename;
}

/**
 * Escapes special characters for CSV format
 */
function escapeCSV(value: string): string {
    if (!value) return '';
    
    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    
    return value;
}
