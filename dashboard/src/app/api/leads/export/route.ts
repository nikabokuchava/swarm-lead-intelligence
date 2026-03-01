import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    const whereClause = {
      userId,
      ...(jobId ? { jobId } : {}),
    };

    const leads = await prisma.company.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: { contacts: true },
    });

    const escape = (val: string | number | null | undefined): string => {
      if (val == null || val === '') return '';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvHeaders = [
      'Company Name', 'Website', 'Phone', 'Address', 'Rating', 'Review Count',
      'Contact Name', 'Email', 'Email Type', 'Confidence (%)', 'Verification Status', 'MX Provider',
    ];

    const csvRows = leads.flatMap(lead => {
      const companyFields = [
        escape(lead.name),
        escape(lead.website),
        escape(lead.phone),
        escape(lead.address),
        escape(lead.rating),
        escape(lead.reviewCount),
      ];

      if (lead.contacts.length === 0) {
        return [[ ...companyFields, '', '', '', '', '', '' ].join(',')];
      }

      return lead.contacts.map(c => [
        ...companyFields,
        escape(c.fullName),
        escape(c.workEmail),
        escape(c.emailType),
        escape(c.confidenceScore != null ? Math.round(c.confidenceScore) : null),
        escape(c.verificationStatus),
        escape(c.mxProvider),
      ].join(','));
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    // SEC-05: Sanitize jobId for safe header injection
    const safeJobId = jobId ? jobId.replace(/[^a-zA-Z0-9-]/g, '') : '';

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads-export${safeJobId ? `-${safeJobId}` : ''}.csv"`,
      },
    });
  } catch (error) {
    console.error('Failed to export leads:', error);
    return new NextResponse('Failed to export leads', { status: 500 });
  }
}
