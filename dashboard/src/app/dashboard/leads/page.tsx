import { prisma } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Terminal, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { DeleteLeadButton } from '@/components/DeleteLeadButton';
import Link from 'next/link';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

interface LeadsPageProps {
  searchParams: Promise<{ jobId?: string }>;
}

export default async function LeadsPage(props: LeadsPageProps) {
  const { userId } = await auth();
  const searchParams = await props.searchParams;
  const jobId = searchParams.jobId;
  let jobName = null;

  if (jobId) {
    const job = await prisma.scrapeJob.findUnique({
      where: { id: jobId },
      select: { query: true, userId: true }
    });
    // Only show if user owns this job
    if (job && job.userId === userId) jobName = job.query;
  }

  const whereClause: Record<string, unknown> = userId ? { userId } : {};
  if (jobId) whereClause.jobId = jobId;

  const leads = await prisma.company.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      contacts: true,
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
          <TableHeader className="bg-zinc-950/50 border-b border-zinc-800">
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-bold tracking-widest h-10 w-[200px]">Company</TableHead>
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-bold tracking-widest h-10">Website</TableHead>
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-bold tracking-widest h-10">Phone</TableHead>
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-bold tracking-widest h-10">Status</TableHead>
              <TableHead className="font-mono uppercase text-[10px] text-zinc-500 font-bold tracking-widest h-10 text-right">Emails</TableHead>
              <TableHead className="w-[50px] h-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id} className="border-zinc-800/50 hover:bg-zinc-900/80 transition-all duration-200 group data-[state=selected]:bg-zinc-900">
                {/* Company Name */}
                <TableCell className="font-semibold text-zinc-200 py-3 font-sans">{lead.name}</TableCell>
                
                {/* Website */}
                <TableCell className="py-3">
                  <a href={lead.website || '#'} target="_blank" className="font-mono text-xs text-zinc-500 hover:text-amber-500 transition-colors hover:underline decoration-amber-500/30 underline-offset-4">
                    {lead.website ? lead.website.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0] : <span className="opacity-20">-</span>}
                  </a>
                </TableCell>

                {/* Phone (Subtle) */}
                <TableCell className="py-3">
                    {lead.phone ? (
                        <span className="font-mono text-xs text-zinc-500 select-all cursor-text hover:text-zinc-300 transition-colors" title={lead.phone}>
                            {lead.phone}
                        </span>
                    ) : (
                        <span className="text-zinc-800 font-mono text-xs">-</span>
                    )}
                </TableCell>

                {/* Status */}
                <TableCell className="py-3">
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-mono border ${
                        lead.status === 'COMPLETED' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900' :
                        lead.status === 'FAILED' ? 'bg-red-950/30 text-red-400 border-red-900' :
                        'bg-amber-950/30 text-amber-500 border-amber-900 animate-pulse'
                    }`}>
                        {lead.status === 'PENDING' ? 'WAITING' : lead.status}
                    </div>
                </TableCell>

                {/* Emails (High Priority + Verification) */}
                <TableCell className="text-right py-3">
                  {lead.emails.length > 0 ? (
                      <div className="flex flex-col items-end gap-1">
                           {lead.emails.slice(0, 3).map((email, idx) => {
                               // Find contact for verification status
                               const contact = lead.contacts.find(c => c.workEmail === email);
                               const status = contact?.verificationStatus || 'UNKNOWN';
                               const provider = contact?.mxProvider || '';

                               return (
                                   <div key={idx} className="flex items-center gap-1.5 justify-end group/email">
                                       {/* Verification Dot */}
                                       <div 
                                            className={`rounded-full w-1.5 h-1.5 ${
                                                status === 'VALID' ? 'bg-emerald-500' : 
                                                status === 'INVALID' ? 'bg-red-500' : 
                                                'bg-zinc-700'
                                            }`}
                                            title={`${status === 'VALID' ? `MX Verified (${provider})` : status === 'INVALID' ? 'Domain Unreachable' : 'Verification Pending'}`}
                                        />

                                       <span className={`font-mono text-xs select-all ${idx === 0 ? 'text-amber-500 font-medium' : 'text-zinc-400'}`}>
                                            {email}
                                       </span>
                                   </div>
                               );
                           })}
                           {lead.emails.length > 3 && (
                               <span className="text-[10px] font-mono text-zinc-600">
                                   +{lead.emails.length - 3} more
                               </span>
                           )}
                      </div>
                  ) : (
                    <span className="text-zinc-800 font-mono">-</span>
                  )}
                </TableCell>

                {/* Actions */}
                <TableCell className="py-3">
                   <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <DeleteLeadButton id={lead.id} />
                   </div>
                </TableCell>
              </TableRow>
            ))}
            {leads.length === 0 && (
                <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-32 text-center text-zinc-600 font-mono text-sm">
                        [No data available]
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
