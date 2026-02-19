import { auth } from '@clerk/nextjs/server';
import { getCredits } from '@/lib/user';
import { PricingSection } from '@/components/PricingSection';
import { Coins } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CreditsPage() {
  const { userId } = await auth();
  const credits = userId ? await getCredits(userId) : 0;

  return (
    <div className="p-8 space-y-10 font-sans">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-4 py-1.5 text-sm text-zinc-400 mb-4">
          <Coins className="h-4 w-4 text-amber-500" />
          <span className="font-mono">
            Current Balance: <span className="font-bold text-zinc-100">{credits.toLocaleString()}</span> credits
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
          Buy Credits
        </h1>
        <p className="text-zinc-500 max-w-md mx-auto">
          Purchase credits to power your lead scraping. Each scrape job consumes credits based on the number of results.
        </p>
      </div>

      <PricingSection />
    </div>
  );
}
