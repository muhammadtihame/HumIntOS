import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, ScanFace, Focus, Fingerprint, Crosshair, ArrowUpRight } from 'lucide-react';
import { useCognitive } from '../../context/CognitiveContext';
import type { EmotionAnalysisResponse } from '../../services/humintosApi';
import { cn } from '../../lib/utils';

type CameraStatus = 'starting' | 'active' | 'unavailable';

type GazePoint = {
  x: number;
  y: number;
  confidence: number;
  source: 'face-mesh' | 'face-detection' | 'pending' | 'unavailable';
};

const CALIBRATION_DURATION_MS = 25_000;
const GAZE_DISPLAY_RANGE = 40;
const BEHAVIOR_SAMPLE_MS = 3000;

type InteractionSample = {
  pointerX: number | null;
  pointerY: number | null;
  mouseMovement: number;
  clickCount: number;
  keyCount: number;
  correctionCount: number;
  windowFocusChanges: number;
  lastActivityAt: number;
  sampleStartedAt: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const gazeFromEmotion = (emotion: EmotionAnalysisResponse): GazePoint => {
  const x = isFiniteNumber(emotion.gaze_x) ? clamp(emotion.gaze_x, -1, 1) : 0;
  const y = isFiniteNumber(emotion.gaze_y) ? clamp(emotion.gaze_y, -1, 1) : 0;
  const confidence = isFiniteNumber(emotion.face_confidence)
    ? emotion.face_confidence
    : isFiniteNumber(emotion.eye_openness)
      ? emotion.eye_openness
      : emotion.face_detected
        ? emotion.confidence
        : 0;

  return {
    x,
    y,
    confidence: clamp01(confidence),
    source: emotion.landmarks_detected ? 'face-mesh' : emotion.face_detected ? 'face-detection' : 'unavailable',
  };
};

const microExpressionLabel = (emotion: EmotionAnalysisResponse | null) => {
  if (!emotion) return 'pending';
  if (!emotion.face_detected) return 'seeking face';
  if (!emotion.landmarks_detected) return emotion.emotion || 'face lock';

  const brow = emotion.brow_lift ?? 0;
  const curve = emotion.mouth_curve ?? 0.5;
  const mouth = emotion.mouth_open ?? 0;
  const eyes = emotion.eye_openness ?? 0.5;

  if (curve > 0.64 && mouth < 0.34) return 'micro-smile';
  if (curve < 0.38 && brow > 0.45) return 'brow tension';
  if (brow > 0.62) return 'brow lift';
  if (mouth > 0.42) return 'mouth aperture';
  if (eyes < 0.32) return 'slow blink';
  if (emotion.emotion === 'focused') return 'steady focus';
  if (emotion.emotion === 'calm') return 'soft focus';
  return 'neutral gaze';
};

const createInteractionSample = (): InteractionSample => ({
  pointerX: null,
  pointerY: null,
  mouseMovement: 0,
  clickCount: 0,
  keyCount: 0,
  correctionCount: 0,
  windowFocusChanges: 0,
  lastActivityAt: performance.now(),
  sampleStartedAt: performance.now(),
});

export const WebcamPanel = () => {
  const {
    data,
    systemState,
    connectionStatus,
    lastEmotion,
    sendEmotionFrame,
    sendBehaviorTelemetry,
    addLog,
  } = useCognitive();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gazeRef = useRef<GazePoint>({ x: 0, y: 0, confidence: 0, source: 'pending' });
  const interactionRef = useRef<InteractionSample>(createInteractionSample());
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('starting');
  const [analysisSource, setAnalysisSource] = useState('syncing');
  const [gaze, setGaze] = useState<GazePoint>({ x: 0, y: 0, confidence: 0, source: 'pending' });
  const [webcamEmotion, setWebcamEmotion] = useState<EmotionAnalysisResponse | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);

  useEffect(() => {
    gazeRef.current = gaze;
  }, [gaze]);

  useEffect(() => {
    const markActivity = () => {
      interactionRef.current.lastActivityAt = performance.now();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const sample = interactionRef.current;
      if (sample.pointerX !== null && sample.pointerY !== null) {
        sample.mouseMovement += Math.hypot(event.clientX - sample.pointerX, event.clientY - sample.pointerY);
      }
      sample.pointerX = event.clientX;
      sample.pointerY = event.clientY;
      markActivity();
    };

    const handleClick = () => {
      interactionRef.current.clickCount += 1;
      markActivity();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      interactionRef.current.keyCount += 1;
      if (event.key === 'Backspace' || event.key === 'Delete') {
        interactionRef.current.correctionCount += 1;
      }
      markActivity();
    };

    const handleVisibilityChange = () => {
      interactionRef.current.windowFocusChanges += 1;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('blur', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (cameraStatus !== 'active') {
      setCalibrationProgress(0);
      return;
    }

    const startedAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      setCalibrationProgress(clamp((elapsed / CALIBRATION_DURATION_MS) * 100, 0, 100));
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [cameraStatus]);

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('unavailable');
        addLog('Camera capture unavailable; backend emotion simulation remains active.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraStatus('active');
        addLog('Camera feed connected to OpenCV analysis endpoint.');
      } catch {
        setCameraStatus('unavailable');
        addLog('Camera permission denied or device unavailable; backend emotion simulation remains active.');
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [addLog]);

  useEffect(() => {
    if (cameraStatus !== 'active') return;
    let busy = false;

    const analyzeFrame = async () => {
      if (busy || !videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return;
      busy = true;
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const sourceWidth = video.videoWidth || 640;
        const sourceHeight = video.videoHeight || 360;
        const scale = Math.min(1, 640 / Math.max(1, sourceWidth));
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.68);
        const response = await sendEmotionFrame(imageBase64, {
          source: 'webcam_panel',
          camera_status: cameraStatus,
          gaze_source: gazeRef.current.source,
        });
        setGaze(gazeFromEmotion(response));
        setWebcamEmotion(response);
        setAnalysisSource(response.source);
      } catch {
        setAnalysisSource('unavailable');
        setGaze((current) => ({ ...current, confidence: 0, source: 'unavailable' }));
        setWebcamEmotion(null);
      } finally {
        busy = false;
      }
    };

    const firstFrame = window.setTimeout(() => void analyzeFrame(), 1200);
    const interval = window.setInterval(() => void analyzeFrame(), 2000);
    return () => {
      window.clearTimeout(firstFrame);
      window.clearInterval(interval);
    };
  }, [cameraStatus, sendEmotionFrame]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentGaze = gazeRef.current;
      const gazeDeviation = Math.min(1, Math.hypot(currentGaze.x, currentGaze.y) / Math.SQRT2);
      const hasBackendGaze = currentGaze.source !== 'pending' && currentGaze.source !== 'unavailable';
      const sample = interactionRef.current;
      const now = performance.now();
      const sampleMinutes = Math.max(0.01, (now - sample.sampleStartedAt) / 60000);
      const inactivitySeconds = Math.max(0, (now - sample.lastActivityAt) / 1000);
      const typingSpeed = sample.keyCount / sampleMinutes;
      const clickFrequency = sample.clickCount / sampleMinutes;
      const correctionRate = sample.correctionCount / sampleMinutes;
      const mouseVelocity = sample.mouseMovement / Math.max(0.1, (now - sample.sampleStartedAt) / 1000);
      const hesitationFromFace = currentGaze.confidence > 0 ? (1 - currentGaze.confidence) * 450 : 0;

      void sendBehaviorTelemetry({
        typing_speed: typingSpeed,
        mouse_movement: sample.mouseMovement,
        mouse_velocity: mouseVelocity,
        click_frequency: clickFrequency,
        inactivity_seconds: inactivitySeconds,
        tab_switches: document.visibilityState === 'hidden' ? 1 : 0,
        hesitation_ms: Math.max(inactivitySeconds * 120, hesitationFromFace),
        window_focus_changes: sample.windowFocusChanges + (document.hasFocus() ? 0 : 1),
        correction_rate: correctionRate,
        gaze_x: hasBackendGaze ? currentGaze.x : null,
        gaze_y: hasBackendGaze ? currentGaze.y : null,
        gaze_deviation: gazeDeviation,
        eye_tracking_confidence: currentGaze.confidence,
        metadata: {
          source: 'live_interaction_and_backend_face_mesh',
          gaze_source: currentGaze.source,
          camera_status: cameraStatus,
          connection_status: connectionStatus,
        },
      });

      interactionRef.current = {
        ...createInteractionSample(),
        pointerX: sample.pointerX,
        pointerY: sample.pointerY,
        lastActivityAt: sample.lastActivityAt,
      };
    }, BEHAVIOR_SAMPLE_MS);

    return () => window.clearInterval(interval);
  }, [cameraStatus, connectionStatus, sendBehaviorTelemetry]);

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

  const isCalibrating = cameraStatus === 'active' && calibrationProgress < 100;
  const calibrationValue = (value: string) => (isCalibrating ? 'CALIBRATING' : value);
  const hudEmotion = webcamEmotion ?? lastEmotion;
  const microExpression = microExpressionLabel(hudEmotion);
  const gazeDeviation = Math.min(100, Math.round((Math.hypot(gaze.x, gaze.y) / Math.SQRT2) * 100));
  const stressMarker = data.stressLevel > 60 ? 'Active' : 'Nominal';
  const gazeVector = `X:${gaze.x.toFixed(2)} Y:${gaze.y.toFixed(2)}`;

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
          cameraStatus === 'active' ? 'bg-[#00f0ff]' : 'bg-[#ff3264]'
        )} />
        <span className="text-xs font-mono uppercase text-white/50">{cameraStatus === 'active' ? (isCalibrating ? 'CAL' : 'REC') : 'SYNC'}</span>
      </div>

      <div className="relative w-full aspect-[4/3] md:aspect-video bg-black/60 rounded-[22px] overflow-hidden">
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 h-full w-full object-cover opacity-80 filter contrast-110 brightness-90 saturate-110",
            cameraStatus !== 'active' && "hidden"
          )}
          muted
          playsInline
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" />
        {cameraStatus !== 'active' && (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.14),transparent_52%),linear-gradient(135deg,rgba(180,100,255,0.18),rgba(0,0,0,0.9))]" />
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
        
        <motion.div 
          className={cn(
            "absolute left-0 right-0 h-[2px] blur-[1px] shadow-[0_0_10px_currentColor]",
            getStatusColor()
          )}
          animate={{ top: ['0%', '100%', '0%'] }}
          transition={{ duration: 4, ease: "linear", repeat: Infinity }}
        />

        <div className="absolute inset-0 flex items-center justify-center">
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
                
                <Focus className={cn("w-8 h-8 opacity-50 absolute top-4 left-4", getStatusColor())} />
                <Focus className={cn("w-8 h-8 opacity-50 absolute top-4 right-4 rotate-90", getStatusColor())} />
                <Focus className={cn("w-8 h-8 opacity-50 absolute bottom-4 left-4 -rotate-90", getStatusColor())} />
                <Focus className={cn("w-8 h-8 opacity-50 absolute bottom-4 right-4 rotate-180", getStatusColor())} />
                
                <motion.div 
                  className={cn("absolute w-2 h-2 rounded-full", getBgColor())}
                  animate={{ x: gaze.x * GAZE_DISPLAY_RANGE, y: gaze.y * GAZE_DISPLAY_RANGE }}
                  transition={{ type: 'spring', stiffness: 50, damping: 10 }}
                >
                  <motion.div 
                    className={cn("absolute top-1/2 left-1/2 w-[1px] h-12 origin-top opacity-50", getBgColor())}
                    animate={{ rotate: Math.atan2(gaze.y, gaze.x) * (180 / Math.PI) - 90 }}
                  />
                </motion.div>

                <ScanFace className="w-24 h-24 text-white/10" strokeWidth={1} />
            </div>
            
            <Crosshair className={cn("absolute w-6 h-6 opacity-40", getStatusColor())} />
        </div>

        {isCalibrating && (
          <div className="absolute left-6 right-6 bottom-20 z-20 pointer-events-none">
            <div className="mx-auto max-w-sm border border-white/10 bg-black/55 backdrop-blur-md px-3 py-2 rounded">
              <div className="flex items-center justify-between gap-3">
                <span className={cn("text-[10px] font-mono uppercase tracking-widest", getStatusColor())}>Calibrating</span>
                <span className="text-[10px] font-mono text-white/60">{Math.round(calibrationProgress)}%</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={cn("h-full rounded-full", getBgColor())}
                  initial={false}
                  animate={{ width: `${calibrationProgress}%` }}
                  transition={{ duration: 0.2, ease: 'linear' }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
           <HUDMetric label="Eye Confidence" value={calibrationValue(`${Math.round(gaze.confidence * 100)}%`)} />
           <HUDMetric label="Micro-expressions" value={calibrationValue(microExpression)} />
           <HUDMetric label="Gaze Deviation" value={calibrationValue(`${gazeDeviation}%`)} />
           <HUDMetric label="Gaze Vector" value={calibrationValue(gazeVector)} icon={<ArrowUpRight className="w-3 h-3" />} />
        </div>

        <div className="absolute bottom-4 right-4 flex flex-col gap-1 items-end text-right z-10">
           <HUDMetric label="Session" value={connectionStatus === 'connected' ? 'Verified' : 'Pending'} icon={<Fingerprint className="w-3 h-3" />} />
           <HUDMetric label="Cognitive Load" value={calibrationValue(`${data.cognitiveLoad.toFixed(1)}%`)} />
           <HUDMetric label="Stress Markers" value={calibrationValue(stressMarker)}
              color={isCalibrating ? 'text-white' : data.stressLevel > 60 ? 'text-[#ff3264]' : 'text-[#00f0ff]'}
           />
           <HUDMetric label="Analysis" value={isCalibrating ? 'CALIBRATING' : analysisSource} />
        </div>

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
