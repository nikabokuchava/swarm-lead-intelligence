import { Badge } from "@/components/ui/badge";
import { cancelScrapeJob } from "@/app/actions";
import { CancelButton } from "@/components/jobs/CancelButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader, CheckCircle, XCircle, Clock } from "lucide-react";

interface ScrapeJob {
  id: string;
  query: string;
  status: string;
  resultsFound: number;
  createdAt: Date;
}

interface JobsTableProps {
  jobs: ScrapeJob[];
}

export function JobsTable({ jobs }: JobsTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Query</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Results</TableHead>
            <TableHead className="text-right">Created</TableHead>
            <TableHead className="text-right w-[100px]">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                No jobs found.
              </TableCell>
            </TableRow>
          ) : (
            jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">{job.query}</TableCell>
                <TableCell>
                  <StatusBadge status={job.status} />
                </TableCell>
                <TableCell>{job.resultsFound}</TableCell>
                <TableCell className="text-right">
                  {job.createdAt.toLocaleDateString()} {job.createdAt.toLocaleTimeString()}
                </TableCell>
                <TableCell className="text-right">
                  {(job.status === 'PENDING' || job.status === 'PROCESSING') && (
                    <form action={cancelScrapeJob.bind(null, job.id)}>
                      <CancelButton />
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  
  if (s === 'COMPLETED') {
    return <Badge variant="default" className="bg-green-600 hover:bg-green-700"><CheckCircle className="mr-1 h-3 w-3" /> Completed</Badge>;
  }
  
  if (s === 'FAILED') {
    return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge>;
  }
  
  if (s === 'PROCESSING') {
     return <Badge variant="secondary" className="animate-pulse"><Loader className="mr-1 h-3 w-3 animate-spin" /> Processing</Badge>;
  }

  return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>;
}
