import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type SystemState = 'NORMAL' | 'FOCUS' | 'STRESS' | 'OVERLOAD';

export interface CognitiveData {
  stressLevel: number;
  focusLevel: number;
  cognitiveLoad: number;
  emotionalStability: number;
  intentConfidence: number;
  distractionProbability: number;
  cognitiveFatigue: number;
  behavioralConsistency: number;
}

interface CognitiveContextProps {
  systemState: SystemState;
  setSystemState: (state: SystemState) => void;
  data: CognitiveData;
  logs: string[];
  addLog: (log: string) => void;
}

const defaultData: CognitiveData = {
  stressLevel: 25,
  focusLevel: 75,
  cognitiveLoad: 40,
  emotionalStability: 85,
  intentConfidence: 90,
  distractionProbability: 15,
  cognitiveFatigue: 20,
  behavioralConsistency: 88,
};

const CognitiveContext = createContext<CognitiveContextProps | undefined>(undefined);

export const CognitiveProvider = ({ children }: { children: ReactNode }) => {
  const [systemState, setSystemState] = useState<SystemState>('NORMAL');
  const [data, setData] = useState<CognitiveData>(defaultData);
  const [logs, setLogs] = useState<string[]>(['System initialized. Monitoring active.']);

  const addLog = (log: string) => {
    setLogs((prev) => [log, ...prev].slice(0, 10)); // Keep last 10 logs
  };

  useEffect(() => {
    // Simulated realtime fluctuations based on current state
    const interval = setInterval(() => {
      setData((prev) => {
        let newData = { ...prev };
        
        const fluctuate = (val: number, change: number, min = 0, max = 100) => {
            const newVal = val + change;
            return Math.max(min, Math.min(newVal, max));
        };

        if (systemState === 'NORMAL') {
          // Normal state, slight random fluctuations towards baseline
          newData.stressLevel = fluctuate(newData.stressLevel, (Math.random() - 0.5) * 5 + (25 - newData.stressLevel) * 0.1);
          newData.focusLevel = fluctuate(newData.focusLevel, (Math.random() - 0.5) * 5 + (75 - newData.focusLevel) * 0.1);
          newData.cognitiveLoad = fluctuate(newData.cognitiveLoad, (Math.random() - 0.5) * 5 + (40 - newData.cognitiveLoad) * 0.1);
          newData.emotionalStability = fluctuate(newData.emotionalStability, (Math.random() - 0.5) * 5 + (85 - newData.emotionalStability) * 0.1);
        } else if (systemState === 'STRESS') {
          newData.stressLevel = fluctuate(newData.stressLevel, Math.random() * 5, 0, 95);
          newData.focusLevel = fluctuate(newData.focusLevel, -Math.random() * 5, 20, 100);
          newData.emotionalStability = fluctuate(newData.emotionalStability, -Math.random() * 5, 30, 100);
        } else if (systemState === 'FOCUS') {
          newData.focusLevel = fluctuate(newData.focusLevel, Math.random() * 3, 0, 98);
          newData.stressLevel = fluctuate(newData.stressLevel, -Math.random() * 4, 10, 100);
          newData.distractionProbability = fluctuate(newData.distractionProbability, -Math.random() * 3, 5, 100);
        } else if (systemState === 'OVERLOAD') {
          newData.cognitiveLoad = fluctuate(newData.cognitiveLoad, Math.random() * 5, 0, 98);
          newData.stressLevel = fluctuate(newData.stressLevel, Math.random() * 4, 0, 90);
          newData.focusLevel = fluctuate(newData.focusLevel, -Math.random() * 6, 10, 100);
          newData.cognitiveFatigue = fluctuate(newData.cognitiveFatigue, Math.random() * 3, 0, 95);
        }

        // Add some jitter to all stats
        newData.intentConfidence = fluctuate(newData.intentConfidence, (Math.random() - 0.5) * 2);
        newData.behavioralConsistency = fluctuate(newData.behavioralConsistency, (Math.random() - 0.5) * 3);

        return newData;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [systemState]);

  // Log triggers
  useEffect(() => {
    if (systemState === 'OVERLOAD' && data.cognitiveLoad > 85) {
      if (Math.random() > 0.7) addLog("CRITICAL: Structural interface simplification induced.");
    }
    if (systemState === 'STRESS' && data.stressLevel > 70) {
      if (Math.random() > 0.8) addLog("WARNING: Elevated stress heartbeat detected.");
    }
  }, [data, systemState]);

  return (
    <CognitiveContext.Provider value={{ systemState, setSystemState, data, logs, addLog }}>
      {children}
    </CognitiveContext.Provider>
  );
};

export const useCognitive = () => {
  const context = useContext(CognitiveContext);
  if (!context) throw new Error('useCognitive must be used within CognitiveProvider');
  return context;
};
