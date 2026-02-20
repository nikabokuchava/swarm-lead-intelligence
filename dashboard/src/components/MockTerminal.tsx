"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const commands = [
  "> initializing swarm protocols...",
  "> connecting to google maps satellite...",
  "> target identified: san francisco, ca",
  "> extracting contacts... [████████░░] 80%",
  "> verified: 142 emails found",
  "> data export ready.",
];

export function MockTerminal() {
  const [lines, setLines] = useState<string[]>([]);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let currentIndex = 0;

    const typeCommand = () => {
      if (currentIndex < commands.length) {
        setLines((prev) => [...prev, commands[currentIndex]]);
        currentIndex++;
        // Normal typing speed
        timeoutId = setTimeout(typeCommand, 800);
      } else {
        // Pause at end before restarting
        timeoutId = setTimeout(() => {
          setLines([]);
          currentIndex = 0;
          typeCommand();
        }, 3000);
      }
    };

    // Start the loop
    typeCommand();

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 font-mono text-sm shadow-2xl backdrop-blur-sm">
      <div className="mb-2 flex gap-2">
        <div className="h-3 w-3 rounded-full bg-red-500/20"></div>
        <div className="h-3 w-3 rounded-full bg-yellow-500/20"></div>
        <div className="h-3 w-3 rounded-full bg-green-500/20"></div>
      </div>
      <div className="space-y-1 text-zinc-400">
        {lines.map((line, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <span className="text-amber-500">$</span>
            <span>{line}</span>
          </motion.div>
        ))}
        <motion.div 
            animate={{ opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="h-4 w-2 bg-amber-500"
        />
      </div>
    </div>
  );
}
