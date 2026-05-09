import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useCognitive, CognitiveData } from '../../context/CognitiveContext';
import { cn } from '../../lib/utils';
import { Zap, Brain, Crosshair, HeartPulse, Activity, AlertTriangle, BatteryWarning } from 'lucide-react';

export const MetricsPanel = () => {
  const { data, systemState } = useCognitive();
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    setHistory(prev => {
      const newHistory = [...prev, { time: Date.now(), ...data }].slice(-20);
      return newHistory;
    });
  }, [data]);

  const getMetricColor = (val: number, type: 'stress' | 'focus' | 'good' | 'bad' = 'good') => {
    if (type === 'good') return val > 70 ? '#00f0ff' : val > 40 ? '#b464ff' : '#ff3264';
    if (type === 'bad') return val > 70 ? '#ff3264' : val > 40 ? '#ff9632' : '#00f0ff';
    if (type === 'stress') return val > 75 ? '#ff3264' : val > 50 ? '#ff9632' : '#00f0ff';
    if (type === 'focus') return val > 75 ? '#00f0ff' : val > 40 ? '#b464ff' : '#ff9632';
    return '#ffffff';
  };

  return (
    <motion.div 
      className="glass-panel rounded-3xl p-6 flex flex-col gap-6"
      layout
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <h2 className="text-xl font-medium tracking-tight flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#00f0ff]" />
          Cognitive Metrics
        </h2>
        <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-1 rounded">LIVE</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-4">
        <MetricCard 
          title="Stress Level" 
          value={data.stressLevel} 
          icon={<HeartPulse className="w-4 h-4" />}
          dataKey="stressLevel"
          history={history}
          color={getMetricColor(data.stressLevel, 'stress')}
        />
        <MetricCard 
          title="Focus Level" 
          value={data.focusLevel} 
          icon={<Crosshair className="w-4 h-4" />}
          dataKey="focusLevel"
          history={history}
          color={getMetricColor(data.focusLevel, 'focus')}
        />
        <MetricCard 
          title="Cognitive Load" 
          value={data.cognitiveLoad} 
          icon={<Brain className="w-4 h-4" />}
          dataKey="cognitiveLoad"
          history={history}
          color={getMetricColor(data.cognitiveLoad, 'bad')}
        />
        <MetricCard 
          title="Cognitive Fatigue" 
          value={data.cognitiveFatigue} 
          icon={<BatteryWarning className="w-4 h-4" />}
          dataKey="cognitiveFatigue"
          history={history}
          color={getMetricColor(data.cognitiveFatigue, 'bad')}
        />
      </div>

      {systemState === 'OVERLOAD' && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-2 p-4 rounded-xl bg-[#ff3264]/10 border border-[#ff3264]/30"
        >
          <div className="flex items-center gap-2 text-[#ff3264] mb-2">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
            <span className="font-medium text-sm">Critical Threshold Exceeded</span>
          </div>
          <p className="text-xs text-[#ff3264]/70">
            Cognitive load parameters indicate high fragmentation risk. Simplifying UI...
          </p>
        </motion.div>
      )}
    </motion.div>
  );
};

const MetricCard = ({ title, value, icon, color, history, dataKey }: any) => {
  return (
    <motion.div 
      className="bg-black/30 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden border border-white/5"
      whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.05)' }}
      layout
    >
      <div className="flex items-center gap-2 text-white/50 z-10">
        <div style={{ color }}>{icon}</div>
        <span className="text-xs font-mono uppercase truncate">{title}</span>
      </div>

      <div className="flex items-end gap-2 z-10">
        <motion.span 
          className="text-3xl font-bold tracking-tighter"
          style={{ color }}
          key={Math.round(value)}
          initial={{ opacity: 0.8, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {value.toFixed(0)}
        </motion.span>
        <span className="text-sm text-white/30 mb-1">%</span>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-12 opacity-30 pointer-events-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.8} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              fill={`url(#grad-${dataKey})`} 
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};
