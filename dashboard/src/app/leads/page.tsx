import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { DeleteLeadButton } from '@/components/DeleteLeadButton';
import Link from 'next/link';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const leads = await prisma.company.findMany({
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
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Leads Overview</h1>
        <Button asChild variant="outline">
          <Link href="/api/leads/export">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{processedLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{emailsFound}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead className="text-right">Emails</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell>
                  <a href={lead.website || '#'} target="_blank" className="text-blue-500 hover:underline">
                    {lead.website}
                  </a>
                </TableCell>
                <TableCell>
                  <Badge variant={
                    lead.status === 'COMPLETED' ? 'default' : 
                    lead.status === 'FAILED' ? 'destructive' : 
                    lead.status === 'PROCESSING' ? 'secondary' : 'outline'
                  }>
                    {lead.status}
                  </Badge>
                </TableCell>
                <TableCell>{lead._count.contacts}</TableCell>
                <TableCell className="text-right">
                  {lead.emails.length > 0 ? lead.emails.join(', ') : '-'}
                </TableCell>
                <TableCell>
                  <DeleteLeadButton id={lead.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
