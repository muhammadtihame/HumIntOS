import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Network, FileSearch, ArrowRightCircle } from 'lucide-react';
import { useCognitive } from '../../context/CognitiveContext';
import { cn } from '../../lib/utils';

export const DecisionEngine = () => {
  const { systemState, data, lastDecision, latencyMs } = useCognitive();

  const nodes = useMemo(() => ([
    { id: 1, active: data.stressLevel >= 60 || systemState === 'STRESS' || systemState === 'OVERLOAD' },
    { id: 2, active: data.focusLevel >= 75 || systemState === 'FOCUS' },
    { id: 3, active: data.cognitiveLoad >= 68 || systemState === 'OVERLOAD' },
    { id: 4, active: data.distractionProbability >= 45 || data.hesitationLevel >= 55 },
  ]), [data, systemState]);

  const getEngineStatus = () => {
    if (lastDecision?.reason) return lastDecision.reason;
    switch (systemState) {
      case 'STRESS': return 'Modulating Response Syntax';
      case 'OVERLOAD': return 'Activating Focus Protocol';
      case 'FOCUS': return 'Maintaining Cognitive Stream';
      default: return 'Idle Neural Parsing';
    }
  };

  return (
    <motion.div 
      layout
      className="glass-panel rounded-3xl p-6 relative overflow-hidden h-[180px]"
    >
      <div className="absolute top-4 left-6 z-20 flex items-center gap-2">
        <Network className="w-4 h-4 text-[#00f0ff]" />
        <span className="text-xs font-mono uppercase tracking-widest text-[#00f0ff]/50">AI Decision Core</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-4">
        <div className="flex items-center gap-4">
           {nodes.map((n, i) => (
             <React.Fragment key={n.id}>
                <motion.div
                  className={cn(
                    "w-12 h-12 rounded-full border border-white/20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-colors duration-500",
                    n.active && systemState === 'STRESS' ? "border-[#ff9632]/50 bg-[#ff9632]/20" :
                    n.active && systemState === 'OVERLOAD' ? "border-[#ff3264]/50 bg-[#ff3264]/20" :
                    n.active ? "border-[#00f0ff]/50 bg-[#00f0ff]/20" : ""
                  )}
                  animate={n.active ? {
                     scale: [1.1, 1.25, 1.1],
                     boxShadow: [
                       `0 0 20px ${systemState === 'STRESS' ? 'rgba(255,150,50,0.4)' : systemState === 'OVERLOAD' ? 'rgba(255,50,100,0.4)' : 'rgba(0,240,255,0.4)'}`,
                       `0 0 35px ${systemState === 'STRESS' ? 'rgba(255,150,50,0.8)' : systemState === 'OVERLOAD' ? 'rgba(255,50,100,0.8)' : 'rgba(0,240,255,0.8)'}`,
                       `0 0 20px ${systemState === 'STRESS' ? 'rgba(255,150,50,0.4)' : systemState === 'OVERLOAD' ? 'rgba(255,50,100,0.4)' : 'rgba(0,240,255,0.4)'}`
                     ]
                  } : {
                     scale: 1,
                     boxShadow: '0 0 0px rgba(0,0,0,0)'
                  }}
                  transition={{ 
                    duration: n.active ? 1.5 : 0.3, 
                    type: n.active ? "tween" : "spring", 
                    repeat: n.active ? Infinity : 0,
                    ease: "easeInOut"
                  }}
                >
                  <span className="text-[10px] text-white/50 font-mono">N-{n.id}</span>
                </motion.div>
                {i < nodes.length - 1 && (
                  <div className="relative w-8 h-px bg-white/10">
                    <motion.div 
                       className={cn(
                         "absolute top-0 bottom-0 left-0 w-full rounded-full opacity-50",
                         systemState === 'STRESS' ? "bg-[#ff9632]" :
                         systemState === 'OVERLOAD' ? "bg-[#ff3264]" : "bg-[#00f0ff]"
                       )}
                       animate={{
                         scaleX: [0, 1],
                         opacity: [0, 1, 0],
                         x: ['-50%', '50%']
                       }}
                       transition={{ 
                         duration: 1.5, 
                         repeat: Infinity, 
                         delay: i * 0.2,
                         ease: "linear"
                       }}
                       style={{ originX: 0 }}
                    />
                  </div>
                )}
             </React.Fragment>
           ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-6 flex items-center gap-2">
        <FileSearch className="w-4 h-4 text-white/40" />
        <span className="text-xs font-mono text-white/60">{getEngineStatus()}</span>
      </div>

      <div className="absolute bottom-4 right-6 flex items-center gap-2">
        <ArrowRightCircle className="w-4 h-4 text-white/40" />
        <span className="text-[10px] font-mono text-white/40">Lat: {latencyMs === null ? '--' : `${latencyMs}ms`}</span>
      </div>
    </motion.div>
  );
};
