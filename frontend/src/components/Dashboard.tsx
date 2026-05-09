import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Activity, Target, Zap, Waves, Cpu, Eye, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useCognitive } from '../context/CognitiveContext';
import { cn } from '../lib/utils';
import { HeroSection } from './sections/HeroSection';
import { MetricsPanel } from './sections/MetricsPanel';
import { WebcamPanel } from './sections/WebcamPanel';
import { AssistantPanel } from './sections/AssistantPanel';
import { AnalyticsPanel } from './sections/AnalyticsPanel';
import { DecisionEngine } from './sections/DecisionEngine';
import { DemoControls } from './sections/DemoControls';

export const Dashboard = () => {
  const { systemState } = useCognitive();

  // Define layout variations based on system state
  const isOverload = systemState === 'OVERLOAD';
  const isFocus = systemState === 'FOCUS';
  const isStress = systemState === 'STRESS';

  return (
    <motion.div 
      className={cn(
        "min-h-screen w-full flex flex-col relative transition-colors duration-1000",
        isStress ? "bg-[#1a0f14]" : 
        isFocus ? "bg-[#050508]" : 
        "bg-[#0a0a0c]"
      )}
      animate={{
        opacity: 1
      }}
    >
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 will-change-transform">
        <motion.div 
          className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full opacity-20 blur-[120px] will-change-transform pointer-events-none"
          animate={{
            backgroundColor: isStress ? '#ff3264' : isFocus ? '#00f0ff' : '#b464ff',
            scale: isOverload ? [1, 1.2, 1] : [1, 1.05, 1],
            opacity: isOverload ? [0.1, 0.3, 0.1] : isFocus ? 0.1 : 0.2
          }}
          transition={{ duration: isOverload ? 2 : 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute top-[60%] -right-[10%] w-[40%] h-[60%] rounded-full opacity-10 blur-[100px] will-change-transform pointer-events-none"
          animate={{
            backgroundColor: isStress ? '#ff6432' : isFocus ? '#0050ff' : '#00f0ff',
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Particle/Grid overlays can go here */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-4 sm:py-6 flex flex-col gap-4 sm:gap-6 max-w-7xl">
        <HeroSection />
        
        <DemoControls />

        {/* Dynamic Grid Layout */}
        <motion.div 
          layout
          className={cn(
            "grid gap-4 md:gap-6 mt-4 md:mt-8 transition-all duration-700",
            isOverload ? "grid-cols-1" : 
            isStress ? "grid-cols-1 lg:grid-cols-[300px_1fr] xl:grid-cols-[350px_1fr]" : 
            isFocus ? "grid-cols-1 md:grid-cols-[1fr_250px] lg:grid-cols-[1fr_300px]" : 
            "grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_350px]"
          )}
        >
          {/* Main Visual/Assistant Area */}
          <motion.div 
            layout 
            className={cn(
              "flex flex-col gap-6",
              isStress ? "order-2" : "order-1"
            )}
          >
            <AnimatePresence mode="popLayout">
              {(!isFocus) && (
                <motion.div
                  key="webcam"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <WebcamPanel />
                </motion.div>
              )}
            </AnimatePresence>
            
            <AssistantPanel />
          </motion.div>

          {/* Right/Sidebar Metrics Area */}
          <motion.div 
            layout 
            className={cn(
              "flex flex-col gap-6",
              isStress ? "order-1" : "order-2"
            )}
          >
            <MetricsPanel />
            <AnimatePresence>
              {(!isOverload) && (
                <motion.div
                  key="decision"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <DecisionEngine />
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {(!isFocus && !isOverload) && (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <AnalyticsPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

    </motion.div>
  );
};
