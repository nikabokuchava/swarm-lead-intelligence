import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

/**
 * Server component: fetches credit balance and renders a styled badge.
 */
export async function CreditsBadge() {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { credits: true },
  });

  const credits = user?.credits ?? 0;
  const isLow = credits <= 10;
  const isEmpty = credits <= 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-mono border ${
        isEmpty
          ? "border-red-800 bg-red-950/40 text-red-400"
          : isLow
          ? "border-amber-800 bg-amber-950/40 text-amber-400"
          : "border-zinc-700 bg-zinc-900/50 text-zinc-300"
      }`}
    >
      <span className="text-base leading-none">🪙</span>
      <div className="flex flex-col">
        <span className="font-semibold">
          {credits.toLocaleString()} Credits
        </span>
        {isEmpty && (
          <span className="text-[10px] text-red-500 mt-0.5">No credits left</span>
        )}
        {isLow && !isEmpty && (
          <span className="text-[10px] text-amber-500 mt-0.5">Running low</span>
        )}
      </div>
    </div>
  );
}
