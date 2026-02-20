import { Map, CheckCircle, Download, MessageSquare } from "lucide-react";

export function BentoGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto p-4">
      {/* Card 1: Large (Global Coverage) */}
      <div className="row-span-2 md:col-span-1 border border-zinc-800 bg-zinc-900/50 p-6 rounded-xl hover:border-zinc-600 transition-colors group relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:16px_16px] opacity-5"></div>
        <div className="h-full flex flex-col relative z-10">
          <div className="flex-1">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Map className="w-6 h-6 text-amber-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100 mb-2">Global Coverage</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
                Extract leads from any location on Google Maps. From New York to Tokyo, we support every country and city worldwide.
            </p>
          </div>
          <div className="mt-6 pt-6 border-t border-zinc-800/50">
             <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Server Status: Online
             </div>
          </div>
        </div>
      </div>

      {/* Card 2: Small (Verified Emails) */}
      <div className="border border-zinc-800 bg-zinc-900/50 p-6 rounded-xl hover:border-zinc-600 transition-colors group">
        <CheckCircle className="w-8 h-8 text-amber-500 mb-4 group-hover:rotate-12 transition-transform" />
        <h3 className="text-xl font-semibold text-zinc-100 mb-2">Verified Emails</h3>
        <p className="text-zinc-400">AI-powered checks to ensure high deliverability.</p>
      </div>

      {/* Card 3: Small (Export CSV) */}
      <div className="border border-zinc-800 bg-zinc-900/50 p-6 rounded-xl hover:border-zinc-600 transition-colors group">
        <Download className="w-8 h-8 text-amber-500 mb-4 group-hover:translate-y-1 transition-transform" />
        <h3 className="text-xl font-semibold text-zinc-100 mb-2">Instant Export</h3>
        <p className="text-zinc-400">Download data to CSV/Excel in one click.</p>
      </div>

      {/* Card 4: Wide (AI Powered) */}
      <div className="md:col-span-2 border border-zinc-800 bg-zinc-900/50 p-6 rounded-xl hover:border-zinc-600 transition-colors flex items-center justify-between group">
        <div className="max-w-md">
            <h3 className="text-xl font-semibold text-zinc-100 mb-2 flex items-center gap-2">
                AI Powered Extraction <MessageSquare className="w-5 h-5 text-amber-500" />
            </h3>
            <p className="text-zinc-400">Our swarm agents navigate websites to find direct contact info logic others miss.</p>
        </div>
        <div className="hidden md:block">
            <span className="text-6xl font-black text-zinc-800/50 select-none group-hover:text-amber-500/10 transition-colors">AI</span>
        </div>
      </div>
    </div>
  );
}
