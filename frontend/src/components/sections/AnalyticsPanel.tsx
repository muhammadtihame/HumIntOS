import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Network, Fingerprint, ActivitySquare } from 'lucide-react';
import { useCognitive } from '../../context/CognitiveContext';
import { cn } from '../../lib/utils';

export const AnalyticsPanel = () => {
  const { logs, data, systemState } = useCognitive();

  return (
    <motion.div 
      layout
      className="glass-panel rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#b464ff]/10 rounded-full blur-3xl" />
      
      <div className="flex items-center justify-between border-b border-white/5 pb-4 relative z-10">
        <h2 className="text-xl font-medium tracking-tight flex items-center gap-2">
          <Network className="w-5 h-5 text-[#b464ff]" />
          Behavioral Log
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-2 relative z-10">
         <div className="bg-black/30 p-2 rounded-lg border border-white/5">
            <span className="text-white/40 block mb-1">Consistency</span>
            <span className={cn(
              "text-sm",
              data.behavioralConsistency > 80 ? "text-[#00f0ff]" : "text-[#ff9632]"
            )}>{data.behavioralConsistency.toFixed(1)}%</span>
         </div>
         <div className="bg-black/30 p-2 rounded-lg border border-white/5">
            <span className="text-white/40 block mb-1">Fatigue</span>
            <span className={cn(
              "text-sm",
              data.cognitiveFatigue > 60 ? "text-[#ff3264]" : "text-[#00f0ff]"
            )}>{data.cognitiveFatigue.toFixed(1)}%</span>
         </div>
      </div>

      <div className="flex-1 flex flex-col gap-2 relative z-10">
        <AnimatePresence>
          {logs.map((log, i) => (
            <motion.div 
              key={i + log}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex gap-3 text-xs p-2 rounded-lg bg-black/20 border border-white/5 items-start"
            >
              <ActivitySquare className={cn(
                "w-3 h-3 mt-0.5 shrink-0",
                log.includes("CRITICAL") ? "text-[#ff3264]" : 
                log.includes("WARNING") ? "text-[#ff9632]" : "text-[#00f0ff]"
              )} />
              <span className={cn(
                "leading-snug",
                log.includes("CRITICAL") ? "text-[#ff3264]" : 
                log.includes("WARNING") ? "text-[#ff9632]" : "text-white/60"
              )}>
                {log}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Cyber overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0a0a0c] to-transparent pointer-events-none" />
    </motion.div>
  );
};
