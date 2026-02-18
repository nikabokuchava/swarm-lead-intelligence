import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Briefcase, Mail, Users, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { JobPoller } from "@/components/JobPoller";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { userId } = await auth();
  const userFilter = userId ? { userId } : {};

  const [totalLeads, activeJobs, recentLeads, allLeads] = await Promise.all([
    prisma.company.count({ where: userFilter }),
    prisma.scrapeJob.count({
        where: {
            ...userFilter,
            status: {
                in: ['PENDING', 'PROCESSING', 'running', 'RUNNING']
            }
        }
    }),
    prisma.company.findMany({
      where: userFilter,
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.company.findMany({
        where: userFilter,
        select: { emails: true }
    })
  ]);

  const totalEmails = allLeads.reduce((acc, lead) => acc + (lead.emails?.length || 0), 0);

  return (
    <div className="p-8 space-y-8 font-sans">
      <JobPoller hasActiveJobs={activeJobs > 0} />
      
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Dashboard Overview</h1>
        <Button asChild className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
            <Link href="/dashboard/jobs">
                Start New Scrape <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 font-mono uppercase">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{totalLeads}</div>
            <p className="text-xs text-zinc-500">Captured companies</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 font-mono uppercase">Active Jobs</CardTitle>
            <Briefcase className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{activeJobs}</div>
            <p className="text-xs text-zinc-500">Running or pending</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 font-mono uppercase">Emails Found</CardTitle>
            <Mail className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{totalEmails}</div>
            <p className="text-xs text-zinc-500">Total verified emails</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Recent Activity</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur overflow-hidden">
            <Table>
                <TableHeader className="bg-zinc-950/30">
                    <TableRow className="border-zinc-800/50 hover:bg-transparent">
                        <TableHead className="font-mono uppercase text-[10px] text-zinc-500">Company</TableHead>
                        <TableHead className="font-mono uppercase text-[10px] text-zinc-500">Website</TableHead>
                        <TableHead className="font-mono uppercase text-[10px] text-zinc-500">Status</TableHead>
                        <TableHead className="font-mono uppercase text-[10px] text-zinc-500 text-right">Emails</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {recentLeads.map((lead) => (
                        <TableRow key={lead.id} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                            <TableCell className="font-medium text-zinc-200">{lead.name}</TableCell>
                            <TableCell>
                                <a href={lead.website || '#'} target="_blank" className="text-zinc-500 hover:text-amber-500 transition-colors hover:underline text-sm">
                                    {lead.website || '-'}
                                </a>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className={`border-0 flex w-fit items-center gap-1.5 ${
                                    lead.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500' :
                                    lead.status === 'FAILED' ? 'bg-red-500/10 text-red-500' : 
                                    'bg-amber-500/10 text-amber-500'
                                }`}>
                                    {['PENDING', 'PROCESSING', 'RUNNING'].includes(lead.status) && (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    )}
                                    {lead.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right text-zinc-400">{lead.emails?.length || 0}</TableCell>
                        </TableRow>
                    ))}
                    {recentLeads.length === 0 && (
                        <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={4} className="text-center text-zinc-500 h-24">
                                No recent activity found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
      </div>
    </div>
  );
}
