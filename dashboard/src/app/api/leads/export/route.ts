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

    // SEC: Defense-in-depth — verify jobId belongs to requesting user
    if (jobId) {
      const job = await prisma.scrapeJob.findUnique({
        where: { id: jobId },
        select: { userId: true },
      });
      if (!job || job.userId !== userId) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

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

    const csvRows = leads.map(lead => {
      const companyFields = [
        escape(lead.name),
        escape(lead.website),
        escape(lead.phone),
        escape(lead.address),
        escape(lead.rating),
        escape(lead.reviewCount),
      ];

      const best = lead.contacts.length > 0
        ? [...lead.contacts].sort((a, b) => {
            if (a.verificationStatus === 'VALID' && b.verificationStatus !== 'VALID') return -1;
            if (b.verificationStatus === 'VALID' && a.verificationStatus !== 'VALID') return 1;
            return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
          })[0]
        : null;

      return [
        ...companyFields,
        escape(best?.fullName),
        escape(best?.workEmail),
        escape(best?.emailType),
        escape(best?.confidenceScore != null ? Math.round(best.confidenceScore) : null),
        escape(best?.verificationStatus),
        escape(best?.mxProvider),
      ].join(',');
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
