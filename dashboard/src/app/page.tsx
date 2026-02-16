import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MockTerminal } from "@/components/MockTerminal";
import { BentoGrid } from "@/components/landing/BentoGrid";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500/30">
      
      {/* Navigation (Simple) */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="font-bold text-xl tracking-tighter">Swarm<span className="text-amber-500">.io</span></div>
        <div className="flex gap-4">
            <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Login
            </Link>
            <Link href="/dashboard" className="text-sm font-medium bg-white text-black px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors">
                Get Started
            </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center pt-20 pb-32 px-4 text-center max-w-4xl mx-auto space-y-8">
        
        {/* Badge */}
        <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-sm text-zinc-400 backdrop-blur-xl">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
            v2.0 Now Available
        </div>

        {/* H1 */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white">
          Stop Buying <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">Stale Leads.</span>
        </h1>

        {/* Subtext */}
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl">
          Real-time extraction from Google Maps with AI validation. 
          Get verified emails, phone numbers, and decision maker data in seconds.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Link href="/dashboard" className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)]">
                Start Scraping <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            <button className="inline-flex items-center justify-center h-12 px-8 rounded-full border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 transition-colors text-zinc-300">
                View Demo
            </button>
        </div>

        {/* Mock Terminal Visual */}
        <div className="pt-12 w-full flex justify-center perspective-[2000px]">
            <div className="transform rotateX-12 scale-95 hover:rotate-x-0 hover:scale-100 transition-transform duration-700 ease-out">
                <MockTerminal />
            </div>
        </div>

      </section>

      {/* Bento Grid Section */}
      <section className="py-24 bg-zinc-950/50 relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="relative z-10">
            <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Everything you need to scale</h2>
                <p className="text-zinc-400 max-w-xl mx-auto">Built for agencies, sales teams, and growth marketers.</p>
            </div>
            <BentoGrid />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-12 text-center text-zinc-600 text-sm">
        <p>© 2026 Swarm Lead Scraper. All rights reserved.</p>
      </footer>

    </div>
  );
}
