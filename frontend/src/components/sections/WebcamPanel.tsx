import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, ScanFace, Focus, Fingerprint, Crosshair, ArrowUpRight } from 'lucide-react';
import { useCognitive } from '../../context/CognitiveContext';
import { cn } from '../../lib/utils';

export const WebcamPanel = () => {
  const { data, systemState } = useCognitive();
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const interval = setInterval(() => {
      setGaze({
        x: (Math.random() - 0.5) * 40,
        y: (Math.random() - 0.5) * 40,
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    if (systemState === 'STRESS') return 'text-[#ff9632]';
    if (systemState === 'OVERLOAD') return 'text-[#ff3264]';
    if (systemState === 'FOCUS') return 'text-[#00f0ff]';
    return 'text-[#b464ff]';
  };

  const getBgColor = () => {
    if (systemState === 'STRESS') return 'bg-[#ff9632]';
    if (systemState === 'OVERLOAD') return 'bg-[#ff3264]';
    if (systemState === 'FOCUS') return 'bg-[#00f0ff]';
    return 'bg-[#b464ff]';
  };

  const getBorderColor = () => {
    if (systemState === 'STRESS') return 'border-[#ff9632]/40';
    if (systemState === 'OVERLOAD') return 'border-[#ff3264]/40';
    if (systemState === 'FOCUS') return 'border-[#00f0ff]/40';
    return 'border-white/10';
  };

  return (
    <motion.div 
      layout
      className={cn(
        "glass-panel rounded-3xl p-1 flex flex-col relative overflow-hidden group",
        getBorderColor()
      )}
    >
      <div className="absolute top-4 left-6 z-20 flex items-center gap-2">
        <Camera className={cn("w-4 h-4", getStatusColor())} />
        <span className="text-xs font-mono uppercase tracking-widest text-white/50">Bio-Optical Feed</span>
      </div>
      
      <div className="absolute top-4 right-6 z-20 flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full animate-pulse", 
          systemState === 'OVERLOAD' ? 'bg-[#ff3264]' : 'bg-[#00f0ff]'
        )} />
        <span className="text-xs font-mono uppercase text-white/50">REC</span>
      </div>

      <div className="relative w-full aspect-[4/3] md:aspect-video bg-black/60 rounded-[22px] overflow-hidden">
        {/* Fake webcam image/gradient */}
        <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1544717305-2782549b5136?q=80&w=2000')] bg-cover bg-center mix-blend-luminosity filter contrast-150 brightness-50" />
        
        {/* Cyberpunk overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
        
        {/* Scanning line */}
        <motion.div 
          className={cn(
            "absolute left-0 right-0 h-[2px] blur-[1px] shadow-[0_0_10px_currentColor]",
            getStatusColor()
          )}
          animate={{ top: ['0%', '100%', '0%'] }}
          transition={{ duration: 4, ease: "linear", repeat: Infinity }}
        />

        {/* Facial Landmarks Overlay & Targeting HUD */}
        <div className="absolute inset-0 flex items-center justify-center">
            {/* Dynamic Focus Reticle */}
            <motion.div
              className={cn("absolute w-64 h-64 border rounded-full opacity-20", getBorderColor())}
              animate={{ 
                scale: systemState === 'FOCUS' ? [1, 1.05, 1] : [1, 1.2, 1],
                rotate: 360
              }}
              transition={{ duration: systemState === 'FOCUS' ? 4 : 10, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className={cn("absolute w-48 h-48 border border-dashed rounded-full opacity-30", getBorderColor())}
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            />

            <div className="absolute top-[20%] left-[30%] right-[30%] bottom-[20%] border border-white/20 rounded-3xl flex items-center justify-center">
                <motion.div 
                  className={cn("absolute inset-0 rounded-3xl opacity-20", getBgColor())}
                  animate={{ opacity: [0.1, 0.3, 0.1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                
                {/* Crosshairs */}
                <Focus className={cn("w-8 h-8 opacity-50 absolute top-4 left-4", getStatusColor())} />
                <Focus className={cn("w-8 h-8 opacity-50 absolute top-4 right-4 rotate-90", getStatusColor())} />
                <Focus className={cn("w-8 h-8 opacity-50 absolute bottom-4 left-4 -rotate-90", getStatusColor())} />
                <Focus className={cn("w-8 h-8 opacity-50 absolute bottom-4 right-4 rotate-180", getStatusColor())} />
                
                {/* Simulated Gaze Vector */}
                <motion.div 
                  className={cn("absolute w-2 h-2 rounded-full", getBgColor())}
                  animate={{ x: gaze.x, y: gaze.y }}
                  transition={{ type: 'spring', stiffness: 50, damping: 10 }}
                >
                  <motion.div 
                    className={cn("absolute top-1/2 left-1/2 w-[1px] h-12 origin-top opacity-50", getBgColor())}
                    animate={{ rotate: Math.atan2(gaze.y, gaze.x) * (180 / Math.PI) - 90 }}
                  />
                </motion.div>

                <ScanFace className="w-24 h-24 text-white/10" strokeWidth={1} />
            </div>
            
            {/* Center Crosshair */}
            <Crosshair className={cn("absolute w-6 h-6 opacity-40", getStatusColor())} />
        </div>

        {/* Live Data HUD */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
           <HUDMetric label="Pupil Dilation" value={`${(Math.random() * 2 + 3).toFixed(1)}mm`} />
           <HUDMetric label="Micro-expressions" value={data.emotionalStability > 80 ? 'Stable' : 'Volatile'} />
           <HUDMetric label="Saccade Rate" value={`${(data.stressLevel * 0.5 + 20).toFixed(0)} Hz`} />
           <HUDMetric label="Gaze Vector" value={`X:${gaze.x.toFixed(0)} Y:${gaze.y.toFixed(0)}`} icon={<ArrowUpRight className="w-3 h-3" />} />
        </div>

        <div className="absolute bottom-4 right-4 flex flex-col gap-1 items-end text-right z-10">
           <HUDMetric label="Authentication" value="Verified" icon={<Fingerprint className="w-3 h-3" />} />
           <HUDMetric label="Cognitive Load" value={`${data.cognitiveLoad.toFixed(1)}%`} />
           <HUDMetric label="Stress Markers" value={data.stressLevel > 60 ? 'Active' : 'Nominal'} 
              color={data.stressLevel > 60 ? 'text-[#ff3264]' : 'text-[#00f0ff]'}
           />
        </div>

        {/* State Label */}
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: systemState === 'OVERLOAD' ? 1 : 0, scale: 1 }}
        >
          <div className="bg-[#ff3264]/20 backdrop-blur-md border border-[#ff3264]/50 text-[#ff3264] px-4 py-2 rounded-full font-mono text-sm tracking-widest uppercase animate-pulse shadow-[0_0_20px_rgba(255,50,100,0.5)]">
            Attention Drift Detected
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

const HUDMetric = ({ label, value, icon, color = "text-white" }: any) => (
  <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-2 py-1 rounded border border-white/5">
    {icon && <span className="text-white/50">{icon}</span>}
    <span className="text-[10px] font-mono text-white/50 uppercase">{label}</span>
    <span className={cn("text-xs font-mono font-medium drop-shadow-md", color)}>{value}</span>
  </div>
);
