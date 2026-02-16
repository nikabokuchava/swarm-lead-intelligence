"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Users, Briefcase, LogOut, History, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ScrapeJob {
  id: string;
  query: string;
  createdAt: Date;
  status: string;
  resultsFound: number;
}

interface SidebarClientProps {
  recentJobs: ScrapeJob[];
}

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/dashboard/leads", icon: Users },
  { name: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
];

export function SidebarClient({ recentJobs }: SidebarClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentJobId = searchParams.get('jobId');

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card text-card-foreground">
      <div className="flex h-14 items-center border-b px-6">
        <span className="text-lg font-bold">Lead Scraper</span>
      </div>
      
      {/* Main Navigation */}
      <nav className="flex-none space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href && !currentJobId;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Scrape History */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="mb-2 flex items-center px-2 text-xs font-semibold text-muted-foreground">
          <History className="mr-2 h-3 w-3" />
          Recent Scrapes
        </div>
        <div className="space-y-1">
          {recentJobs.map((job) => {
            const isActive = currentJobId === job.id;
            return (
              <Link
                key={job.id}
                href={`/leads?jobId=${job.id}`}
                className={cn(
                  "flex flex-col gap-1 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{job.query}</span>
                  <span className="text-[10px] opacity-70">
                    {job.resultsFound}
                  </span>
                </div>
                <span className="text-[10px] opacity-50">
                  {new Date(job.createdAt).toLocaleDateString()}
                </span>
              </Link>
            );
          })}
          
          {recentJobs.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No recent jobs found
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-4 mt-auto">
        <div className="flex items-center justify-between">
            <div className="flex flex-col">
                <span className="text-sm font-medium">Admin</span>
                <span className="text-xs text-muted-foreground">admin@example.com</span>
            </div>
            <Button variant="ghost" size="icon" title="Logout">
                <LogOut className="h-4 w-4" />
            </Button>
        </div>
      </div>
    </div>
  );
}
