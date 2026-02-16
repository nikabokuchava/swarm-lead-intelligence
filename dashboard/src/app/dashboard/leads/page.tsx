import { prisma } from '@/lib/db';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Terminal } from 'lucide-react';
import { DeleteLeadButton } from '@/components/DeleteLeadButton';
import Link from 'next/link';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

interface LeadsPageProps {
  searchParams: Promise<{ jobId?: string }>;
}

export default async function LeadsPage(props: LeadsPageProps) {
  const searchParams = await props.searchParams;
  const jobId = searchParams.jobId;
  let jobName = null;

  if (jobId) {
    const job = await prisma.scrapeJob.findUnique({
      where: { id: jobId },
      select: { query: true }
    });
    if (job) jobName = job.query;
  }

  const whereClause = jobId ? { jobId } : {};

  const leads = await prisma.company.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { contacts: true },
      },
    },
  });

  const totalLeads = leads.length;
  const processedLeads = leads.filter(l => l.status === 'COMPLETED').length;
  const emailsFound = leads.reduce((acc, curr) => acc + (curr.emails?.length || 0), 0);

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
                {jobName ? `Results: ${jobName}` : "Leads Overview"}
            </h1>
            <p className="text-zinc-400 text-sm">
                {jobName ? 'Manage extraction results for this job.' : 'View all captured leads and contacts.'}
            </p>
            {jobName && (
                <Link href="/dashboard/leads" className="text-xs text-amber-500 hover:text-amber-400 hover:underline inline-flex items-center gap-1 font-mono mt-1">
                    ← VIEW ALL LEADS
                </Link>
            )}
        </div>
        <Button asChild variant="outline" className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300">
          <Link href={`/api/leads/export${jobId ? `?jobId=${jobId}` : ''}`}>
            <Download className="mr-2 h-4 w-4 text-amber-500" />
            <span className="font-mono text-xs uppercase tracking-wider">Export CSV</span>
          </Link>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
            { title: 'Total Leads', value: totalLeads },
            { title: 'Processed', value: processedLeads },
            { title: 'Emails Found', value: emailsFound }
        ].map((stat, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 backdrop-blur-sm">
                <div className="text-sm font-medium text-zinc-500 font-mono uppercase tracking-wider">{stat.title}</div>
                <div className="mt-2 text-3xl font-bold text-zinc-100">{stat.value}</div>
            </div>
        ))}
      </div>

      {/* Main Data Container */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-2xl">
        
        {/* Command Bar */}
        <div className="border-b border-zinc-800/50 px-4 py-3 flex items-center gap-3 bg-zinc-900/80">
            <Terminal className="h-4 w-4 text-amber-500" />
            <input 
                type="text" 
                placeholder="Filter leads by name or website..." 
                className="bg-transparent border-none focus:ring-0 text-sm font-mono text-zinc-200 w-full placeholder:text-zinc-600 focus:outline-none h-9"
            />
            <div className="hidden md:flex text-xs text-zinc-600 font-mono gap-2">
                <span className="bg-zinc-800 px-1.5 py-0.5 rounded">⌘K</span>
                <span>to search</span>
            </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader className="bg-zinc-950/30">
            <TableRow className="border-zinc-800/50 hover:bg-transparent">
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-medium tracking-wider h-10">Company</TableHead>
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-medium tracking-wider h-10">Website</TableHead>
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-medium tracking-wider h-10">Status</TableHead>
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-medium tracking-wider h-10">Contacts</TableHead>
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-medium tracking-wider h-10 text-right">Emails</TableHead>
              <TableHead className="w-[50px] h-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
                <TableCell className="font-medium text-zinc-200 py-3">{lead.name}</TableCell>
                <TableCell className="py-3">
                  <a href={lead.website || '#'} target="_blank" className="text-zinc-500 hover:text-amber-500 transition-colors hover:underline text-sm">
                    {lead.website || <span className="opacity-30">-</span>}
                  </a>
                </TableCell>
                <TableCell className="py-3">
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-transparent ${
                        lead.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500' :
                        lead.status === 'FAILED' ? 'bg-red-500/10 text-red-500' :
                        'bg-amber-500/10 text-amber-500 animate-pulse'
                    }`}>
                        {lead.status}
                    </div>
                </TableCell>
                <TableCell className="text-zinc-400 py-3">{lead._count.contacts}</TableCell>
                <TableCell className="text-right py-3">
                  {lead.emails.length > 0 ? (
                      <span className="text-zinc-300 font-mono text-xs bg-zinc-800/50 px-1.5 py-0.5 rounded">
                        {lead.emails[0]} {lead.emails.length > 1 && `+${lead.emails.length - 1}`}
                      </span>
                  ) : (
                    <span className="text-zinc-700">-</span>
                  )}
                </TableCell>
                <TableCell className="py-3">
                   <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <DeleteLeadButton id={lead.id} />
                   </div>
                </TableCell>
              </TableRow>
            ))}
            {leads.length === 0 && (
                <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-32 text-center text-zinc-500">
                        No leads found. Start a job to see data here.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
