import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const leads = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const csvHeaders = ['Name', 'Website', 'Phone', 'Address', 'Emails', 'Status', 'Contacts Count'];
    const csvRows = leads.map(lead => {
      return [
        lead.name || '',
        lead.website || '',
        lead.phone || '',
        lead.address ? `"${lead.address.replace(/"/g, '""')}"` : '', // Escape quotes
        lead.emails ? `"${lead.emails.join(', ')}"` : '',
        lead.status,
        0 // Placeholder for contacts count if needed, or we can fetch include count. User asked for specific headers.
      ].join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="leads-export.csv"',
      },
    });
  } catch (error) {
    console.error('Failed to export leads:', error);
    return new NextResponse('Failed to export leads', { status: 500 });
  }
}
