import React from 'react';
import { motion } from 'motion/react';
import { BrainCircuit, Activity } from 'lucide-react';
import { useCognitive } from '../../context/CognitiveContext';
import { cn } from '../../lib/utils';

export const HeroSection = () => {
  const { systemState } = useCognitive();

  return (
    <motion.section 
      className="relative w-full rounded-3xl overflow-hidden glass-panel border-white/5 p-6 md:p-12 mb-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent z-10" />
        <motion.div 
          className="absolute right-0 top-0 w-full h-full opacity-30"
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{
            backgroundImage: `radial-gradient(circle at center, rgba(0, 240, 255, 0.1) 0%, transparent 50%),
                              radial-gradient(circle at 80% 20%, rgba(180, 100, 255, 0.15) 0%, transparent 40%)`,
            backgroundSize: '200% 200%'
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex-1 space-y-4">
          <motion.div 
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="relative">
              <BrainCircuit className={cn(
                "w-10 h-10 transition-colors duration-700",
                systemState === 'STRESS' ? "text-[#ff3264]" :
                systemState === 'FOCUS' ? "text-[#00f0ff]" :
                "text-[#b464ff]"
              )} />
              <motion.div 
                className={cn(
                  "absolute inset-0 rounded-full blur-md opacity-50",
                  systemState === 'STRESS' ? "bg-[#ff3264]" :
                  systemState === 'FOCUS' ? "bg-[#00f0ff]" :
                  "bg-[#b464ff]"
                )}
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              HumInt<span className={cn(
                "transition-colors duration-500",
                systemState === 'STRESS' ? "text-[#ff3264]" :
                systemState === 'FOCUS' ? "text-[#00f0ff]" :
                "text-[#00f0ff]"
              )}>OS</span>
            </h1>
          </motion.div>
          
          <motion.p 
            className="text-lg md:text-xl text-white/50 font-light max-w-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            The Operating System That Understands Humans.
            <br />
            <span className="text-sm uppercase tracking-widest text-[#00f0ff]/70 mt-2 block font-mono">
              Adaptive Cognitive Processing Active
            </span>
          </motion.p>
        </div>

        <motion.div 
          className="flex items-center gap-4 px-6 py-3 rounded-full border border-white/10 bg-black/40 backdrop-blur-md"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Activity className={cn(
            "w-5 h-5",
            systemState === 'OVERLOAD' ? "text-[#ff3264]" : "text-[#00f0ff]"
          )} />
          <div className="flex flex-col">
            <span className="text-xs uppercase text-white/40 font-mono">System Sync</span>
            <span className="text-sm font-medium">Realtime Active</span>
          </div>
          <div className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse ml-2" />
        </motion.div>
      </div>
    </motion.section>
  );
};
