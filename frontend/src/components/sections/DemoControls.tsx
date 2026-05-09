import React from 'react';
import { motion } from 'motion/react';
import { Target, AlertTriangle, Monitor, RotateCcw } from 'lucide-react';
import { useCognitive, SystemState } from '../../context/CognitiveContext';
import { cn } from '../../lib/utils';

export const DemoControls = () => {
  const { systemState, setSystemState } = useCognitive();

  const handleStateChange = (newState: SystemState) => {
    setSystemState(newState);
  };

  return (
    <motion.div 
      className="flex flex-wrap gap-4 items-center justify-center p-4 rounded-2xl glass-panel border border-white/5 relative overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      
      <span className="text-xs font-mono text-white/30 uppercase tracking-widest mr-4">Demo Overrides</span>

      <ControlBtn 
        active={systemState === 'NORMAL'} 
        icon={<Monitor className="w-4 h-4" />}
        label="Normalize State"
        color="hover:border-white/40 hover:bg-white/10"
        activeColor="border-white/40 bg-white/10 text-white"
        onClick={() => handleStateChange('NORMAL')}
      />
      <ControlBtn 
        active={systemState === 'FOCUS'} 
        icon={<Target className="w-4 h-4" />}
        label="Deep Focus"
        color="hover:border-[#00f0ff]/50 hover:bg-[#00f0ff]/10 hover:text-[#00f0ff]"
        activeColor="border-[#00f0ff]/50 bg-[#00f0ff]/20 text-[#00f0ff] neon-border-cyan"
        onClick={() => handleStateChange('FOCUS')}
      />
      <ControlBtn 
        active={systemState === 'STRESS'} 
        icon={<AlertTriangle className="w-4 h-4" />}
        label="Stress Mode"
        color="hover:border-[#ff9632]/50 hover:bg-[#ff9632]/10 hover:text-[#ff9632]"
        activeColor="border-[#ff9632]/50 bg-[#ff9632]/20 text-[#ff9632]"
        onClick={() => handleStateChange('STRESS')}
      />
      <ControlBtn 
        active={systemState === 'OVERLOAD'} 
        icon={<RotateCcw className="w-4 h-4" />}
        label="Simulate Overload"
        color="hover:border-[#ff3264]/50 hover:bg-[#ff3264]/10 hover:text-[#ff3264]"
        activeColor="border-[#ff3264]/50 bg-[#ff3264]/20 text-[#ff3264] neon-border-alert"
        onClick={() => handleStateChange('OVERLOAD')}
      />
    </motion.div>
  );
};

const ControlBtn = ({ active, icon, label, onClick, color, activeColor }: any) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 border border-transparent text-white/60",
        active ? activeColor : color
      )}
    >
      {icon}
      <span>{label}</span>
      {active && (
        <motion.div layoutId="active-indicator" className="w-1.5 h-1.5 rounded-full bg-current ml-1" />
      )}
    </button>
  );
};
