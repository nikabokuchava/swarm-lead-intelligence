import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Briefcase, Mail, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [totalLeads, activeJobs, recentLeads, allLeads] = await Promise.all([
    prisma.company.count(),
    prisma.scrapeJob.count({
        where: {
            status: {
                in: ['PENDING', 'PROCESSING', 'running'] // comprehensive check
            }
        }
    }),
    prisma.company.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.company.findMany({
        select: { emails: true }
    })
  ]);

  const totalEmails = allLeads.reduce((acc, lead) => acc + (lead.emails?.length || 0), 0);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
        <Button asChild>
            <Link href="/dashboard/jobs">
                Start New Scrape <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">Captured companies</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeJobs}</div>
            <p className="text-xs text-muted-foreground">Running or pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Found</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmails}</div>
            <p className="text-xs text-muted-foreground">Total verified emails</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Recent Activity</h2>
        <div className="rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Emails</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {recentLeads.map((lead) => (
                        <TableRow key={lead.id}>
                            <TableCell className="font-medium">{lead.name}</TableCell>
                            <TableCell>
                                <a href={lead.website || '#'} target="_blank" className="text-blue-500 hover:underline">
                                    {lead.website || '-'}
                                </a>
                            </TableCell>
                            <TableCell>
                                <Badge variant={
                                    lead.status === 'COMPLETED' ? 'default' :
                                    lead.status === 'FAILED' ? 'destructive' : 'secondary'
                                }>
                                    {lead.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">{lead.emails?.length || 0}</TableCell>
                        </TableRow>
                    ))}
                    {recentLeads.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
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
