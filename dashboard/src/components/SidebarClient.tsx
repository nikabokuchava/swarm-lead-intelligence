"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Users, Briefcase, History, Home, Coins } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
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
  credits: number | null;
}

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/dashboard/leads", icon: Users },
  { name: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
  { name: "Credits", href: "/dashboard/credits", icon: Coins },
];

export function SidebarClient({ recentJobs, credits }: SidebarClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentJobId = searchParams.get('jobId');
  const hasNoCredits = credits !== null && credits <= 0;

  return (
    <div className="flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-400">
      <div className="flex h-14 items-center border-b border-zinc-800 px-6">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-white hover:text-amber-500 transition-colors">
          Swarm<span className="text-amber-500">.io</span>
        </Link>
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-amber-500/10 text-amber-500 border-l-2 border-amber-500"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50 border-l-2 border-transparent"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive ? "text-amber-500" : "text-zinc-500")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Scrape History */}
      <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
        <div className="mb-2 flex items-center px-2 text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wider">
          <History className="mr-2 h-3 w-3" />
          Recent Jobs
        </div>
        <div className="space-y-1">
          {recentJobs.map((job) => {
            const isActive = currentJobId === job.id;
            return (
              <Link
                key={job.id}
                href={`/dashboard/leads?jobId=${job.id}`}
                className={cn(
                  "flex flex-col gap-1 rounded-md px-3 py-2 text-xs font-mono transition-all duration-200 border-l-2",
                  isActive
                    ? "bg-zinc-900/80 text-amber-500 border-amber-500/50"
                    : "text-zinc-500 hover:bg-zinc-900/30 hover:text-zinc-300 border-transparent"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">
                    <span className="opacity-50 mr-1">&gt;</span>
                    {job.query}
                  </span>
                  <span className={cn("text-[10px]", job.resultsFound > 0 ? "text-emerald-500" : "text-zinc-700")}>
                    {job.resultsFound}
                  </span>
                </div>
                <span className="text-[10px] opacity-40 pl-2">
                  {new Date(job.createdAt).toLocaleDateString()}
                </span>
              </Link>
            );
          })}
          
          {recentJobs.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-zinc-600 font-mono">
              [No jobs found]
            </div>
          )}
        </div>
      </div>

      {/* Footer - Credits + User & Exit */}
      <div className="border-t border-zinc-800 p-4 mt-auto bg-zinc-950 space-y-3">
        {/* Credits Badge */}
        {credits === null ? (
          <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-mono border border-zinc-800 bg-zinc-900/30 text-zinc-600 animate-pulse">
            <span className="text-base leading-none">🪙</span>
            <span>Loading credits...</span>
          </div>
        ) : (
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-mono border ${
              credits <= 0
                ? 'border-red-800 bg-red-950/40 text-red-400'
                : credits <= 10
                ? 'border-amber-800 bg-amber-950/40 text-amber-400'
                : 'border-zinc-700 bg-zinc-900/50 text-zinc-300'
            }`}
          >
            <span className="text-base leading-none">🪙</span>
            <div className="flex flex-col">
              <span className="font-semibold">{credits.toLocaleString()} Credits</span>
              {credits <= 0 && <span className="text-[10px] text-red-500 mt-0.5">No credits left</span>}
              {credits > 0 && credits <= 10 && <span className="text-[10px] text-amber-500 mt-0.5">Running low</span>}
            </div>
          </div>
        )}

        {hasNoCredits && (
          <div className="rounded-md px-3 py-2 text-[10px] font-mono text-red-500 bg-red-950/20 border border-red-900/50">
            ⚠️ Out of credits — new jobs are disabled.
          </div>
        )}
        <div className="flex items-center gap-3">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8 border border-zinc-700",
                  userButtonPopoverCard: "bg-zinc-900 border-zinc-800",
                },
              }}
            />
            <span className="text-xs font-mono text-zinc-500">Account</span>
        </div>
        <Button asChild variant="outline" className="w-full justify-start text-xs font-mono border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-amber-500 h-8">
          <Link href="/">
             <Home className="mr-2 h-3 w-3" />
             Exit to Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
