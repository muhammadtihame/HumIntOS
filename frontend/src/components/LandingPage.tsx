import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { cn } from '../lib/utils';
import { Power, Brain, Eye, Zap, ShieldCheck } from 'lucide-react';

export const LandingPage: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const [isStarting, setIsStarting] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 30, stiffness: 100 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 20);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 20);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  const handleStart = () => {
    setIsStarting(true);
    setTimeout(() => {
      onStart();
    }, 2000); 
  };

  const features = [
    { icon: <Brain className="w-5 h-5 text-[#b464ff]" />, title: "Adaptive Cognition", desc: "Realtime mental state mapping" },
    { icon: <Eye className="w-5 h-5 text-[#00f0ff]" />, title: "Bio-Optical Sync", desc: "Saccade & pupil tracking" },
    { icon: <Zap className="w-5 h-5 text-[#ff9632]" />, title: "Neural UI Flow", desc: "Interface morphological shifting" }
  ];

  return (
    <motion.div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020203] overflow-hidden perspective-[2000px]"
      initial={{ opacity: 1 }}
      animate={{ 
        opacity: isStarting ? 0 : 1, 
        scale: isStarting ? 2 : 1,
        filter: isStarting ? 'blur(10px)' : 'blur(0px)'
      }}
      transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background Cyberpunk Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] mix-blend-overlay"></div>
        
        <motion.div 
          className="absolute top-1/2 left-1/2 w-[1000px] h-[1000px] bg-[#00f0ff] rounded-full blur-[200px] opacity-[0.04] will-change-transform"
          style={{ 
            x: useTransform(smoothX, x => x * -2 - 500), 
            y: useTransform(smoothY, y => y * -2 - 500) 
          }}
        />
        <motion.div 
          className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-[#b464ff] rounded-full blur-[150px] opacity-[0.06] will-change-transform"
          style={{ 
            x: useTransform(smoothX, x => x * 2 - 300), 
            y: useTransform(smoothY, y => y * 2 - 300) 
          }}
        />
        
        {/* Animated Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_60%,transparent_100%)] flex items-center justify-center">
            <motion.div 
              className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00f0ff]/5 to-transparent h-[200%]"
              animate={{ y: ['-50%', '0%'] }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            />
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-6xl px-4">
        
        {/* Info Banner Top */}
        <motion.div 
          className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <ShieldCheck className="w-4 h-4 text-[#00f0ff]" />
          <span className="text-xs font-mono uppercase tracking-widest text-white/50">Secure Neural Tunnel</span>
          <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-pulse ml-2" />
        </motion.div>

        {/* Feature Cards Background */}
        <div className="hidden lg:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] pointer-events-none justify-between items-center px-4 xl:px-0 max-w-7xl">
          <motion.div 
            className="flex flex-col gap-6"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
          >
             <FeatureCard {...features[0]} align="left" />
             <FeatureCard {...features[1]} align="left" delay={1.1} />
          </motion.div>
          <motion.div 
            className="flex flex-col gap-6"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1 }}
          >
             <FeatureCard {...features[2]} align="right" />
             <div className="bg-black/30 backdrop-blur-md border border-white/5 p-4 rounded-xl flex items-center gap-4 w-64 translate-x-12 opacity-80">
                <div className="w-10 h-10 border border-[#00f0ff]/30 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                    <span className="font-mono text-xs text-[#00f0ff]">v2.4</span>
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-mono text-white/80">Kernel Active</span>
                  <span className="text-[10px] text-white/40 uppercase tracking-widest">System Nominal</span>
                </div>
             </div>
          </motion.div>
        </div>

        {/* Center UI */}
        <motion.div 
          className="relative z-20 flex flex-col items-center mt-12 will-change-transform"
          style={{ 
            rotateX: smoothY,
            rotateY: smoothX,
          }}
        >
          {/* Logo/Title */}
          <motion.div 
            className="mb-16 text-center relative"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            <h1 className="text-5xl sm:text-7xl md:text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white/80 to-white/20 uppercase drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
              HumInt<span className="text-[#00f0ff] drop-shadow-[0_0_30px_rgba(0,240,255,0.4)]">OS</span>
            </h1>
            <p className="mt-4 md:mt-6 text-[10px] sm:text-xs md:text-sm font-mono text-[#00f0ff]/80 uppercase tracking-[0.2em] md:tracking-[0.4em] flex items-center justify-center gap-2 md:gap-4 px-4 text-center">
              <span className="hidden sm:block h-[1px] w-8 md:w-12 bg-gradient-to-r from-transparent to-[#00f0ff]/50"></span>
              Cognitive Operating System
              <span className="hidden sm:block h-[1px] w-8 md:w-12 bg-gradient-to-l from-transparent to-[#00f0ff]/50"></span>
            </p>
          </motion.div>

          {/* Start Button */}
          <motion.button
            onClick={handleStart}
            disabled={isStarting}
            className="relative group outline-none"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, type: "spring", stiffness: 100 }}
          >
            {/* Outer Glow */}
            <div className="absolute inset-x-0 bottom-0 h-4/5 bg-[#00f0ff]/20 blur-3xl rounded-full group-hover:bg-[#00f0ff]/40 transition-colors duration-500" />
            
            {/* Button Container */}
            <div className="relative overflow-hidden bg-black/60 backdrop-blur-xl border border-white/10 px-6 py-3 md:px-12 md:py-5 font-mono text-sm sm:text-lg md:text-xl font-bold uppercase tracking-[0.1em] md:tracking-[0.2em] text-white transition-all duration-500 group-hover:border-[#00f0ff]/50 rounded-full flex items-center gap-3 md:gap-4">
              
              {/* Scanning sweep effect */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#00f0ff]/20 to-transparent group-hover:animate-[shimmer_2s_infinite] skew-x-[-20deg]" />
              
              <Power className={cn("w-4 h-4 md:w-6 md:h-6 text-[#00f0ff] transition-transform duration-500", isStarting ? "animate-spin" : "group-hover:scale-110")} />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 group-hover:from-white group-hover:to-[#00f0ff] transition-all duration-500 pt-1 leading-none">
                {isStarting ? "Biometric Sync..." : "Initialize System"}
              </span>
              
              {/* Little detail lines */}
              <div className="absolute left-6 top-1/2 -translate-y-1/2 w-0 h-px bg-[#00f0ff] group-hover:w-4 transition-all duration-300" />
              <div className="absolute right-6 top-1/2 -translate-y-1/2 w-0 h-px bg-[#00f0ff] group-hover:w-4 transition-all duration-300" />
            </div>
            
            {/* Floating connection lines below button */}
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-px h-12 bg-gradient-to-b from-[#00f0ff]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
               <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-[#00f0ff]/50" />
            </div>
          </motion.button>
        </motion.div>
      </div>

      {/* Screen Wipe Transition effect overlay */}
      <AnimatePresence>
        {isStarting && (
          <motion.div
            className="absolute inset-0 flex flex-col z-50 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.1 }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <motion.div
                key={i}
                className="flex-1 bg-black/90 backdrop-blur-xl border-t border-[#00f0ff]/20"
                initial={{ scaleX: 0, originX: i % 2 === 0 ? 0 : 1 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, ease: "easeInOut", delay: 0.2 + (i * 0.1) }}
              />
            ))}
            <motion.div 
               className="absolute inset-0 flex items-center justify-center mix-blend-screen"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 1 }}
            >
               <div className="w-full h-1 bg-[#00f0ff] animate-pulse shadow-[0_0_50px_10px_rgba(0,240,255,0.8)]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const FeatureCard = ({ icon, title, desc, align = "left", delay = 0 }: any) => {
  return (
    <motion.div 
      className={cn(
        "bg-black/40 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center gap-4 w-[280px] transition-all hover:border-white/20 hover:bg-black/60",
        align === 'left' ? "-translate-x-12" : "translate-x-12 flex-row-reverse"
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
       <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/5">
          {icon}
       </div>
       <div className={cn("flex flex-col gap-1", align === 'right' && "text-right")}>
         <span className="text-sm font-semibold text-white/90">{title}</span>
         <span className="text-[10px] uppercase tracking-widest font-mono text-white/40">{desc}</span>
       </div>
    </motion.div>
  )
}
