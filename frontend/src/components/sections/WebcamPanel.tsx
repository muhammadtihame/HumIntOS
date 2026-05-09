import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, ScanFace, Focus, Fingerprint, Crosshair, ArrowUpRight } from 'lucide-react';
import { useCognitive } from '../../context/CognitiveContext';
import { cn } from '../../lib/utils';

type CameraStatus = 'starting' | 'active' | 'unavailable';

type GazePoint = {
  x: number;
  y: number;
  confidence: number;
  source: 'webgazer' | 'pending' | 'unavailable';
};

declare global {
  interface Window {
    webgazer?: {
      begin: () => Promise<void> | void;
      setGazeListener: (listener: (data: { x: number; y: number } | null) => void) => Window['webgazer'];
      clearGazeListener?: () => void;
      showVideo?: (show: boolean) => Window['webgazer'];
      showFaceOverlay?: (show: boolean) => Window['webgazer'];
      showFaceFeedbackBox?: (show: boolean) => Window['webgazer'];
      pause?: () => void;
    };
  }
}

const loadWebGazer = () =>
  new Promise<void>((resolve, reject) => {
    if (window.webgazer) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-humintos-webgazer]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('WebGazer failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://webgazer.cs.brown.edu/webgazer.js';
    script.async = true;
    script.dataset.humintosWebgazer = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('WebGazer failed to load.'));
    document.head.appendChild(script);
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
  const dataRef = useRef(data);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('starting');
  const [analysisSource, setAnalysisSource] = useState('syncing');
  const [gaze, setGaze] = useState<GazePoint>({ x: 0, y: 0, confidence: 0, source: 'pending' });

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    gazeRef.current = gaze;
  }, [gaze]);

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
    let cancelled = false;

    const startWebGazer = async () => {
      try {
        await loadWebGazer();
        if (cancelled || !window.webgazer) return;
        window.webgazer
          .showVideo?.(false)
          ?.showFaceOverlay?.(false)
          ?.showFaceFeedbackBox?.(false)
          ?.setGazeListener((prediction) => {
            if (!prediction) return;
            const x = prediction.x - window.innerWidth / 2;
            const y = prediction.y - window.innerHeight / 2;
            const displayX = Math.max(-40, Math.min(40, (x / Math.max(1, window.innerWidth / 2)) * 40));
            const displayY = Math.max(-40, Math.min(40, (y / Math.max(1, window.innerHeight / 2)) * 40));
            setGaze({ x: displayX, y: displayY, confidence: 1, source: 'webgazer' });
          });
        await window.webgazer.begin();
      } catch {
        setGaze({ x: 0, y: 0, confidence: 0, source: 'unavailable' });
        addLog('WebGazer eye-tracking unavailable in this browser session.');
      }
    };

    void startWebGazer();

    return () => {
      cancelled = true;
      window.webgazer?.clearGazeListener?.();
      window.webgazer?.pause?.();
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
          webgazer_source: gazeRef.current.source,
        });
        setAnalysisSource(response.source);
      } catch {
        setAnalysisSource('unavailable');
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
      const currentData = dataRef.current;
      const gazeDeviation = Math.min(1, Math.hypot(currentGaze.x, currentGaze.y) / 56);
      void sendBehaviorTelemetry({
        typing_speed: Math.max(0, currentData.focusLevel * 1.55),
        mouse_movement: gazeDeviation * 900,
        mouse_velocity: gazeDeviation * 680,
        click_frequency: currentData.stressLevel > 70 ? 22 : 8,
        inactivity_seconds: gazeDeviation > 0.72 ? 7 : 0.6,
        tab_switches: gazeDeviation > 0.78 ? 1 : 0,
        hesitation_ms: currentData.hesitationLevel * 18,
        window_focus_changes: document.hasFocus() ? 0 : 1,
        correction_rate: Math.max(0, currentData.cognitiveLoad - currentData.focusLevel) / 5,
        gaze_x: currentGaze.x,
        gaze_y: currentGaze.y,
        gaze_deviation: gazeDeviation,
        eye_tracking_confidence: currentGaze.confidence,
        metadata: {
          source: 'webgazer',
          camera_status: cameraStatus,
          connection_status: connectionStatus,
        },
      });
    }, 3000);

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

  const microExpression = lastEmotion?.emotion || (data.emotionalStability > 80 ? 'stable' : 'volatile');
  const gazeDeviation = Math.min(100, Math.round((Math.hypot(gaze.x, gaze.y) / 56) * 100));

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
        <span className="text-xs font-mono uppercase text-white/50">{cameraStatus === 'active' ? 'REC' : 'SYNC'}</span>
      </div>

      <div className="relative w-full aspect-[4/3] md:aspect-video bg-black/60 rounded-[22px] overflow-hidden">
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-luminosity filter contrast-150 brightness-50",
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
            
            <Crosshair className={cn("absolute w-6 h-6 opacity-40", getStatusColor())} />
        </div>

        <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
           <HUDMetric label="Eye Confidence" value={`${Math.round(gaze.confidence * 100)}%`} />
           <HUDMetric label="Micro-expressions" value={microExpression} />
           <HUDMetric label="Gaze Deviation" value={`${gazeDeviation}%`} />
           <HUDMetric label="Gaze Vector" value={`X:${gaze.x.toFixed(0)} Y:${gaze.y.toFixed(0)}`} icon={<ArrowUpRight className="w-3 h-3" />} />
        </div>

        <div className="absolute bottom-4 right-4 flex flex-col gap-1 items-end text-right z-10">
           <HUDMetric label="Session" value={connectionStatus === 'connected' ? 'Verified' : 'Pending'} icon={<Fingerprint className="w-3 h-3" />} />
           <HUDMetric label="Cognitive Load" value={`${data.cognitiveLoad.toFixed(1)}%`} />
           <HUDMetric label="Stress Markers" value={data.stressLevel > 60 ? 'Active' : 'Nominal'} 
              color={data.stressLevel > 60 ? 'text-[#ff3264]' : 'text-[#00f0ff]'}
           />
           <HUDMetric label="Analysis" value={analysisSource} />
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
