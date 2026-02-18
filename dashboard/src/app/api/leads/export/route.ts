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
      include: {
        _count: {
          select: { contacts: true },
        },
      },
    });

    const csvHeaders = ['Name', 'Website', 'Phone', 'Address', 'Emails', 'Status', 'Contacts Count'];
    const csvRows = leads.map(lead => {
      // Escape CSV fields properly
      const escape = (str: string | null) => str ? `"${str.replace(/"/g, '""')}"` : '';
      
      return [
        escape(lead.name),
        escape(lead.website),
        escape(lead.phone),
        escape(lead.address),
        lead.emails ? `"${lead.emails.join('; ')}"` : '',
        lead.status,
        lead._count.contacts
      ].join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads-export${jobId ? `-${jobId}` : ''}.csv"`,
      },
    });
  } catch (error) {
    console.error('Failed to export leads:', error);
    return new NextResponse('Failed to export leads', { status: 500 });
  }
}
