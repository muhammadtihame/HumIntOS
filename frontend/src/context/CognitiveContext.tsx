import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  AssistantResponse,
  BackendCognitiveState,
  BehaviorTelemetryPayload,
  DemoResponse,
  EmotionAnalysisResponse,
  RealtimeEnvelope,
  getCurrentState,
  getHealth,
  getHumeStatus,
  openRealtimeSocket,
  postAssistantMessage,
  postBehaviorTelemetry,
  postDemoScenario,
  postEmotionFrame,
  postTextEmotion,
  postVoiceTts,
} from '../services/humintosApi';

export type SystemState = 'NORMAL' | 'FOCUS' | 'STRESS' | 'OVERLOAD';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error';

export interface CognitiveData {
  stressLevel: number;
  focusLevel: number;
  cognitiveLoad: number;
  emotionalStability: number;
  intentConfidence: number;
  distractionProbability: number;
  cognitiveFatigue: number;
  behavioralConsistency: number;
  empathyLevel: number;
  hesitationLevel: number;
  engagementLevel: number;
  voiceConfidence: number;
}

export interface AdaptiveDecision {
  mode?: string;
  assistant_style?: string;
  changed?: boolean;
  reason?: string;
  priority?: number;
  signals?: Record<string, unknown>;
  timestamp?: string;
}

interface CognitiveContextProps {
  systemState: SystemState;
  setSystemState: (state: SystemState) => void;
  data: CognitiveData;
  logs: string[];
  events: Record<string, unknown>[];
  connectionStatus: ConnectionStatus;
  backendError: string | null;
  backendHealth: Record<string, unknown> | null;
  humeStatus: Record<string, unknown> | null;
  latencyMs: number | null;
  assistantStatus: string;
  lastDecision: AdaptiveDecision | null;
  lastEmotion: EmotionAnalysisResponse | null;
  addLog: (log: string) => void;
  triggerDemo: (state: SystemState) => Promise<void>;
  sendBehaviorTelemetry: (payload: BehaviorTelemetryPayload) => Promise<void>;
  sendEmotionFrame: (imageBase64: string, metadata?: Record<string, unknown>) => Promise<EmotionAnalysisResponse>;
  analyzeTextEmotion: (text: string, updateState?: boolean, metadata?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  sendAssistantMessage: (message: string, context?: Record<string, unknown>) => Promise<AssistantResponse>;
  synthesizeVoice: (text: string, metadata?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  sendRealtimeEvent: (type: string, payload?: Record<string, unknown>) => boolean;
}

const defaultData: CognitiveData = {
  stressLevel: 42,
  focusLevel: 67,
  cognitiveLoad: 48,
  emotionalStability: 67,
  intentConfidence: 78,
  distractionProbability: 26,
  cognitiveFatigue: 31,
  behavioralConsistency: 72,
  empathyLevel: 50,
  hesitationLevel: 20,
  engagementLevel: 65,
  voiceConfidence: 70,
};

const stateToScenario: Record<SystemState, string> = {
  NORMAL: 'normalize',
  FOCUS: 'focus',
  STRESS: 'stress',
  OVERLOAD: 'overload',
};

const CognitiveContext = createContext<CognitiveContextProps | undefined>(undefined);

const modeToSystemState = (mode?: string): SystemState => {
  if (mode === 'focus_mode') return 'FOCUS';
  if (mode === 'stress_mode') return 'STRESS';
  if (mode === 'cognitive_overload_mode') return 'OVERLOAD';
  return 'NORMAL';
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

const mapBackendState = (state: BackendCognitiveState): CognitiveData => {
  const stress = clamp(state.stress_level);
  const fatigue = clamp(state.fatigue);
  const distraction = clamp(state.distraction_probability);
  return {
    stressLevel: stress,
    focusLevel: clamp(state.focus_level),
    cognitiveLoad: clamp(state.cognitive_load),
    emotionalStability: clamp(100 - (stress * 0.42 + fatigue * 0.28 + distraction * 0.3)),
    intentConfidence: clamp(state.intent_confidence),
    distractionProbability: distraction,
    cognitiveFatigue: fatigue,
    behavioralConsistency: clamp(state.behavioral_consistency),
    empathyLevel: clamp(state.empathy_level ?? 50),
    hesitationLevel: clamp(state.hesitation_level ?? 20),
    engagementLevel: clamp(state.engagement_level ?? 65),
    voiceConfidence: clamp(state.voice_confidence ?? 70),
  };
};

const compactError = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected integration error';

const eventLogLine = (payload: Record<string, unknown>) => {
  const severity = String(payload.severity || 'event').toUpperCase();
  const event = String(payload.event || 'system_event').replaceAll('_', ' ');
  const recommendation = payload.recommendation ? ` -> ${String(payload.recommendation).replaceAll('_', ' ')}` : '';
  return `${severity}: ${event}${recommendation}`;
};

export const CognitiveProvider = ({ children }: { children: ReactNode }) => {
  const [systemState, setSystemStateLocal] = useState<SystemState>('NORMAL');
  const [data, setData] = useState<CognitiveData>(defaultData);
  const [logs, setLogs] = useState<string[]>(['System initialized. Connecting to HumIntOS backend.']);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<Record<string, unknown> | null>(null);
  const [humeStatus, setHumeStatus] = useState<Record<string, unknown> | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [assistantStatus, setAssistantStatus] = useState('idle');
  const [lastDecision, setLastDecision] = useState<AdaptiveDecision | null>(null);
  const [lastEmotion, setLastEmotion] = useState<EmotionAnalysisResponse | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const lastPingAtRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);

  const addLog = useCallback((log: string) => {
    setLogs((prev) => [log, ...prev.filter((item) => item !== log)].slice(0, 20));
  }, []);

  const applyBackendState = useCallback((state: BackendCognitiveState) => {
    setData(mapBackendState(state));
    setSystemStateLocal(modeToSystemState(state.active_mode));
  }, []);

  const refreshState = useCallback(async () => {
    const state = await getCurrentState();
    applyBackendState(state);
  }, [applyBackendState]);

  const handleRealtimeEnvelope = useCallback(
    (envelope: RealtimeEnvelope<Record<string, unknown>>) => {
      const payload = envelope.payload ?? {};

      switch (envelope.type) {
        case 'system.welcome': {
          const state = payload.state as BackendCognitiveState | undefined;
          if (state) applyBackendState(state);
          setBackendError(null);
          addLog('Realtime backend stream connected.');
          break;
        }
        case 'cognitive.state':
          applyBackendState(payload as unknown as BackendCognitiveState);
          break;
        case 'adaptive.mode':
          setLastDecision(payload as AdaptiveDecision);
          setSystemStateLocal(modeToSystemState(String(payload.mode)));
          if (payload.changed) addLog(`Adaptive mode changed: ${String(payload.mode).replaceAll('_', ' ')}`);
          break;
        case 'system.event':
          setEvents((prev) => [payload, ...prev].slice(0, 30));
          addLog(eventLogLine(payload));
          break;
        case 'reasoning.log':
          if (payload.message) addLog(String(payload.message));
          break;
        case 'emotion.update':
          setLastEmotion(payload as unknown as EmotionAnalysisResponse);
          break;
        case 'behavior.analysis':
          if (payload.state) applyBackendState(payload.state as BackendCognitiveState);
          break;
        case 'assistant.status':
          setAssistantStatus(String(payload.status || 'idle'));
          break;
        case 'assistant.response':
          setAssistantStatus('idle');
          break;
        case 'hume.emotion':
          addLog('Hume emotion signal fused into cognitive state.');
          break;
        case 'hume.text_emotion':
          if (payload.state) applyBackendState(payload.state as BackendCognitiveState);
          break;
        case 'hume.transcription':
          if (payload.text) addLog(`Voice transcript: ${String(payload.text)}`);
          break;
        case 'hume.tts.status':
          addLog(`Voice synthesis ${String(payload.status || 'updated')}.`);
          break;
        case 'pong':
          if (lastPingAtRef.current) setLatencyMs(Math.round(performance.now() - lastPingAtRef.current));
          break;
        case 'system.error':
          setBackendError(String(payload.message || 'Realtime backend error'));
          addLog(`ERROR: ${String(payload.message || 'Realtime backend error')}`);
          break;
        default:
          break;
      }
    },
    [addLog, applyBackendState],
  );

  useEffect(() => {
    let mounted = true;

    getHealth()
      .then((health) => {
        if (!mounted) return;
        setBackendHealth(health);
        setBackendError(null);
      })
      .catch((error) => {
        if (!mounted) return;
        const message = compactError(error);
        setBackendError(message);
        setConnectionStatus('offline');
        addLog(`ERROR: Backend health check failed: ${message}`);
      });

    refreshState().catch((error) => {
      if (mounted) addLog(`ERROR: State sync failed: ${compactError(error)}`);
    });

    getHumeStatus()
      .then((status) => {
        if (mounted) setHumeStatus(status);
      })
      .catch(() => {
        if (mounted) setHumeStatus(null);
      });

    return () => {
      mounted = false;
    };
  }, [addLog, refreshState]);

  useEffect(() => {
    let closedByProvider = false;

    const clearPingTimer = () => {
      if (pingTimerRef.current !== null) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    };

    const connect = () => {
      if (closedByProvider) return;
      setConnectionStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
      const socket = openRealtimeSocket();
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionStatus('connected');
        setBackendError(null);
        lastPingAtRef.current = performance.now();
        socket.send(JSON.stringify({ type: 'ping', payload: {} }));
        clearPingTimer();
        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            lastPingAtRef.current = performance.now();
            socket.send(JSON.stringify({ type: 'ping', payload: {} }));
          }
        }, 10000);
      };

      socket.onmessage = (event) => {
        try {
          handleRealtimeEnvelope(JSON.parse(event.data));
        } catch {
          addLog('ERROR: Received malformed realtime event.');
        }
      };

      socket.onerror = () => {
        setConnectionStatus('error');
        setBackendError('Realtime socket connection failed.');
      };

      socket.onclose = () => {
        clearPingTimer();
        if (closedByProvider) return;
        reconnectAttemptRef.current += 1;
        setConnectionStatus('reconnecting');
        const delay = Math.min(10000, 750 * reconnectAttemptRef.current);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByProvider = true;
      clearPingTimer();
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [addLog, handleRealtimeEnvelope]);

  const sendRealtimeEvent = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, payload }));
    return true;
  }, []);

  const sendBehaviorTelemetry = useCallback(
    async (payload: BehaviorTelemetryPayload) => {
      try {
        const response = await postBehaviorTelemetry(payload);
        if (response.state) applyBackendState(response.state);
      } catch (error) {
        const message = compactError(error);
        setBackendError(message);
        addLog(`ERROR: Behavior telemetry sync failed: ${message}`);
      }
    },
    [addLog, applyBackendState],
  );

  const sendEmotionFrame = useCallback(
    async (imageBase64: string, metadata: Record<string, unknown> = {}) => {
      try {
        const response = await postEmotionFrame(imageBase64, metadata);
        setLastEmotion(response);
        await refreshState();
        return response;
      } catch (error) {
        const message = compactError(error);
        setBackendError(message);
        addLog(`ERROR: Camera analysis failed: ${message}`);
        throw error;
      }
    },
    [addLog, refreshState],
  );

  const analyzeTextEmotion = useCallback(
    async (text: string, updateState = true, metadata: Record<string, unknown> = {}) => {
      const response = await postTextEmotion(text, updateState, metadata);
      const state = response.state as BackendCognitiveState | undefined;
      if (state) applyBackendState(state);
      return response;
    },
    [applyBackendState],
  );

  const sendAssistantMessage = useCallback(
    async (message: string, context: Record<string, unknown> = {}) => {
      setAssistantStatus('thinking');
      try {
        const response = await postAssistantMessage(message, { ...context, cognitive_state: data, system_state: systemState });
        setAssistantStatus('idle');
        return response;
      } catch (error) {
        setAssistantStatus('idle');
        const errorMessage = compactError(error);
        setBackendError(errorMessage);
        addLog(`ERROR: Assistant request failed: ${errorMessage}`);
        throw error;
      }
    },
    [addLog, data, systemState],
  );

  const synthesizeVoice = useCallback(async (text: string, metadata: Record<string, unknown> = {}) => {
    return postVoiceTts(text, metadata);
  }, []);

  const triggerDemo = useCallback(
    async (state: SystemState) => {
      setSystemStateLocal(state);
      try {
        const response: DemoResponse = await postDemoScenario(stateToScenario[state]);
        applyBackendState(response.state);
        response.events.forEach((event) => {
          setEvents((prev) => [event, ...prev].slice(0, 30));
          addLog(eventLogLine(event));
        });
        response.logs.forEach((log) => addLog(log.message));
      } catch (error) {
        const message = compactError(error);
        setBackendError(message);
        addLog(`ERROR: Demo state sync failed: ${message}`);
      }
    },
    [addLog, applyBackendState],
  );

  const setSystemState = useCallback(
    (state: SystemState) => {
      void triggerDemo(state);
    },
    [triggerDemo],
  );

  const value = useMemo(
    () => ({
      systemState,
      setSystemState,
      data,
      logs,
      events,
      connectionStatus,
      backendError,
      backendHealth,
      humeStatus,
      latencyMs,
      assistantStatus,
      lastDecision,
      lastEmotion,
      addLog,
      triggerDemo,
      sendBehaviorTelemetry,
      sendEmotionFrame,
      analyzeTextEmotion,
      sendAssistantMessage,
      synthesizeVoice,
      sendRealtimeEvent,
    }),
    [
      systemState,
      setSystemState,
      data,
      logs,
      events,
      connectionStatus,
      backendError,
      backendHealth,
      humeStatus,
      latencyMs,
      assistantStatus,
      lastDecision,
      lastEmotion,
      addLog,
      triggerDemo,
      sendBehaviorTelemetry,
      sendEmotionFrame,
      analyzeTextEmotion,
      sendAssistantMessage,
      synthesizeVoice,
      sendRealtimeEvent,
    ],
  );

  return <CognitiveContext.Provider value={value}>{children}</CognitiveContext.Provider>;
};

export const useCognitive = () => {
  const context = useContext(CognitiveContext);
  if (!context) throw new Error('useCognitive must be used within CognitiveProvider');
  return context;
};
