import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, MessageSquare, Mic, Cpu, ArrowRight, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useCognitive } from '../../context/CognitiveContext';
import { cn } from '../../lib/utils';

export const AssistantPanel = () => {
  const { systemState, data } = useCognitive();
  const [messages, setMessages] = useState([
    { id: 1, type: 'ai', text: 'Cognitive synchronization complete. How can I assist you today?', state: 'NORMAL' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    let newMessage = '';
    
    if (systemState === 'STRESS') {
      newMessage = "I'm detecting elevated stress markers. Let's slow down. I've broken down your current tasks into smaller, manageable steps.";
    } else if (systemState === 'OVERLOAD') {
      newMessage = "Cognitive overload detected. I am silencing non-critical notifications and simplifying the interface. Take a deep breath.";
    } else if (systemState === 'FOCUS') {
      newMessage = "Deep focus state recognized. Extraneous UI minimized. Ready for high-density information transfer.";
    }

    if (newMessage) {
      setIsTyping(true);
      const timer = setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), type: 'ai', text: newMessage, state: systemState }]);
        setIsTyping(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [systemState]);

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
          <span className="text-white/40">Confidence:</span>
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
          {isTyping && (
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
        <div className="relative flex items-center">
          <input 
            type="text" 
            placeholder={systemState === 'OVERLOAD' ? "System managing tasks. Input restricted." : "Synthesize your intent..."}
            disabled={systemState === 'OVERLOAD'}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-[#00f0ff]/50 transition-colors disabled:opacity-50"
          />
          <button className="absolute right-2 p-2 rounded-lg bg-white/10 hover:bg-[#00f0ff]/20 hover:text-[#00f0ff] transition-colors">
            <Mic className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
