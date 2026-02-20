"use client";

import Link from "next/link";
import { ArrowRight, Check, Sparkles, Zap, TrendingUp, Building2, Gift, Search, Database, Download, Star, ChevronDown, Map, ShieldCheck, Clock } from "lucide-react";
import { MockTerminal } from "@/components/MockTerminal";
import { BentoGrid } from "@/components/landing/BentoGrid";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const pricingPlans = [
  {
    name: "Starter",
    credits: "1,000",
    price: 19,
    icon: Zap,
    features: ["1,000 scrape credits", "Email extraction", "CSV export", "Standard support"],
    popular: false,
    costPerLead: "$0.019",
  },
  {
    name: "Growth",
    credits: "5,000",
    price: 49,
    icon: TrendingUp,
    features: ["5,000 scrape credits", "Email extraction", "CSV export", "Priority support", "Best value per credit"],
    popular: true,
    subtext: "Most Popular",
    costPerLead: "$0.0098",
  },
  {
    name: "Agency",
    credits: "15,000",
    price: 99,
    icon: Building2,
    features: ["15,000 scrape credits", "Email extraction", "CSV export", "Priority support", "Bulk operations", "Lowest cost per credit"],
    popular: false,
    costPerLead: "$0.0066",
  },
];

const testimonials = [
  {
    quote: "Generated 200 leads in 10 minutes for our agency. Paid for itself immediately.",
    author: "Sarah J.",
    role: "Agency Founder",
    avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=Sarah"
  },
  {
    quote: "The Google Maps extraction is significantly more accurate than other tools we've used.",
    author: "Michael R.",
    role: "Sales Director",
    avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=Michael"
  },
  {
    quote: "Finally a tool that doesn't require a monthly subscription. Love the credit system.",
    author: "David K.",
    role: "Freelancer",
    avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=David"
  }
];

const faqs = [
  {
    question: "Is it legal to scrape Google Maps?",
    answer: "Yes. Our system extracts only publicly available business contact information (Name, Address, Phone, Website) that businesses intentionally publish. We automate what a human would do manually, respecting rate limits and privacy policies."
  },
  {
    question: "How are credits consumed?",
    answer: "You only pay for results. 1 credit = 1 valid lead with extracted data. If we find a business but can't verify their details or they are outside your criteria, you don't pay."
  },
  {
    question: "Do my credits expire?",
    answer: "No. Your purchased credits remain in your account forever. Access them whenever you need to run a campaign, unlike monthly subscriptions where unused credits disappear."
  },
  {
    question: "Can I export the data?",
    answer: "Absolutely. All extracted data can be instantly exported to CSV or Excel, ready to import into your CRM or cold email software."
  }
];

const stats = [
  { label: "Leads Extracted", value: "10M+" },
  { label: "Email Accuracy", value: "95%" },
  { label: "Avg. Search Time", value: "< 60s" },
];

function FAQItem({ question, answer }: { question: string, answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-zinc-800">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-4 text-left font-medium text-zinc-200 hover:text-amber-500 transition-colors"
      >
        {question}
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-sm text-zinc-400 leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500/30">
      
      {/* Navigation */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md">
        <div className="font-bold text-xl tracking-tighter flex items-center gap-2">
            Swarm<span className="text-amber-500">.io</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm font-medium text-zinc-400">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-white transition-colors">How It Works</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
        </div>
        <div className="flex gap-4">
            <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors self-center">
                Login
            </Link>
            <Link href="/dashboard" className="text-sm font-medium bg-white text-black px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors">
                Get Started
            </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center pt-24 pb-16 px-4 text-center max-w-4xl mx-auto space-y-8">
        
        {/* Version Badge */}
        <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-sm text-zinc-400 backdrop-blur-xl animate-fade-in-up">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
            v2.0 Now Available
        </div>

        {/* H1 */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-[1.1]">
          Stop Buying <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">Stale Leads.</span>
        </h1>

        {/* Subtext */}
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Pull 500 verified leads from any city in under 60 seconds — without touching a spreadsheet.
        </p>

        {/* Free Credits Badge */}
        <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-5 py-3 backdrop-blur-xl">
          <Gift className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <span className="text-sm md:text-base text-zinc-200">
            🎁 Sign up today and get <span className="font-bold text-amber-400">100 FREE credits</span> to test the Swarm. No credit card required.
          </span>
        </div>

        {/* CTA */}
        <div className="pt-4 flex flex-col items-center">
            <Link href="/dashboard" className="inline-flex items-center justify-center h-14 px-8 rounded-full bg-amber-500 text-black font-bold text-lg hover:bg-amber-400 transition-all shadow-[0_0_40px_-10px_rgba(245,158,11,0.4)] hover:shadow-[0_0_60px_-10px_rgba(245,158,11,0.6)] hover:-translate-y-0.5">
                Start Scraping for Free <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <p className="mt-4 text-xs text-zinc-500 font-mono">
                No credit card required. 100 free credits included.
            </p>
        </div>

        {/* Mock Terminal Visual */}
        <div className="pt-16 w-full flex justify-center perspective-[2000px]">
            <div className="transform rotateX-12 scale-95 hover:rotate-x-0 hover:scale-100 transition-transform duration-700 ease-out shadow-2xl shadow-amber-500/10 rounded-xl max-w-3xl">
                <MockTerminal />
            </div>
        </div>

      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-zinc-900 bg-zinc-900/20">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-zinc-800/50">
            {stats.map((stat) => (
                <div key={stat.label} className="py-4 md:py-0">
                    <div className="text-4xl font-bold text-white mb-1">{stat.value}</div>
                    <div className="text-sm text-zinc-500 font-medium uppercase tracking-wider">{stat.label}</div>
                </div>
            ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-zinc-950/30 scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-white mb-4">How Swarm Works</h2>
                <p className="text-zinc-400">Three steps to your next 500 leads.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-12 relative">
                {/* Connector Line */}
                <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-zinc-800 via-amber-900/50 to-zinc-800 z-0"></div>

                {/* Step 1 */}
                <div className="relative z-10 flex flex-col items-center text-center group">
                    <div className="w-24 h-24 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6 shadow-xl group-hover:border-amber-500/50 transition-colors">
                        <Search className="w-10 h-10 text-amber-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">1. Search</h3>
                    <p className="text-zinc-400 text-sm">Enter a niche and location. <br/>Ex: "Dentists in New York"</p>
                </div>

                {/* Step 2 */}
                <div className="relative z-10 flex flex-col items-center text-center group">
                    <div className="w-24 h-24 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6 shadow-xl group-hover:border-amber-500/50 transition-colors">
                        <Database className="w-10 h-10 text-amber-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">2. Extract</h3>
                    <p className="text-zinc-400 text-sm">Swarm agents crawl maps & websites to find hidden contacts.</p>
                </div>

                {/* Step 3 */}
                <div className="relative z-10 flex flex-col items-center text-center group">
                    <div className="w-24 h-24 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6 shadow-xl group-hover:border-amber-500/50 transition-colors">
                        <Download className="w-10 h-10 text-amber-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">3. Export</h3>
                    <p className="text-zinc-400 text-sm">Download verified emails & phones to CSV in one click.</p>
                </div>
            </div>
        </div>
      </section>

      {/* Features / Bento Grid Section */}
      <section id="features" className="py-24 bg-zinc-950/50 relative scroll-mt-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="relative z-10">
            <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Everything you need to scale</h2>
                <p className="text-zinc-400 max-w-xl mx-auto">Built for agencies, sales teams, and growth marketers.</p>
            </div>
            <BentoGrid />
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 border-t border-zinc-900">
        <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center text-white mb-16">Trusted by Growth Teams</h2>
            <div className="grid md:grid-cols-3 gap-6">
                {testimonials.map((t, i) => (
                    <div key={i} className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-2xl hover:border-zinc-700 transition-colors">
                        <div className="flex gap-1 mb-4">
                            {[1,2,3,4,5].map((s) => <Star key={s} className="w-4 h-4 text-amber-500 fill-amber-500" />)}
                        </div>
                        <p className="text-zinc-300 mb-6 leading-relaxed">"{t.quote}"</p>
                        <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <img src={t.avatar} alt={t.author} className="w-10 h-10 rounded-full bg-zinc-800" />
                            <div>
                                <div className="font-semibold text-white text-sm">{t.author}</div>
                                <div className="text-xs text-zinc-500">{t.role}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 relative overflow-hidden scroll-mt-20">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900/20 to-zinc-950 pointer-events-none"></div>
        <div className="relative z-10 max-w-5xl mx-auto px-4">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-sm text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 mr-2" />
              Simple Pricing
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Credits that <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">scale with you</span>
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              Start free with 100 credits. Need more? Pick a plan and get scraping in seconds. <br/>
              <span className="text-zinc-500 text-sm font-semibold">One-time payment. No monthly subscription.</span>
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {pricingPlans.map((plan) => {
              const Icon = plan.icon;
              return (
                <div
                  key={plan.name}
                  className={`
                    relative flex flex-col rounded-2xl border p-6 transition-all duration-300
                    ${plan.popular
                      ? "border-amber-500/50 bg-amber-500/[0.03] shadow-[0_0_30px_-5px_rgba(245,158,11,0.15)] scale-105 z-10"
                      : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                    }
                  `}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-black w-max shadow-lg">
                        <Sparkles className="h-3 w-3" />
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="mb-4 flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${plan.popular ? "bg-amber-500/10" : "bg-zinc-800/50"}`}>
                      <Icon className={`h-5 w-5 ${plan.popular ? "text-amber-500" : "text-zinc-400"}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-100">{plan.name}</h3>
                  </div>

                  <div className="mb-1 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight text-zinc-100">${plan.price}</span>
                    <span className="text-sm text-zinc-500">one-time</span>
                  </div>

                  <div className="mb-6">
                     <p className="text-sm text-zinc-300 font-mono font-medium">
                        {plan.credits} credits
                     </p>
                     <p className="text-xs text-zinc-500 mt-1">
                        ≈ {plan.costPerLead} / lead
                     </p>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-zinc-400">
                        <Check className={`h-4 w-4 flex-shrink-0 ${plan.popular ? "text-amber-500" : "text-zinc-600"}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/dashboard"
                    className={`
                      flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3
                      text-sm font-semibold transition-all duration-200
                      ${plan.popular
                        ? "bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/20"
                        : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700"
                      }
                    `}
                  >
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 border-t border-zinc-900 bg-zinc-950/30">
        <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center text-white mb-12">Frequently Asked Questions</h2>
            <div className="space-y-4">
                {faqs.map((faq, i) => (
                    <FAQItem key={i} question={faq.question} answer={faq.answer} />
                ))}
            </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-12">
         <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6 opacity-60 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-200">Swarm.io</span>
                <span className="text-sm text-zinc-600">© 2026</span>
            </div>
            <div className="flex gap-6 text-sm text-zinc-500">
                <Link href="#" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
                <Link href="#" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
                <a href="mailto:support@swarm.io" className="hover:text-zinc-300 transition-colors">Contact Support</a>
            </div>
         </div>
      </footer>

    </div>
  );
}
