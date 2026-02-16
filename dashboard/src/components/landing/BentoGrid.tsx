import { Map, CheckCircle, Download, MessageSquare } from "lucide-react";

export function BentoGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto p-4">
      {/* Card 1: Large (Global Coverage) */}
      <div className="row-span-2 md:col-span-1 border border-zinc-800 bg-zinc-900/50 p-6 rounded-xl hover:border-zinc-600 transition-colors group">
        <div className="h-full flex flex-col justify-between">
          <div>
            <Map className="w-8 h-8 text-amber-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold text-zinc-100 mb-2">Global Coverage</h3>
            <p className="text-zinc-400">Extract leads from any location on Google Maps. Precision targeting worldwide.</p>
          </div>
          <div className="mt-8 h-32 rounded-lg bg-zinc-950/50 border border-zinc-800/50 relative overflow-hidden">
             {/* Abstract Map Viz */}
             <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:16px_16px]"></div>
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
