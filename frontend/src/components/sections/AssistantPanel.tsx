import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Mic, Cpu, Send, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useCognitive, SystemState } from '../../context/CognitiveContext';
import { openHumeEviSocket } from '../../services/humintosApi';
import { cn } from '../../lib/utils';

type ChatMessage = {
  id: number;
  type: 'ai' | 'user';
  text: string;
  state: SystemState;
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Unable to encode microphone chunk.'));
    reader.readAsDataURL(blob);
  });

export const AssistantPanel = () => {
  const {
    systemState,
    data,
    assistantStatus,
    connectionStatus,
    analyzeTextEmotion,
    sendAssistantMessage,
    addLog,
  } = useCognitive();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, type: 'ai', text: 'Cognitive synchronization complete. How can I assist you today?', state: 'NORMAL' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const humeSocketRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const stopVoiceCapture = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    if (humeSocketRef.current?.readyState === WebSocket.OPEN) {
      humeSocketRef.current.send(JSON.stringify({ type: 'hume.evi.close', payload: {} }));
    }
    humeSocketRef.current?.close();
    humeSocketRef.current = null;
    setIsListening(false);
  }, []);

  const submitMessage = useCallback(
    async (messageText: string) => {
      const cleanText = messageText.trim();
      if (!cleanText || systemState === 'OVERLOAD') return;

      setMessages((prev) => [...prev, { id: Date.now(), type: 'user', text: cleanText, state: systemState }]);
      setInputValue('');
      setIsTyping(true);

      try {
        await analyzeTextEmotion(cleanText, true, { source: 'assistant_input' });
        const response = await sendAssistantMessage(cleanText);
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, type: 'ai', text: response.response, state: systemState },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            type: 'ai',
            text: 'I could not reach the HumIntOS backend for that response. The realtime stream will retry automatically.',
            state: systemState,
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [analyzeTextEmotion, sendAssistantMessage, systemState],
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitMessage(inputValue);
  };

  const startVoiceCapture = useCallback(async () => {
    if (isListening) {
      stopVoiceCapture();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      addLog('ERROR: Browser microphone capture is unavailable.');
      return;
    }

    try {
      const socket = openHumeEviSocket();
      humeSocketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          const payload = envelope.payload || {};
          if (envelope.type === 'hume.transcription' && payload.text) {
            const transcript = String(payload.text);
            setInputValue(transcript);
            if (!payload.interim) void submitMessage(transcript);
          }
          if (envelope.type === 'hume.assistant_message' && payload.text) {
            setMessages((prev) => [
              ...prev,
              { id: Date.now(), type: 'ai', text: String(payload.text), state: systemState },
            ]);
          }
          if (envelope.type === 'hume.audio_output') {
            const audio = payload.data || payload.audio;
            if (audio) {
              void new Audio(`data:audio/wav;base64,${audio}`).play().catch(() => undefined);
            }
          }
          if (envelope.type === 'hume.evi.error') addLog(`ERROR: ${String(payload.message || 'Voice stream failed')}`);
        } catch {
          addLog('ERROR: Malformed voice stream event.');
        }
      };

      socket.onopen = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
        const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined;
        const recorder = new MediaRecorder(stream, options);
        recorderRef.current = recorder;
        recorder.ondataavailable = async (audioEvent) => {
          if (!audioEvent.data.size || socket.readyState !== WebSocket.OPEN) return;
          const data = await blobToBase64(audioEvent.data);
          socket.send(JSON.stringify({ type: 'audio_input', payload: { data } }));
        };
        recorder.start(750);
        setIsListening(true);
        addLog('Voice stream connected to Hume EVI proxy.');
      };

      socket.onerror = () => {
        addLog('ERROR: Voice stream socket failed.');
        stopVoiceCapture();
      };

      socket.onclose = () => {
        setIsListening(false);
      };
    } catch {
      addLog('ERROR: Microphone permission or voice stream setup failed.');
      stopVoiceCapture();
    }
  }, [addLog, isListening, stopVoiceCapture, submitMessage, systemState]);

  useEffect(() => stopVoiceCapture, [stopVoiceCapture]);

  return (
    <motion.div 
      layout
      className={cn(
        "glass-panel rounded-3xl flex flex-col relative overflow-hidden transition-all duration-700 h-[400px] md:h-[500px]",
        systemState === 'FOCUS' ? "border-[#00f0ff]/30 shadow-[0_0_30px_rgba(0,240,255,0.1)]" :
        systemState === 'STRESS' ? "border-[#ff9632]/30 shadow-[0_0_30px_rgba(255,150,50,0.1)]" :
        "border-white/10"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Cpu className={cn(
               "w-5 h-5",
               systemState === 'FOCUS' ? 'text-[#00f0ff]' :
               systemState === 'STRESS' ? 'text-[#ff9632]' :
               systemState === 'OVERLOAD' ? 'text-[#ff3264]' : 'text-[#b464ff]'
            )} />
            <motion.div 
              className="absolute inset-0 bg-current blur-sm rounded-full opacity-50"
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <span className="font-medium tracking-tight">Adaptive Core</span>
        </div>
        <div className="flex gap-2 text-xs font-mono">
          <span className="text-white/40">{assistantStatus === 'thinking' ? 'Thinking' : connectionStatus}</span>
          <span className="text-[#00f0ff]">{data.intentConfidence.toFixed(1)}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "max-w-[85%] rounded-2xl p-4 text-sm font-light leading-relaxed group",
                msg.type === 'ai' ? 
                  (msg.state === 'STRESS' ? "bg-gradient-to-br from-[#ff9632]/10 to-transparent border border-[#ff9632]/20 text-white/90" : 
                   msg.state === 'OVERLOAD' ? "bg-gradient-to-br from-[#ff3264]/10 to-transparent border border-[#ff3264]/20 text-white" :
                   msg.state === 'FOCUS' ? "bg-[#00f0ff]/5 border border-[#00f0ff]/20 text-[#00f0ff]/90" :
                   "bg-white/5 border border-white/10 text-white/80") : 
                  "bg-white/10 self-end ml-auto"
              )}
            >
              <div className="flex gap-2">
                {msg.type === 'ai' && <Sparkles className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />}
                <div className="flex-1">
                  <p>{msg.text}</p>
                  {msg.type === 'ai' && (
                    <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button className="p-1 rounded-sm hover:bg-white/10 transition-colors text-white/40 hover:text-white">
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button className="p-1 rounded-sm hover:bg-white/10 transition-colors text-white/40 hover:text-white">
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          {(isTyping || assistantStatus === 'thinking') && (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex gap-1.5 p-4 bg-white/5 w-fit rounded-2xl border border-white/10"
            >
              <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
              <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
              <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 border-t border-white/5 bg-black/20">
        <form className="relative flex items-center" onSubmit={handleSubmit}>
          <input 
            type="text" 
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder={systemState === 'OVERLOAD' ? "System managing tasks. Input restricted." : "Synthesize your intent..."}
            disabled={systemState === 'OVERLOAD'}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-24 text-sm focus:outline-none focus:border-[#00f0ff]/50 transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void startVoiceCapture()}
            disabled={systemState === 'OVERLOAD'}
            className={cn(
              "absolute right-11 p-2 rounded-lg bg-white/10 hover:bg-[#00f0ff]/20 hover:text-[#00f0ff] transition-colors disabled:opacity-40",
              isListening && "bg-[#00f0ff]/20 text-[#00f0ff]"
            )}
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={!inputValue.trim() || systemState === 'OVERLOAD' || isTyping}
            className="absolute right-2 p-2 rounded-lg bg-white/10 hover:bg-[#00f0ff]/20 hover:text-[#00f0ff] transition-colors disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </motion.div>
  );
};
