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
  Sliders,
  CheckCircle2,
  Bike,
  MessageSquare,
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
  { label: "Today's Ride", query: "What should I focus on for today's session based on my readiness?", icon: <Zap size={12} /> },
  { label: "Training Load", query: "How is my current training load and fatigue trending?", icon: <TrendingUp size={12} /> },
  { label: "Review Week", query: "Can you analyze my recent rides and key intervals?", icon: <Calendar size={12} /> },
  { label: "Power Curve", query: "What are my recent power breakthroughs and milestones?", icon: <Flame size={12} /> }
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

  // Ensure scroll to bottom on mount and message updates
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      scrollToBottom(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [scrollToBottom]);

  // Also scroll when messages change length (new message added)
  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

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
      const lowerText = fullText.toLowerCase();
      const tagMarker = '[update_plan:';
      const planUpdateIdx = lowerText.indexOf(tagMarker);
      
      if (planUpdateIdx !== -1) {
        const closingIdx = fullText.indexOf(']', planUpdateIdx);
        if (closingIdx !== -1) {
          const directive = fullText.substring(planUpdateIdx + tagMarker.length, closingIdx).trim();
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

  // Automatic scroll to bottom on mount and message change
  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length]);

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
    <div className="flex-1 min-h-0 bg-transparent overflow-x-hidden flex flex-col relative font-sans max-w-full">
      {/* Refined Header Strip */}
      <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.04] bg-[#07090e]/95 backdrop-blur-xl flex items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 font-medium tracking-tight shrink-0 text-[10px]">
            <Calendar size={12} className="opacity-80" />
            <span>{chatContextSummary.dayLabel}</span>
          </div>
          <span className="text-slate-400 font-medium truncate text-[11px] leading-none">
            {chatContextSummary.todayText}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-slate-500 truncate max-w-[120px] hidden sm:inline font-mono text-[9px] uppercase tracking-wider">
            {chatContextSummary.tomorrowText}
          </span>
        </div>
      </div>

      {/* Messages Scroll Container */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-6 custom-scrollbar space-y-6 relative selection:bg-slate-500/30"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {messages.length === 0 ? (
            <EmptyState 
              key="empty-state"
              onTopicClick={handleSendMessage} 
            />
          ) : (
            <div key="message-list" className="space-y-6 max-w-2xl mx-auto w-full">
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

      {/* Floating Scroll Bottom Button removed based on user request */}

      {/* Input & Action Area */}
      <div className={`flex-none px-4 pt-3 bg-[#05070a]/95 backdrop-blur-2xl border-t border-white/[0.04] z-20 flex flex-col gap-3 transition-all duration-300 ${isKeyboardOpen ? 'pb-4' : 'pb-[88px]'}`}>
        
        {/* Suggestion & Plan Chips */}
        <div className="flex flex-col gap-2.5">
          <PlanConfirmationChips 
            messages={messages}
            isChatLoading={isChatLoading}
            onSendMessage={handleSendMessage}
          />
        </div>

        {/* Input Bar */}
        <div className="flex gap-2.5 items-end max-w-3xl mx-auto w-full pb-1">
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
              placeholder="Message waTTson..."
              rows={1}
              disabled={isChatLoading}
              className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-slate-500/40 focus:bg-white/[0.05] rounded-2xl px-4 py-3 text-[12px] text-white placeholder-slate-500 focus:outline-none font-normal resize-none min-h-[44px] max-h-[160px] transition-all disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 h-[44px]">
            {isChatLoading ? (
              <button
                onClick={handleStopGenerating}
                className="h-full aspect-square flex items-center justify-center rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 transition-all active:scale-90"
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
                className="h-full px-5 rounded-2xl bg-slate-200 hover:bg-white disabled:bg-white/[0.05] disabled:text-slate-600 text-slate-950 font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.2)] disabled:shadow-none"
              >
                <span>Send</span>
                <Send size={14} className="stroke-[2.5]" />
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
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.98 }}
    className="min-h-full flex flex-col items-center justify-center text-center px-6 max-w-lg mx-auto py-12"
  >
    <div className="relative mb-6">
      <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full" />
      <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-b from-emerald-500 to-emerald-600 flex items-center justify-center shadow-2xl">
        <Bot size={32} className="text-slate-950" />
      </div>
      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#05070a] border border-emerald-500/30 flex items-center justify-center">
        <Sparkles size={12} className="text-emerald-400" />
      </div>
    </div>

    <h3 className="text-xl font-bold text-white tracking-tight mb-2">
      I'm waTTson
    </h3>
    <p className="text-sm text-slate-400 leading-relaxed mb-10 max-w-sm">
      Your cycling performance coach. I analyze your power data, fatigue, and schedule to keep you on track.
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
      {QUICK_TOPICS.map((topic, i) => (
        <motion.button
          key={topic.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          onClick={() => onTopicClick(topic.query)}
          className="p-4 rounded-3xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-emerald-500/30 text-left transition-all group relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-emerald-400">
              {topic.icon}
            </div>
            <ChevronRight size={14} className="text-slate-600 group-hover:text-emerald-500 transition-colors" />
          </div>
          <p className="text-[12px] font-bold text-white mb-1">{topic.label}</p>
          <p className="text-[11px] text-slate-500 group-hover:text-slate-400 leading-snug line-clamp-2">
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
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} group w-full`}
    >
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%]`}>
        
        {/* Author Label */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-2 px-1 text-[9px] font-bold tracking-widest text-slate-500 uppercase">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>waTTson</span>
          </div>
        )}

        <div className="relative group/bubble">
          {/* Message Bubble */}
          <div
            className={`px-4.5 py-3.5 rounded-[24px] shadow-sm transition-all ${
              isUser
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-50 shadow-sm rounded-tr-none'
                : 'bg-white/[0.03] border border-white/[0.06] text-slate-300 rounded-tl-none'
            }`}
          >
            {/* Thinking state */}
            {!mainBody && isCurrentlyStreaming ? (
              <div className="flex items-center gap-3 py-1">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[10px] text-slate-500 font-medium">Analyzing power files...</span>
              </div>
            ) : (
              <div className="text-[12px] leading-[1.6] break-words overflow-hidden">
                <FormattedCoachText text={mainBody} isStreaming={isCurrentlyStreaming} />
              </div>
            )}

            {/* Directive Card */}
            {directiveFound && (
              <div className="mt-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[8.5px] font-bold text-emerald-400 uppercase tracking-widest mb-0.5 opacity-80">Plan Engine Update</p>
                  <p className="text-[11px] text-slate-200 font-semibold leading-tight">{directiveFound}</p>
                </div>
              </div>
            )}

            {/* System Note */}
            {systemNote && (
              <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                <Check size={11} className="text-emerald-500" />
                <span>{systemNote}</span>
              </div>
            )}
          </div>

          {/* Inline Action Buttons */}
          {!isUser && mainBody && !isCurrentlyStreaming && (
            <div className="absolute -right-10 top-2 opacity-0 group-hover/bubble:opacity-100 transition-opacity flex flex-col gap-1">
              <button
                onClick={() => onCopy(mainBody, idx)}
                className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-500 hover:text-white hover:bg-white/[0.08] transition-all"
                title="Copy"
              >
                {copiedIdx === idx ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
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
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2"
    >
      <button
        onClick={() => onSendMessage("Yes, please update my training plan with this change.")}
        className="flex-1 py-2 px-4 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-[10px] rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
      >
        <Check size={14} className="stroke-[3]" />
        <span>Yes, Update Plan</span>
      </button>
      <button
        onClick={() => onSendMessage("No, keep my current training plan.")}
        className="flex-1 py-2 px-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] text-slate-500 font-semibold text-[10px] rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
      >
        <X size={14} />
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
          <strong key={i} className="font-bold text-white tracking-tight">
            {highlightMetrics(inner)}
          </strong>
        );
      }
      return <React.Fragment key={i}>{highlightMetrics(part)}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-2">
      {blocks.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-2" />;

        // Headers
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          const content = trimmed.replace(/^#+\s*/, '');
          return (
            <div key={idx} className="pt-2 pb-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">
                {content}
              </span>
            </div>
          );
        }

        // Bullets
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-3 pl-1 py-0.5 group/list">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 mt-1.5 shrink-0 group-hover/list:bg-emerald-500 transition-colors" />
              <div className="flex-1 text-slate-300 leading-relaxed">{renderLine(trimmed.slice(2))}</div>
            </div>
          );
        }

        // Numbers
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-3 pl-1 py-0.5">
              <span className="text-[10px] font-black text-slate-500 shrink-0 mt-0.5 w-4 text-right">
                {numMatch[1]}.
              </span>
              <div className="flex-1 text-slate-300 leading-relaxed">{renderLine(numMatch[2])}</div>
            </div>
          );
        }

        return (
          <p key={idx} className="text-slate-300 leading-relaxed font-medium tracking-tight">
            {renderLine(line)}
            {isStreaming && idx === blocks.length - 1 && (
              <span className="inline-block w-1 h-3 bg-emerald-400 ml-1.5 animate-pulse rounded-full" />
            )}
          </p>
        );
      })}
    </div>
  );
};

const highlightMetrics = (content: string) => {
  const pattern = /(\b\d{2,4}\s*(?:W|watts|bpm|rpm|min|km|m)\b|\b(?:Zone\s*[1-7]|Z[1-7]|Sweet\s*Spot|VO2\s*Max|Threshold|FTP|IF|TSS)\b)/gi;
  const segments = content.split(pattern);
  return segments.map((seg, idx) => {
    if (seg.match(pattern)) {
      const isWatts = /W|watts|FTP/i.test(seg);
      const isHr = /bpm/i.test(seg);
      const isZone = /Zone|Z\d/i.test(seg);
      
      let colorClass = 'text-slate-200 bg-white/5';
      if (isWatts) colorClass = 'text-slate-200 bg-white/10';
      if (isHr) colorClass = 'text-slate-300 bg-white/5';
      if (isZone) colorClass = 'text-slate-200 bg-white/10';

      return (
        <span key={idx} className={`font-mono font-bold px-1 rounded-md ${colorClass} border border-white/5`}>
          {seg}
        </span>
      );
    }
    return seg;
  });
};
