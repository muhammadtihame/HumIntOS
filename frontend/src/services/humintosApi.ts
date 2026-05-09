export interface BackendCognitiveState {
  stress_level: number;
  focus_level: number;
  cognitive_load: number;
  emotion: string;
  fatigue: number;
  intent_confidence: number;
  distraction_probability: number;
  behavioral_consistency: number;
  empathy_level?: number;
  hesitation_level?: number;
  engagement_level?: number;
  voice_confidence?: number;
  active_mode: string;
  assistant_style: string;
  last_updated: string;
}

export interface RealtimeEnvelope<T = Record<string, unknown>> {
  type: string;
  payload: T;
  timestamp: string;
}

export interface BehaviorTelemetryPayload {
  typing_speed?: number;
  mouse_movement?: number;
  mouse_velocity?: number;
  click_frequency?: number;
  inactivity_seconds?: number;
  tab_switches?: number;
  hesitation_ms?: number;
  window_focus_changes?: number;
  correction_rate?: number;
  gaze_x?: number | null;
  gaze_y?: number | null;
  gaze_deviation?: number;
  eye_tracking_confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface AssistantResponse {
  response: string;
  mode: string;
  style: string;
  model: string;
  latency_ms: number;
  state_context: Record<string, unknown>;
  timestamp: string;
}

export interface EmotionAnalysisResponse {
  emotion: string;
  confidence: number;
  attention_score: number;
  fatigue_level: number;
  stress_probability: number;
  face_detected: boolean;
  landmarks_detected: boolean;
  source: string;
  timestamp: string;
}

export interface DemoResponse {
  scenario: string;
  activated: boolean;
  state: BackendCognitiveState;
  events: Record<string, unknown>[];
  logs: { message: string; category: string; intensity: string; timestamp: string }[];
}

const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {});

export const API_BASE_URL = (
  env.VITE_HUMINTOS_API_URL ||
  env.VITE_API_BASE_URL ||
  'http://localhost:8000'
).replace(/\/$/, '');

export const WS_BASE_URL = (
  env.VITE_HUMINTOS_WS_URL ||
  API_BASE_URL.replace(/^http/, 'ws')
).replace(/\/$/, '');

export const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
export const wsUrl = (path: string) => `${WS_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.detail || body.message || message;
    } catch {
      try {
        message = (await response.text()) || message;
      } catch {
        // Keep the HTTP status as the useful error.
      }
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const getHealth = () => apiFetch<Record<string, unknown>>('/health');
export const getCurrentState = () => apiFetch<BackendCognitiveState>('/state/current');
export const getHumeStatus = () => apiFetch<Record<string, unknown>>('/hume/status');

export const postBehaviorTelemetry = (payload: BehaviorTelemetryPayload) =>
  apiFetch<{ state: BackendCognitiveState; events: Record<string, unknown>[] }>('/behavior/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const postEmotionFrame = (imageBase64: string, metadata: Record<string, unknown> = {}) =>
  apiFetch<EmotionAnalysisResponse>('/emotion/analyze', {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBase64, simulate: true, metadata }),
  });

export const postTextEmotion = (text: string, updateState = true, metadata: Record<string, unknown> = {}) =>
  apiFetch<Record<string, unknown>>('/emotion/text', {
    method: 'POST',
    body: JSON.stringify({ text, update_state: updateState, metadata }),
  });

export const postAssistantMessage = (message: string, context: Record<string, unknown> = {}) =>
  apiFetch<AssistantResponse>('/assistant/respond', {
    method: 'POST',
    body: JSON.stringify({ message, context, stream: false }),
  });

export const postDemoScenario = (scenario: string) =>
  apiFetch<DemoResponse>(`/demo/${scenario}`, { method: 'POST' });

export const postVoiceTts = (text: string, metadata: Record<string, unknown> = {}) =>
  apiFetch<Record<string, unknown>>('/voice/tts', {
    method: 'POST',
    body: JSON.stringify({ text, metadata }),
  });

export const openRealtimeSocket = () => new WebSocket(wsUrl('/ws/realtime'));
export const openHumeEviSocket = () => new WebSocket(wsUrl('/ws/hume/evi'));
export const openHumeTtsSocket = () => new WebSocket(wsUrl('/ws/hume/tts'));
