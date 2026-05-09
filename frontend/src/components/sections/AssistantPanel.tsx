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

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: { transcript: string };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
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
    humeStatus,
    analyzeTextEmotion,
    sendAssistantMessage,
    synthesizeVoice,
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
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const addAssistantNotice = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: Date.now(), type: 'ai', text, state: systemState }]);
  }, [systemState]);

  const stopMediaResources = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // The recorder may already be stopped by the browser when the socket closes.
      }
    }
    recorderRef.current = null;
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }, []);

  const stopVoiceCapture = useCallback(() => {
    const socket = humeSocketRef.current;
    humeSocketRef.current = null;
    stopMediaResources();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'hume.evi.close', payload: {} }));
    }
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close();
    }
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }
    }
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
    setIsListening(false);
  }, [stopMediaResources]);

  const playBrowserSpeech = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = systemState === 'STRESS' || systemState === 'OVERLOAD' ? 0.92 : 1;
    utterance.pitch = systemState === 'FOCUS' ? 1.05 : 1;
    window.speechSynthesis.speak(utterance);
    return true;
  }, [systemState]);

  const playAssistantAudio = useCallback(
    async (text: string) => {
      const cleanText = text.trim();
      if (!cleanText) return;

      currentAudioRef.current?.pause();
      currentAudioRef.current = null;

      try {
        const response = await synthesizeVoice(cleanText, { source: 'assistant_panel' });
        const chunks = Array.isArray(response.audio_chunks)
          ? response.audio_chunks.filter((chunk): chunk is string => typeof chunk === 'string' && Boolean(chunk))
          : [];
        const mimeType = typeof response.mime_type === 'string' ? response.mime_type : 'audio/wav';

        if (chunks.length) {
          for (const chunk of chunks) {
            const player = new Audio(`data:${mimeType};base64,${chunk}`);
            currentAudioRef.current = player;
            await player.play();
            await new Promise<void>((resolve) => {
              player.onended = () => resolve();
              player.onerror = () => resolve();
            });
          }
          return;
        }
      } catch {
        addLog('ERROR: Hume voice synthesis failed; using browser speech output.');
      }

      if (!playBrowserSpeech(cleanText)) {
        addLog('ERROR: Audio output is unavailable in this browser.');
      }
    },
    [addLog, playBrowserSpeech, synthesizeVoice],
  );

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
        void playAssistantAudio(response.response);
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
    [analyzeTextEmotion, playAssistantAudio, sendAssistantMessage, systemState],
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

    const startBrowserSpeechCapture = () => {
      const SpeechRecognition =
        (window as WindowWithSpeechRecognition).SpeechRecognition ||
        (window as WindowWithSpeechRecognition).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        addLog('ERROR: Speech recognition is unavailable in this browser.');
        addAssistantNotice('Microphone input is unavailable in this browser. You can still type your message and I will answer with audio.');
        return false;
      }

      const recognition = new SpeechRecognition();
      speechRecognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';
      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript || '';
          if (result.isFinal) finalTranscript += transcript;
          else interimTranscript += transcript;
        }
        const visibleTranscript = (finalTranscript || interimTranscript).trim();
        if (visibleTranscript) setInputValue(visibleTranscript);
        if (finalTranscript.trim()) void submitMessage(finalTranscript.trim());
      };
      recognition.onerror = () => {
        addLog('ERROR: Browser speech recognition failed.');
        addAssistantNotice('I could not start microphone transcription. Please check browser microphone permission, or type your message.');
        stopVoiceCapture();
      };
      recognition.onend = () => {
        if (speechRecognitionRef.current === recognition) {
          speechRecognitionRef.current = null;
          setIsListening(false);
        }
      };

      try {
        recognition.start();
        setIsListening(true);
        addLog('Browser speech recognition listening.');
        return true;
      } catch {
        addLog('ERROR: Browser speech recognition could not start.');
        addAssistantNotice('I could not start microphone transcription. Please check browser microphone permission, or type your message.');
        speechRecognitionRef.current = null;
        setIsListening(false);
        return false;
      }
    };

    if (humeStatus?.configured !== true) {
      startBrowserSpeechCapture();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      startBrowserSpeechCapture();
      return;
    }

    try {
      const socket = openHumeEviSocket();
      humeSocketRef.current = socket;
      setIsListening(true);

      socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          const payload = envelope.payload || {};
          if (envelope.type === 'hume.evi.status' && payload.configured === false) {
            socket.close();
            humeSocketRef.current = null;
            stopMediaResources();
            startBrowserSpeechCapture();
            return;
          }
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
            void playAssistantAudio(String(payload.text));
          }
          if (envelope.type === 'hume.audio_output') {
            const audio = payload.data || payload.audio;
            if (audio) {
              currentAudioRef.current?.pause();
              const player = new Audio(`data:audio/wav;base64,${audio}`);
              currentAudioRef.current = player;
              void player.play().catch(() => undefined);
            }
          }
          if (envelope.type === 'hume.evi.error') {
            addLog(`ERROR: ${String(payload.message || 'Voice stream failed')}`);
            addAssistantNotice('Realtime voice could not connect. Falling back to browser microphone transcription.');
            socket.close();
            humeSocketRef.current = null;
            stopMediaResources();
            startBrowserSpeechCapture();
          }
        } catch {
          addLog('ERROR: Malformed voice stream event.');
        }
      };

      socket.onopen = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (humeSocketRef.current !== socket || socket.readyState !== WebSocket.OPEN) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          audioStreamRef.current = stream;
          const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined;
          const recorder = new MediaRecorder(stream, options);
          recorderRef.current = recorder;
          recorder.ondataavailable = async (audioEvent) => {
            if (!audioEvent.data.size || socket.readyState !== WebSocket.OPEN) return;
            try {
              const data = await blobToBase64(audioEvent.data);
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'audio_input', payload: { data } }));
              }
            } catch {
              addLog('ERROR: Unable to encode microphone chunk.');
            }
          };
          recorder.start(750);
          setIsListening(true);
          addLog('Voice stream connected to Hume EVI proxy.');
        } catch {
          addLog('ERROR: Microphone permission or voice stream setup failed.');
          stopMediaResources();
          startBrowserSpeechCapture();
        }
      };

      socket.onerror = () => {
        addLog('ERROR: Voice stream socket failed.');
        addAssistantNotice('Realtime voice could not connect. Falling back to browser microphone transcription.');
        humeSocketRef.current = null;
        stopMediaResources();
        startBrowserSpeechCapture();
      };

      socket.onclose = () => {
        if (humeSocketRef.current !== socket) return;
        humeSocketRef.current = null;
        stopMediaResources();
        setIsListening(false);
      };
    } catch {
      addLog('ERROR: Microphone permission or voice stream setup failed.');
      startBrowserSpeechCapture();
    }
  }, [
    addAssistantNotice,
    addLog,
    humeStatus?.configured,
    isListening,
    playAssistantAudio,
    stopMediaResources,
    stopVoiceCapture,
    submitMessage,
    systemState,
  ]);

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
            placeholder={
              systemState === 'OVERLOAD'
                ? "System managing tasks. Input restricted."
                : isListening
                  ? "Listening..."
                  : "Synthesize your intent..."
            }
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
