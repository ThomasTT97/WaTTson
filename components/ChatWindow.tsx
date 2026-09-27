import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Activity, 
  ChatMessage, 
  Wellness, 
  AnnualPowerCurve, 
  WeeklyBriefing, 
  DailySuggestion 
} from '../types';
import { streamChatMessage } from '../services/geminiService';
import { 
  Bot, 
  Send, 
  Square, 
  Sparkles, 
  Copy, 
  Check, 
  ChevronDown, 
  Calendar, 
  Zap, 
  TrendingUp, 
  X, 
  Flame, 
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';

interface ChatWindowProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isChatLoading: boolean;
  setIsChatLoading: (loading: boolean) => void;
  chatContextSummary: {
    dayLabel: string;
    todayText: string;
    tomorrowText: string;
  };
  userGoal: string;
  stats: {
    total7DayLoad: number;
    readiness: number;
    avgWeeklyLoad?: number;
    [key: string]: any;
  };
  suggestion: DailySuggestion | null;
  activities: Activity[] | null;
  wellnessData: Wellness[];
  powerCurves: AnnualPowerCurve[];
  weeklyBriefing: WeeklyBriefing | null;
  planContext: string | null;
  ftp: number | null;
  currentUser: FirebaseUser | null;
  handleAddTweakFromApp: (directiveText: string, duration?: number, isScheduleUpdate?: boolean) => void;
  safeSetItem: (key: string, value: string) => void;
  syncToCloud: (data: { chatHistoryJson: string }) => void;
  saveUserCloudProfile: (uid: string, data: { chatHistoryJson: string }) => Promise<any>;
  getChatStorageKey: (uid?: string | null) => string;
  getChatClearedKey: (uid?: string | null) => string;
  isKeyboardOpen: boolean;
  setIsKeyboardOpen: (open: boolean) => void;
}

const QUICK_TOPICS = [
  { label: "Today's Ride", query: "What should I focus on for today's session based on my readiness?", icon: <Zap size={14} /> },
  { label: "Training Load", query: "How is my current training load and fatigue trending?", icon: <TrendingUp size={14} /> },
  { label: "Review Week", query: "Can you analyze my recent rides and key intervals?", icon: <Calendar size={14} /> },
  { label: "Power Curve", query: "What are my recent power breakthroughs and milestones?", icon: <Flame size={14} /> }
];

export const ChatWindow: React.FC<ChatWindowProps> = (props) => {
  const {
    messages,
    setMessages,
    isChatLoading,
    setIsChatLoading,
    chatContextSummary,
    userGoal,
    stats,
    suggestion,
    activities,
    wellnessData,
    powerCurves,
    weeklyBriefing,
    planContext,
    ftp,
    currentUser,
    handleAddTweakFromApp,
    safeSetItem,
    syncToCloud,
    saveUserCloudProfile,
    getChatStorageKey,
    getChatClearedKey,
    isKeyboardOpen,
    setIsKeyboardOpen
  } = props;

  const [chatInput, setChatInput] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Smooth typing buffer state
  const targetTextRef = useRef<string>('');
  const currentRenderedTextRef = useRef<string>('');
  const animationFrameRef = useRef<number | null>(null);
  const isStreamCompleteRef = useRef<boolean>(false);
  const onTypingCompleteRef = useRef<(() => void) | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceToBottom < 100;
    setIsNearBottom(nearBottom);
    setShowScrollBottomBtn(!nearBottom && el.scrollHeight > el.clientHeight + 100);
  }, []);

  // Smooth progressive text reveal loop
  const startSmoothTyping = useCallback((onComplete: () => void) => {
    onTypingCompleteRef.current = onComplete;
    isStreamCompleteRef.current = false;

    const tick = () => {
      const target = targetTextRef.current;
      const current = currentRenderedTextRef.current;

      if (current.length < target.length) {
        const remaining = target.length - current.length;
        const step = Math.max(1, Math.min(14, Math.ceil(remaining / 5)));
        const nextLen = Math.min(target.length, current.length + step);
        const nextText = target.substring(0, nextLen);
        currentRenderedTextRef.current = nextText;

        setMessages(prev => {
          if (prev.length === 0) return prev;
          const copy = [...prev];
          const lastIdx = copy.length - 1;
          if (copy[lastIdx].role === 'model') {
            copy[lastIdx] = {
              ...copy[lastIdx],
              text: nextText
            };
          }
          return copy;
        });

        if (isNearBottom) {
          scrollToBottom(false);
        }

        animationFrameRef.current = requestAnimationFrame(tick);
      } else if (isStreamCompleteRef.current) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (onTypingCompleteRef.current) {
          const cb = onTypingCompleteRef.current;
          onTypingCompleteRef.current = null;
          cb();
        }
      } else {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [isNearBottom, scrollToBottom, setMessages]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamCompleteRef.current = true;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const flushedText = targetTextRef.current;
    if (flushedText) {
      setMessages(prev => {
        if (prev.length === 0) return prev;
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (copy[lastIdx].role === 'model') {
          copy[lastIdx] = {
            ...copy[lastIdx],
            text: flushedText
          };
        }
        return copy;
      });
    }
    setIsChatLoading(false);
    setStreamingMessageId(null);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isChatLoading) return;

    const activeUid = currentUser?.uid;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getChatClearedKey(activeUid));
    }

    const userMsg: ChatMessage = { role: 'user', text: text.trim(), timestamp: Date.now() };
    const emptyModelMsg: ChatMessage = { 
      role: 'model', 
      text: '', 
      timestamp: Date.now(),
      id: `msg_${Date.now()}` 
    };

    setMessages(prev => [...prev, userMsg, emptyModelMsg]);
    setChatInput('');
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
    }

    setIsChatLoading(true);
    setStreamingMessageId(emptyModelMsg.id || 'current');

    targetTextRef.current = '';
    currentRenderedTextRef.current = '';
    isStreamCompleteRef.current = false;

    setTimeout(() => scrollToBottom(true), 60);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    startSmoothTyping(() => {
      const fullText = targetTextRef.current;
      const planUpdateIdx = fullText.indexOf('[UPDATE_PLAN:');
      if (planUpdateIdx !== -1) {
        const closingIdx = fullText.indexOf(']', planUpdateIdx);
        if (closingIdx !== -1) {
          const directive = fullText.substring(planUpdateIdx + 13, closingIdx).trim();
          if (directive) {
            handleAddTweakFromApp(directive, undefined, false);
          }
        }
      }

      setIsChatLoading(false);
      setStreamingMessageId(null);

      setMessages(currentMsgs => {
        const key = getChatStorageKey(activeUid);
        safeSetItem(key, JSON.stringify(currentMsgs.slice(-50)));
        if (!activeUid) {
          safeSetItem('wattson_chat_history', JSON.stringify(currentMsgs.slice(-50)));
        }
        if (currentUser) {
          saveUserCloudProfile(currentUser.uid, {
            chatHistoryJson: JSON.stringify(currentMsgs.slice(-50))
          }).catch(console.error);
        }
        return currentMsgs;
      });
    });

    try {
      let accumulatedRaw = '';
      await streamChatMessage(
        messages,
        text.trim(),
        {
          goal: userGoal,
          recentLoad: stats.total7DayLoad,
          readiness: suggestion?.readiness_score ?? stats.readiness,
          activities: activities || [],
          wellness: wellnessData || [],
          powerCurves,
          weeklyBriefing,
          suggestion,
          planContext,
          ftp: ftp || 250
        },
        (chunk) => {
          accumulatedRaw += chunk;
          targetTextRef.current = accumulatedRaw;
        },
        controller.signal
      );
      isStreamCompleteRef.current = true;
    } catch (err: any) {
      if (controller.signal.aborted) return;
      console.error("Coaching stream error:", err);
      targetTextRef.current = "I apologize, but I encountered a momentary connection interruption. Please ask your question again or clarify.";
      isStreamCompleteRef.current = true;
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCopyMessage = (text: string, idx: number) => {
    const clean = text.replace(/\[UPDATE_PLAN:[^\]]*\]/g, '').trim();
    navigator.clipboard.writeText(clean).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(120, Math.max(38, e.target.scrollHeight))}px`;
  };

  return (
    <div className="flex-1 min-h-0 bg-transparent overflow-hidden flex flex-col relative font-sans">
      {/* Header Area */}
      <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.04] bg-[#07090e]/95 backdrop-blur-xl flex items-center justify-between gap-3 z-10 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 font-bold tracking-tight shrink-0 text-[10px] shadow-sm">
            <Calendar size={12} className="opacity-80" />
            <span>{chatContextSummary.dayLabel}</span>
          </div>
          <span className="text-slate-400 font-bold truncate text-[11px] leading-none tracking-tight">
            {chatContextSummary.todayText}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-slate-500 truncate max-w-[120px] hidden sm:inline font-black text-[9px] uppercase tracking-[0.2em] opacity-80">
            {chatContextSummary.tomorrowText}
          </span>
        </div>
      </div>

      {/* Messages Scroll Container */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-8 custom-scrollbar space-y-10 relative selection:bg-emerald-500/30"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {messages.length === 0 ? (
            <EmptyState 
              key="empty-state"
              onTopicClick={handleSendMessage} 
            />
          ) : (
            <div key="message-list" className="space-y-8 max-w-2xl mx-auto w-full pb-16">
              {messages.map((msg, idx) => (
                <ChatMessageItem 
                  key={`${idx}-${msg.timestamp}`}
                  msg={msg}
                  idx={idx}
                  isLatest={idx === messages.length - 1}
                  isChatLoading={isChatLoading}
                  onCopy={handleCopyMessage}
                  copiedIdx={copiedIdx}
                />
              ))}
              <div ref={chatEndRef} className="h-4" />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Scroll Bottom Button */}
      <AnimatePresence>
        {showScrollBottomBtn && (
          <motion.button
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-32 right-6 z-30 py-3 px-5 rounded-full bg-emerald-500 text-slate-950 text-[11px] font-black shadow-[0_12px_40px_rgba(16,185,129,0.4)] hover:bg-emerald-400 flex items-center gap-2.5 transition-all active:scale-95 border-2 border-white/10 uppercase tracking-widest"
          >
            <ChevronDown size={14} className="stroke-[3.5]" />
            <span>Latest</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className={`flex-none px-4 pt-4 bg-[#05070a]/98 backdrop-blur-3xl border-t border-white/[0.04] z-20 flex flex-col gap-4 transition-all duration-300 ${isKeyboardOpen ? 'pb-6' : 'pb-[92px]'}`}>
        
        {/* Context Awareness */}
        <PlanConfirmationChips 
          messages={messages}
          isChatLoading={isChatLoading}
          onSendMessage={handleSendMessage}
        />

        {/* Input Bar */}
        <div className="flex gap-3 items-end max-w-3xl mx-auto w-full pb-2">
          <div className="relative flex-1 group">
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (chatInput.trim() && !isChatLoading) handleSendMessage(chatInput);
                }
              }}
              onFocus={() => {
                setIsKeyboardOpen(true);
                setTimeout(() => scrollToBottom(true), 150);
              }}
              placeholder="Message waTTson DS..."
              rows={1}
              disabled={isChatLoading}
              className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-emerald-500/40 focus:bg-white/[0.05] focus:ring-4 focus:ring-emerald-500/5 rounded-[24px] px-5 py-4 text-[14px] text-white placeholder-slate-500 focus:outline-none font-medium resize-none min-h-[52px] max-h-[180px] transition-all disabled:opacity-50 shadow-inner"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 h-[52px]">
            {isChatLoading ? (
              <button
                onClick={handleStopGenerating}
                className="h-full aspect-square flex items-center justify-center rounded-[24px] bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 transition-all active:scale-90 shadow-lg shadow-rose-500/5"
                title="Stop"
              >
                <Square size={16} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (chatInput.trim() && !isChatLoading) handleSendMessage(chatInput);
                }}
                disabled={!chatInput.trim() || isChatLoading}
                className="h-full px-6 rounded-[24px] bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/[0.05] disabled:text-slate-600 text-slate-950 font-black text-[12px] uppercase tracking-[0.15em] transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(16,185,129,0.3)] disabled:shadow-none"
              >
                <span>Send</span>
                <Send size={14} className="stroke-[3]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Empty State - Intro with Topics
 */
const EmptyState: React.FC<{ onTopicClick: (q: string) => void }> = ({ onTopicClick }) => (
  <motion.div 
    initial={{ opacity: 0, y: 32 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.96 }}
    className="min-h-full flex flex-col items-center justify-center text-center px-6 max-w-xl mx-auto py-20"
  >
    <div className="relative mb-10">
      <div className="absolute inset-0 bg-emerald-500/30 blur-[64px] rounded-full" />
      <motion.div 
        animate={{ 
          y: [0, -12, 0],
          rotate: [0, 2, -2, 0]
        }}
        transition={{ 
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="relative w-24 h-24 rounded-[36px] bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 flex items-center justify-center shadow-[0_16px_48px_rgba(16,185,129,0.4)] border-4 border-white/20"
      >
        <Bot size={48} className="text-slate-950" />
      </motion.div>
      <motion.div 
        animate={{ scale: [1, 1.2, 1], rotate: [0, 15, -15, 0] }}
        transition={{ repeat: Infinity, duration: 3 }}
        className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-[#05070a] border-2 border-emerald-500/40 flex items-center justify-center shadow-xl"
      >
        <Sparkles size={18} className="text-emerald-400" />
      </motion.div>
    </div>

    <h3 className="text-3xl font-black text-white tracking-tight mb-4">
      waTTson AI
    </h3>
    <p className="text-base text-slate-400 leading-relaxed mb-14 max-w-[320px] font-medium">
      I analyze your training DNA, fatigue, and schedule in real-time.
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full text-left">
      {QUICK_TOPICS.map((topic, i) => (
        <motion.button
          key={topic.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          whileHover={{ y: -4, backgroundColor: "rgba(255, 255, 255, 0.05)" }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onTopicClick(topic.query)}
          className="p-6 rounded-[32px] bg-white/[0.02] border border-white/[0.08] hover:border-emerald-500/40 text-left transition-all group relative overflow-hidden shadow-sm"
        >
          <div className="flex items-center justify-between mb-3.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-all duration-300">
              {topic.icon}
            </div>
            <ChevronRight size={18} className="text-slate-700 group-hover:text-emerald-500 transition-colors" />
          </div>
          <p className="text-[14px] font-black text-white mb-1.5 uppercase tracking-wide">{topic.label}</p>
          <p className="text-[12px] text-slate-500 group-hover:text-slate-400 leading-relaxed font-medium">
            {topic.query}
          </p>
        </motion.button>
      ))}
    </div>
  </motion.div>
);

/**
 * Individual Message Item
 */
const ChatMessageItem: React.FC<{
  msg: ChatMessage;
  idx: number;
  isLatest: boolean;
  isChatLoading: boolean;
  onCopy: (t: string, i: number) => void;
  copiedIdx: number | null;
}> = ({ msg, idx, isLatest, isChatLoading, onCopy, copiedIdx }) => {
  const isUser = msg.role === 'user';
  const isCurrentlyStreaming = isLatest && !isUser && isChatLoading;

  // Parse directives
  let cleanText = msg.text;
  let directiveFound: string | null = null;
  const dirMatch = cleanText.match(/\[UPDATE_PLAN:\s*([^\]]+)\]/);
  if (dirMatch) {
    directiveFound = dirMatch[1].trim();
    cleanText = cleanText.replace(/\[UPDATE_PLAN:\s*[^\]]+\]/g, '').trim();
  }

  const parts = cleanText.split('*System:');
  const mainBody = parts[0].trim();
  const systemNote = parts[1] ? parts[1].replace(/\*/g, '').trim() : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} group w-full`}
    >
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[90%] sm:max-w-[82%]`}>
        
        {/* Author Label */}
        {!isUser && (
          <div className="flex items-center gap-2.5 mb-3 px-2 text-[10px] font-black tracking-[0.25em] text-slate-500 uppercase opacity-75">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
            <span>waTTson DS</span>
          </div>
        )}

        <div className="relative group/bubble">
          {/* Message Bubble */}
          <div
            className={`px-6 py-5 rounded-[32px] shadow-2xl transition-all ${
              isUser
                ? 'bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-600 text-white rounded-tr-none shadow-emerald-900/20 ring-1 ring-white/10'
                : 'bg-white/[0.04] border border-white/[0.07] text-slate-200 rounded-tl-none ring-1 ring-emerald-500/[0.04] backdrop-blur-sm'
            }`}
          >
            {/* Thinking state */}
            {!mainBody && isCurrentlyStreaming ? (
              <div className="flex items-center gap-4 py-2">
                <div className="flex gap-2">
                  <motion.div 
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
                    className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.4)]" 
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: 0.3 }}
                    className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.4)]" 
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: 0.6 }}
                    className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.4)]" 
                  />
                </div>
                <span className="text-[13px] text-slate-400 font-bold tracking-tight italic opacity-80">Crunching power data...</span>
              </div>
            ) : (
              <div className="text-[15px] leading-[1.7] font-medium tracking-tight">
                <FormattedCoachText text={mainBody} isStreaming={isCurrentlyStreaming} />
              </div>
            )}

            {/* Directive Card */}
            {directiveFound && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-6 p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-4 shadow-inner ring-1 ring-emerald-500/5"
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0 shadow-lg">
                  <CheckCircle2 size={22} className="text-emerald-400 stroke-[2.5]" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1 opacity-90">DS Directive</p>
                  <p className="text-[14px] text-slate-100 font-black leading-snug">{directiveFound}</p>
                </div>
              </motion.div>
            )}

            {/* System Note */}
            {systemNote && (
              <div className="mt-5 pt-5 border-t border-white/[0.05] flex items-center gap-3 text-[11px] text-slate-500 font-mono font-bold tracking-tight">
                <Check size={14} className="text-emerald-500 stroke-[3.5]" />
                <span>{systemNote}</span>
              </div>
            )}
          </div>

          {/* Inline Action Buttons */}
          {!isUser && mainBody && !isCurrentlyStreaming && (
            <div className="absolute -right-14 top-2 opacity-0 group-hover/bubble:opacity-100 transition-all flex flex-col gap-2">
              <button
                onClick={() => onCopy(mainBody, idx)}
                className="p-2.5 rounded-2xl bg-[#0b0e14]/80 border border-white/10 text-slate-500 hover:text-emerald-400 hover:bg-white/[0.08] transition-all shadow-2xl backdrop-blur-xl scale-90 hover:scale-100 active:scale-90"
                title="Copy"
              >
                {copiedIdx === idx ? <Check size={16} className="text-emerald-400 stroke-[3]" /> : <Copy size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Plan Confirmation Logic
 */
const PlanConfirmationChips: React.FC<{
  messages: ChatMessage[];
  isChatLoading: boolean;
  onSendMessage: (t: string) => void;
}> = ({ messages, isChatLoading, onSendMessage }) => {
  if (isChatLoading || messages.length === 0) return null;
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role !== 'model' || !lastMsg.text) return null;
  const t = lastMsg.text.toLowerCase();
  
  const isAsking = (
    t.includes('update your training plan') || 
    t.includes('update the training plan') || 
    t.includes('update your plan') || 
    t.includes('like me to update') || 
    t.includes('confirm this change') || 
    t.includes('apply this change') || 
    t.includes('like me to apply')
  ) && t.includes('?');

  if (!isAsking) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 px-2 pb-1"
    >
      <button
        onClick={() => onSendMessage("Yes, please update my training plan with this change.")}
        className="flex-1 py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[13px] rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_12px_32px_rgba(16,185,129,0.35)]"
      >
        <Check size={18} className="stroke-[3.5]" />
        <span>Update Plan</span>
      </button>
      <button
        onClick={() => onSendMessage("No, keep my current training plan.")}
        className="flex-1 py-4 px-6 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-300 font-black text-[13px] rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg"
      >
        <X size={18} className="stroke-[2.5]" />
        <span>Keep Current</span>
      </button>
    </motion.div>
  );
};

/**
 * Formatted Text Component
 */
const FormattedCoachText: React.FC<{ text: string; isStreaming?: boolean }> = ({ text, isStreaming }) => {
  const blocks = useMemo(() => {
    if (!text) return [];
    return text.split('\n');
  }, [text]);

  const renderLine = (lineText: string) => {
    const parts = lineText.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2);
        return (
          <strong key={i} className="font-bold text-white tracking-tight underline decoration-emerald-500/20 decoration-2 underline-offset-4">
            {highlightMetrics(inner)}
          </strong>
        );
      }
      return <React.Fragment key={i}>{highlightMetrics(part)}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-4">
      {blocks.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-4" />;

        // Headers
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          const content = trimmed.replace(/^#+\s*/, '');
          return (
            <div key={idx} className="pt-5 pb-2">
              <span className="text-[13px] font-black text-emerald-400 uppercase tracking-[0.2em] border-b-2 border-emerald-500/30 pb-1.5 leading-none block w-fit">
                {content}
              </span>
            </div>
          );
        }

        // Bullets
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-4 pl-1 py-1.5 group/list">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40 mt-2 shrink-0 group-hover/list:bg-emerald-500 group-hover/list:scale-125 transition-all duration-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]" />
              <div className="flex-1 text-slate-200 font-medium tracking-tight leading-relaxed">{renderLine(trimmed.slice(2))}</div>
            </div>
          );
        }

        // Numbers
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-5 pl-1 py-1.5 group/list">
              <span className="text-[13px] font-black text-emerald-500/50 shrink-0 mt-0.5 w-5 font-mono group-hover/list:text-emerald-400 transition-colors">
                {numMatch[1]}.
              </span>
              <div className="flex-1 text-slate-200 font-medium tracking-tight leading-relaxed">{renderLine(numMatch[2])}</div>
            </div>
          );
        }

        return (
          <p key={idx} className="text-slate-200 font-medium tracking-tight leading-relaxed">
            {renderLine(line)}
            {isStreaming && idx === blocks.length - 1 && (
              <motion.span 
                animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 0.8] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="inline-block w-2 h-4 bg-emerald-400 ml-2.5 rounded-full align-middle shadow-[0_0_8px_rgba(52,211,153,0.5)]" 
              />
            )}
          </p>
        );
      })}
    </div>
  );
};

const highlightMetrics = (content: string) => {
  const pattern = /(\b\d{2,4}\s*(?:W|watts|bpm|rpm|min|km|m|kj|h|hrs)\b|\b(?:Zone\s*[1-7]|Z[1-7]|Sweet\s*Spot|VO2\s*Max|Threshold|FTP|IF|TSS|CTL|ATL|TSB|NP)\b)/gi;
  const segments = content.split(pattern);
  return segments.map((seg, idx) => {
    if (seg.match(pattern)) {
      const isWatts = /W|watts|FTP|kj|NP/i.test(seg);
      const isHr = /bpm/i.test(seg);
      const isZone = /Zone|Z\d/i.test(seg);
      const isTrainingState = /CTL|ATL|TSB|IF|TSS/i.test(seg);
      
      let colorClass = 'text-amber-400 bg-amber-400/5';
      if (isWatts) colorClass = 'text-emerald-400 bg-emerald-400/5 ring-1 ring-emerald-500/20';
      if (isHr) colorClass = 'text-rose-400 bg-rose-400/5 ring-1 ring-rose-500/20';
      if (isZone) colorClass = 'text-sky-400 bg-sky-400/5 ring-1 ring-sky-500/20';
      if (isTrainingState) colorClass = 'text-purple-400 bg-purple-400/5 ring-1 ring-purple-500/20';

      return (
        <span key={idx} className={`font-mono font-black px-2 py-0.5 rounded-lg ${colorClass} whitespace-nowrap shadow-inner tracking-tighter mx-0.5 inline-block transition-transform hover:scale-105`}>
          {seg}
        </span>
      );
    }
    return seg;
  });
};
