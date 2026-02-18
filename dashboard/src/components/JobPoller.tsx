"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function JobPoller({ hasActiveJobs }: { hasActiveJobs: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 3000);

    return () => clearInterval(interval);
  }, [hasActiveJobs, router]);

  if (!hasActiveJobs) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-2 rounded-full text-xs font-mono flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-bottom-5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
      </span>
      Live Updating...
    </div>
  );
}
