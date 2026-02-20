'use client';

import { useState } from 'react';
import { Loader2, Zap, TrendingUp, Building2, Check, Sparkles } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    credits: 1_000,
    price: 19,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER!,
    icon: Zap,
    features: ['1,000 scrape credits', 'Email extraction', 'CSV export', 'Standard support'],
    popular: false,
  },
  {
    name: 'Growth',
    credits: 5_000,
    price: 49,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH!,
    icon: TrendingUp,
    features: ['5,000 scrape credits', 'Email extraction', 'CSV export', 'Priority support', 'Best value per credit'],
    popular: true,
  },
  {
    name: 'Agency',
    credits: 15_000,
    price: 99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_AGENCY!,
    icon: Building2,
    features: ['15,000 scrape credits', 'Email extraction', 'CSV export', 'Priority support', 'Bulk operations', 'Lowest cost per credit'],
    popular: false,
  },
];

export function PricingSection() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handlePurchase(priceId: string) {
    setLoadingPlan(priceId);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      window.location.href = data.url;
    } catch (error) {
      console.error('Checkout error:', error);
      setLoadingPlan(null);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
      {plans.map((plan) => {
        const isLoading = loadingPlan === plan.priceId;
        const Icon = plan.icon;

        return (
          <div
            key={plan.name}
            className={`
              relative flex flex-col rounded-2xl border p-6 transition-all duration-300
              ${plan.popular
                ? 'border-amber-500/50 bg-amber-500/[0.03] shadow-[0_0_30px_-5px_rgba(245,158,11,0.15)]'
                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
              }
            `}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  <Sparkles className="h-3 w-3" />
                  Popular
                </span>
              </div>
            )}

            <div className="mb-4 flex items-center gap-3">
              <div className={`rounded-lg p-2 ${plan.popular ? 'bg-amber-500/10' : 'bg-zinc-800/50'}`}>
                <Icon className={`h-5 w-5 ${plan.popular ? 'text-amber-500' : 'text-zinc-400'}`} />
              </div>
              <h3 className="text-lg font-semibold text-zinc-100">{plan.name}</h3>
            </div>

            <div className="mb-1 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-zinc-100">${plan.price}</span>
              <span className="text-sm text-zinc-500">one-time</span>
            </div>

            <p className="mb-6 text-sm text-zinc-500 font-mono">
              {plan.credits.toLocaleString()} credits
              <span className="ml-1 text-zinc-600">
                (${(plan.price / plan.credits * 1000).toFixed(1)}/1k)
              </span>
            </p>

            <ul className="mb-8 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-zinc-400">
                  <Check className={`h-4 w-4 flex-shrink-0 ${plan.popular ? 'text-amber-500' : 'text-zinc-600'}`} />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handlePurchase(plan.priceId)}
              disabled={isLoading || loadingPlan !== null}
              className={`
                flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3
                text-sm font-semibold transition-all duration-200 cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed
                ${plan.popular
                  ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700'
                }
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting…
                </>
              ) : (
                `Buy ${plan.credits.toLocaleString()} Credits`
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
