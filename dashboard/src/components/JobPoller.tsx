"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface JobUpdate {
  id: string;
  status: string;
  resultsFound: number;
  query: string;
}

function buildSnapshot(jobs: JobUpdate[]): string {
  return jobs
    .map((j) => `${j.id}:${j.status}|${j.resultsFound}`)
    .sort()
    .join(",");
}

export function JobPoller({ hasActiveJobs }: { hasActiveJobs: boolean }) {
  const router = useRouter();
  const prevSnapshotRef = useRef<string>("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          jobs?: JobUpdate[];
        };
        if (data.type !== "jobs" || !data.jobs) return;

        const newSnapshot = buildSnapshot(data.jobs);
        const prev = prevSnapshotRef.current;

        if (prev !== "" && newSnapshot !== prev) {
          router.refresh();
        }

        prevSnapshotRef.current = newSnapshot;
      } catch {
        // Malformed SSE data, ignore
      }
    },
    [router]
  );

  useEffect(() => {
    if (!hasActiveJobs) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      prevSnapshotRef.current = "";
      return;
    }

    const es = new EventSource("/api/jobs/stream");
    eventSourceRef.current = es;
    es.onmessage = handleMessage;

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [hasActiveJobs, handleMessage]);

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
