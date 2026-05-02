import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, 
  IntervalsCredentials, 
  DailySuggestion,
  ChatMessage,
  Wellness
} from './types';
import { fetchActivities, fetchWellness, fetchAthleteId } from './services/intervalsService';
import { getDailySuggestion, sendChatMessage } from './services/geminiService';
import { ActivityCard } from './components/ActivityCard';
import { CoachingModal } from './components/CoachingModal';
import { WeeklyBriefingModal } from './components/WeeklyBriefingModal';
import { 
  LayoutDashboard, 
  Bike,
  Sparkles,
  RefreshCw,
  Target,
  MessageSquare,
  Send,
  Bot,
  Zap,
  User,
  Clock,
  ChevronDown,
  TrendingUp,
  LogOut,
  RotateCcw,
  Calendar,
  Settings
} from 'lucide-react';

const CyclistIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-2-3 3-3h3l2 2" />
  </svg>
);

const toLocalDateStr = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CHAT_SUGGESTIONS: string[] = [
  "Analyze recent load",
  "Current readiness?",
  "Goal check",
  "Efficiency trend"
];

const App: React.FC = () => {
  const [creds, setCreds] = useState<IntervalsCredentials | null>(() => {
    try {
      const saved = localStorage.getItem('wattson_creds');
      if (saved) return JSON.parse(saved);
    } catch {}
    const envKey = (process.env.INTERVALS_API_KEY as string) || '';
    if (envKey && envKey.length > 5) return { apiKey: envKey, athleteId: '0' };
    return null;
  });

  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [wellnessData, setWellnessData] = useState<Wellness[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [showWeeklyBriefing, setShowWeeklyBriefing] = useState(false);
  
  const [suggestion, setSuggestion] = useState<DailySuggestion | null>(() => {
    try {
      const saved = localStorage.getItem('wattson_daily_cache');
      if (saved) {
        const parsed = JSON.parse(saved) as DailySuggestion;
        if (parsed.date === toLocalDateStr(new Date())) return parsed;
      }
    } catch {}
    return null;
  });
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [showAlternative, setShowAlternative] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'rides' | 'chat' | 'settings'>('dashboard');
  const [isWorkoutExpanded, setIsWorkoutExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [userGoal, setUserGoal] = useState<string>(() => localStorage.getItem('wattson_goal') || 'Improve cycling performance');
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [formKey, setFormKey] = useState(creds?.apiKey || '');
  const [formId, setFormId] = useState(creds?.athleteId || '');

  const loadData = async (credentials: IntervalsCredentials, isInitial = false) => {
    if (loading || isSyncing) return;
    if (isInitial) setLoading(true);
    else setIsSyncing(true);
    setSyncError(null);
    try {
      let activeCreds = { ...credentials };
      
      // If athleteId is '0' or missing, try to fetch it
      if (activeCreds.apiKey !== 'demo' && (!activeCreds.athleteId || activeCreds.athleteId === '0')) {
        const realId = await fetchAthleteId(activeCreds.apiKey);
        activeCreds.athleteId = realId;
      }

      const [fetchedActivities, fetchedWellness] = await Promise.all([
        fetchActivities(activeCreds),
        fetchWellness(activeCreds)
      ]);
      
      setActivities(fetchedActivities || []);
      setWellnessData(fetchedWellness || []);
      
      const credsChanged = !creds || 
                           activeCreds.apiKey !== creds.apiKey || 
                           activeCreds.athleteId !== creds.athleteId;
      
      if (credsChanged) {
        setCreds(activeCreds);
        localStorage.setItem('wattson_creds', JSON.stringify(activeCreds));
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      setSyncError(err.message || "Failed to connect to Intervals.icu");
      // Ensure we don't stay in a null state if it fails, so we don't loop
      if (activities === null) setActivities([]);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (creds && activities === null && !syncError && !loading) {
      loadData(creds, true);
    }
  }, [creds, activities, syncError, loading]);

  useEffect(() => {
    const todayStr = toLocalDateStr(new Date());
    const shouldFetch = activities && activities.length > 0 && 
                        !loadingSuggestion && 
                        (!suggestion || suggestion.date !== todayStr);

    if (shouldFetch) {
      const fetchNewSuggestion = async () => {
        setLoadingSuggestion(true);
        try {
          const data = await getDailySuggestion(activities!, userGoal);
          setSuggestion(data);
          localStorage.setItem('wattson_daily_cache', JSON.stringify(data));
        } catch (err) {
          console.error("Suggestion failed:", err);
        } finally {
          setLoadingSuggestion(false);
        }
      };
      fetchNewSuggestion();
    }
  }, [activities, userGoal]);

  const stats = useMemo(() => {
    const loadByDate = new Map<string, number>();
    const last7Days: { day: string; load: number }[] = [];
    const now = new Date();
    
    const safeActivities = activities || [];
    
    safeActivities.forEach(a => {
      const d = a.start_date_local.split('T')[0];
      loadByDate.set(d, (loadByDate.get(d) || 0) + (a.icu_training_load ?? a.icu_tss ?? 0));
    });

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const ds = toLocalDateStr(d);
      last7Days.push({
        day: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        load: Math.round(loadByDate.get(ds) || 0)
      });
    }

    const total7DayLoad = last7Days.reduce((acc, d) => acc + d.load, 0);

    let ctl = 0, atl = 0;
    if (safeActivities.length > 0) {
      const start = new Date(safeActivities[safeActivities.length-1].start_date_local);
      for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
        const ds = toLocalDateStr(d);
        const dailyLoad = loadByDate.get(ds) || 0;
        ctl = ctl + (dailyLoad - ctl) * (1 / 42);
        atl = atl + (dailyLoad - atl) * (1 / 7);
      }
    }

    const form = ctl - atl;
    const readiness = Math.min(10, Math.max(1, Math.round(5 + (form / 10) + (ctl / 50))));
    
    let statusLabel = 'Optimal', statusColor = 'text-cyan-400', statusBg = 'bg-cyan-500/10';
    if (form > 5) { statusLabel = 'Fresh'; statusColor = 'text-emerald-400'; statusBg = 'bg-emerald-500/10'; }
    else if (form < -25) { statusLabel = 'Fatigued'; statusColor = 'text-rose-400'; statusBg = 'bg-rose-500/10'; }
    else if (form < -10) { statusLabel = 'Productive'; statusColor = 'text-amber-400'; statusBg = 'bg-amber-500/10'; }

    const recoveryProgress = form < 0 ? Math.max(10, 100 - (Math.abs(form) * 2)) : 100;
    const recoveryLabel = form < 0 ? `${Math.round(Math.abs(form) * 2.5)}h Recovery` : "Fully Primed";

    return { last7Days, total7DayLoad, statusLabel, statusColor, statusBg, readiness, recoveryProgress, recoveryLabel, form };
  }, [activities]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isChatLoading) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const response = await sendChatMessage(messages, text, { goal: userGoal, recentLoad: stats.total7DayLoad, readiness: stats.readiness });
      setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch {
      setMessages(prev => [...prev, { role: 'model', text: "Engine response error." }]);
    } finally { setIsChatLoading(false); }
  };

  const groupedActivities = useMemo(() => {
    const safeActivities = activities || [];
    const sorted = [...safeActivities].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local));
    const groups: Record<string, Activity[]> = {};
    sorted.forEach(a => {
      const d = new Date(a.start_date_local);
      const monthYear = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!groups[monthYear]) groups[monthYear] = [];
      groups[monthYear].push(a);
    });
    return groups;
  }, [activities]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatLoading]);

  const currentWorkout = suggestion ? (showAlternative ? suggestion.alternative : suggestion.primary) : null;

  if (loading) return (
    <div className="phone-container flex flex-col items-center justify-center p-8 bg-[#0a0e17]">
      <div className="premium-bg"></div>
      <div className="w-8 h-8 border-2 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Syncing Engine...</p>
    </div>
  );

  if (!creds || syncError) return (
    <div className="phone-container p-8 justify-center">
      <div className="premium-bg"></div>
      <div className="glass-card p-8 rounded-[2rem] text-center">
        <div className="w-12 h-12 bg-cyan-500/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5 shadow-inner">
          <CyclistIcon size={24} className="text-cyan-400" />
        </div>
        <h1 className="text-xl text-header italic mb-1">WaTTson</h1>
        <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest mb-8">Performance Engine</p>
        <div className="space-y-3">
          {syncError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-400 font-bold leading-tight">
              {syncError}
            </div>
          )}
          <input 
            type="password" 
            placeholder="Intervals.icu API Key" 
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-cyan-500/50 transition-colors" 
            value={formKey}
            onChange={(e) => {
              setFormKey(e.target.value);
              if (syncError) setSyncError(null);
            }}
          />
          <input 
            type="text" 
            placeholder="Athlete ID (e.g. i12345)" 
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-cyan-500/50 transition-colors" 
            value={formId}
            onChange={(e) => {
              setFormId(e.target.value);
              if (syncError) setSyncError(null);
            }}
          />
          <button 
            onClick={() => {
              if (!formKey.trim()) {
                setSyncError("Please enter your API Key.");
                return;
              }
              loadData({ apiKey: formKey, athleteId: formId || '0' }, true);
            }}
            className="w-full bg-cyan-500 text-slate-950 font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-xl"
          >
            Authenticate
          </button>
          <button 
            onClick={() => loadData({ apiKey: 'demo', athleteId: '0' }, true)}
            className="w-full bg-white/5 text-slate-400 font-bold py-3.5 rounded-xl text-[10px] uppercase tracking-widest active:scale-95 transition-all border border-white/5"
          >
            Explore Demo Mode
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="phone-container overflow-hidden bg-[#0a0e17]">
      <div className="premium-bg"></div>
      
      {/* Scrollable View Area */}
      <div className={`flex-1 flex flex-col ${activeTab === 'chat' ? 'p-0' : 'pt-[env(safe-area-inset-top)] pb-20 px-4'}`}>
        
        {/* Compact Header */}
        {activeTab !== 'chat' && (
          <header className="flex items-center justify-between py-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl glass-card flex items-center justify-center shadow-inner">
                <CyclistIcon size={18} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-base text-header italic leading-none">WaTTson</h2>
                <button onClick={() => setShowGoalEditor(true)} className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                  <Target size={9} className="text-cyan-400" />
                  <span className="text-[8px] font-bold uppercase tracking-tight truncate max-w-[120px]">{userGoal}</span>
                </button>
              </div>
            </div>
            <button 
              onClick={() => { setSuggestion(null); loadData(creds!); }}
              disabled={isSyncing}
              className="w-8 h-8 rounded-full glass-card flex items-center justify-center text-slate-400 hover:text-cyan-400 active:rotate-180 transition-all duration-700"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            </button>
          </header>
        )}

        {activeTab === 'dashboard' && (
          <div className="flex-1 flex flex-col space-y-3 animate-in fade-in duration-500 pb-4 overflow-hidden">
            {/* Performance Status - Simplified 1-Screen Card - MOVED TO TOP */}
            <div className="glass-card p-4 rounded-[1.8rem] flex flex-col flex-shrink-0">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${stats.statusColor.replace('text-', 'bg-')}`}></div>
                  <h3 className="text-[11px] font-bold text-white uppercase tracking-tight">Physiology: <span className={stats.statusColor}>{stats.statusLabel}</span></h3>
                </div>
                <button 
                  onClick={() => setShowWeeklyBriefing(true)} 
                  className="text-[10px] font-black text-slate-950 uppercase tracking-[0.14em] flex items-center gap-2 bg-cyan-400 px-4 py-2 rounded-full hover:bg-cyan-300 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] active:scale-95 transition-all"
                >
                   Weekly Plan <Calendar size={12} strokeWidth={2.5} />
                </button>
              </div>
              
              <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">
                  <span>Recovery State</span>
                  <span className={stats.form < 0 ? 'text-amber-500' : 'text-emerald-500'}>{stats.recoveryLabel}</span>
                </div>
                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${stats.form < 0 ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${stats.recoveryProgress}%` }} />
                </div>
              </div>
            </div>

            {/* suggestion card - Optimized for 1-screen fit */}
            <div className="glass-card rounded-[1.8rem] p-4 flex flex-col relative overflow-hidden flex-shrink-0">
              <div className="flex items-center justify-between mb-2.5 relative z-10">
                <div className="flex items-center gap-1 px-2.5 py-1 bg-cyan-500/10 rounded-full border border-cyan-500/10">
                  <Sparkles size={9} className="text-cyan-400" />
                  <span className="text-[8px] font-bold text-cyan-400 uppercase tracking-widest">Today's Focus</span>
                </div>
                {suggestion && (
                  <button onClick={() => setShowAlternative(!showAlternative)} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-colors">
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>

              {loadingSuggestion ? (
                <div className="flex flex-col items-center justify-center py-6 opacity-40">
                  <div className="w-5 h-5 border border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin"></div>
                </div>
              ) : currentWorkout ? (
                <div className="flex flex-col relative z-10">
                  <h3 className="text-xl text-header italic mb-1 leading-tight tracking-tight">{currentWorkout.title}</h3>
                  <p className="text-slate-400 text-[11px] leading-snug mb-3">
                    {currentWorkout.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 rounded-xl border border-white/5 text-[10px] font-bold">
                        <Clock size={12} className="text-blue-400" /> {currentWorkout.duration_minutes}m
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/5 rounded-xl border border-amber-500/10 text-[10px] font-bold text-amber-400/80">
                        <Zap size={12} fill="currentColor" /> {currentWorkout.intensity}
                      </div>
                    </div>
                    <button onClick={() => setIsWorkoutExpanded(!isWorkoutExpanded)} className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                      <ChevronDown size={16} className={`transition-transform duration-300 ${isWorkoutExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {isWorkoutExpanded && suggestion && (
                    <div className="mt-3 p-3 bg-slate-950/40 rounded-2xl border border-white/5 animate-in slide-in-from-bottom-2">
                      <p className="text-[10px] text-slate-300 italic leading-relaxed">"{suggestion.reasoning}"</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Main Stats Hub - Re-shaped for 1 screen */}
            <div className="grid grid-cols-2 gap-3 flex-shrink-0">
              <div className="glass-card p-4 rounded-[1.8rem] flex flex-col justify-between">
                <div>
                  <h4 className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Readiness</h4>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-black italic tracking-tighter ${stats.statusColor}`}>{stats.readiness}</span>
                    <span className="text-[10px] font-bold text-slate-600">/ 10</span>
                  </div>
                </div>
                <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-3">
                  <div className="h-full bg-cyan-500" style={{ width: `${stats.readiness * 10}%` }} />
                </div>
              </div>
              
              <div className="glass-card p-4 rounded-[1.8rem] flex flex-col justify-between">
                <div>
                  <h4 className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">7D Load</h4>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black italic tracking-tighter text-white">{stats.total7DayLoad}</span>
                    <span className="text-[10px] font-bold text-slate-600 uppercase">TSS</span>
                  </div>
                </div>
                <div className="h-6 w-full flex items-end gap-1 mt-2">
                  {(stats.last7Days as { day: string; load: number }[]).map((d, i) => (
                    <div key={i} className="flex-1 bg-slate-800 rounded-sm" style={{ height: `${Math.max(15, (d.load / 150) * 100)}%` }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Progress Glimpse - Bottom strip */}
            <div className="mt-auto glass-card py-3 px-5 rounded-full border-white/5 flex items-center justify-between flex-shrink-0">
               <div className="flex items-center gap-2">
                 <TrendingUp size={14} className="text-cyan-400" />
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Training Status</span>
               </div>
               <span className="text-[9px] font-bold text-white uppercase tracking-widest">{stats.statusLabel}</span>
            </div>
          </div>
        )}

        {activeTab === 'rides' && (
          <div className="flex-1 space-y-4 animate-in slide-in-from-right-2 duration-400 pb-10 overflow-y-auto custom-scrollbar">
             <div className="space-y-6 pt-2">
               {Object.entries(groupedActivities).map(([month, monthRides]) => (
                 <div key={month} className="space-y-3">
                   <div className="flex items-center gap-3 px-1">
                     <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">{month}</span>
                     <div className="flex-1 h-px bg-white/5" />
                   </div>
                   {(monthRides as Activity[]).map(a => <ActivityCard key={a.id} activity={a} onClick={setSelectedActivity} />)}
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex flex-col h-full bg-[#070b14] animate-in fade-in duration-500">
             <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 bg-[#0a0e17]/80 backdrop-blur-xl shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
               <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                 <Bot size={16} />
               </div>
               <div>
                  <h2 className="text-sm font-bold text-white tracking-tight leading-none uppercase italic">Coach WaTTson</h2>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Direct Line</span>
               </div>
             </div>
             
             <div className="flex-1 overflow-y-auto space-y-3 px-4 py-4 custom-scrollbar">
               {messages.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-center px-6 pb-12">
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-6 max-w-[220px]">Coach WaTTson is ready. Ask for training context or recent load analysis.</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                       {(CHAT_SUGGESTIONS as string[]).map((suggestionText) => (
                         <button 
                           key={suggestionText}
                           onClick={() => handleSendMessage(suggestionText)}
                           className="text-[9px] font-bold text-slate-400 bg-white/5 border border-white/5 rounded-full py-2 px-4 hover:bg-white/10 active:scale-95 transition-all"
                         >
                           {suggestionText}
                         </button>
                       ))}
                    </div>
                 </div>
               ) : (
                <div className="space-y-4">
                  {(messages as ChatMessage[]).map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-1 duration-200`}>
                        <div className={`max-w-[85%] px-4 py-3 rounded-[1.4rem] text-[14px] leading-relaxed shadow-sm ${
                          msg.role === 'user' 
                          ? 'bg-cyan-500 text-slate-950 font-bold rounded-tr-sm' 
                          : 'bg-[#151c2c] text-slate-100 rounded-tl-sm border border-white/5'
                        }`}>
                          {msg.text}
                        </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                        <div className="bg-[#151c2c] px-4 py-3 rounded-[1.4rem] flex gap-1.5 items-center">
                          <div className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                    </div>
                  )}
                  <div ref={chatEndRef} className="h-4" />
                </div>
               )}
             </div>

             {/* Fixed Input Area with safe bottom padding for Chat */}
             <div className="px-4 pb-[110px] pt-3 bg-gradient-to-t from-[#0a0e17] to-transparent shrink-0">
               <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(chatInput); }} className="relative max-w-[400px] mx-auto">
                 <input 
                   value={chatInput}
                   onChange={(e) => setChatInput(e.target.value)}
                   placeholder="Message WaTTson..."
                   className="w-full bg-[#151c2c] border border-white/10 rounded-full px-5 py-3.5 text-sm text-white focus:outline-none focus:border-cyan-500/20 shadow-xl"
                 />
                 <button 
                   type="submit" 
                   disabled={!chatInput.trim() || isChatLoading}
                   className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-cyan-500 rounded-full flex items-center justify-center text-slate-950 disabled:opacity-30 active:scale-90 transition-all"
                 >
                   <Send size={16} />
                 </button>
               </form>
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-5 animate-in slide-in-from-right-2 duration-400 pb-20 px-1 overflow-y-auto custom-scrollbar">
             <h2 className="text-xl text-header italic uppercase tracking-tight pt-2">Pro DNA</h2>
             <div className="glass-card p-6 rounded-[2rem] space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 border border-white/5 shadow-inner"><User size={24} /></div>
                  <div>
                    <p className="text-sm font-bold text-white tracking-tight">Athlete ID: {creds?.athleteId}</p>
                    <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-0.5">Systems Operational</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] ml-1">Current Ambition</label>
                  <div onClick={() => setShowGoalEditor(true)} className="bg-slate-950/50 p-5 rounded-2xl border border-white/5 cursor-pointer hover:border-cyan-500/30 transition-all">
                    <p className="text-[12px] text-slate-400 italic">"{userGoal}"</p>
                  </div>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-3">
               <button onClick={() => { setSuggestion(null); loadData(creds!); }} className="p-5 bg-white/5 rounded-[1.8rem] border border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500 flex flex-col items-center gap-3 active:scale-95 transition-all">
                  <RotateCcw size={18} /> Sync Engine
               </button>
               <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="p-5 bg-rose-500/5 rounded-[1.8rem] border border-rose-500/10 text-[9px] font-black uppercase tracking-widest text-rose-500 flex flex-col items-center gap-3 active:scale-95 transition-all">
                  <LogOut size={18} /> Logout
               </button>
             </div>
          </div>
        )}
      </div>

      {/* Optimized Bottom Navigation Bar - Minimal gap on iPhone 16e */}
      <nav className="fixed bottom-0 left-0 right-0 z-[100] pt-3 bg-[#0a0e17]/90 backdrop-blur-2xl border-t border-white/5">
        <div className="flex items-center justify-around px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
            { id: 'rides', icon: Bike, label: 'Logs' },
            { id: 'chat', icon: MessageSquare, label: 'Chat' },
            { id: 'settings', icon: Settings, label: 'Pro' }
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center gap-1.5 transition-all duration-300 relative py-1 px-4 ${activeTab === item.id ? 'text-cyan-400 scale-105' : 'text-slate-600'}`}
            >
              <item.icon size={22} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              <span className="text-[9px] font-bold uppercase tracking-tight">{item.label}</span>
              {activeTab === item.id && (
                <div className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {showGoalEditor && (
        <div className="fixed inset-0 z-[210] bg-slate-950/98 backdrop-blur-3xl flex flex-col p-8 animate-in slide-in-from-bottom-4 duration-400">
          <div className="flex items-center justify-between mb-8 mt-2">
            <h2 className="text-2xl text-header italic uppercase leading-none">DNA Focus</h2>
            <button onClick={() => setShowGoalEditor(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-500"><Settings size={20} /></button>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Define your primary ambition for the AI engine.</p>
          <textarea 
            value={userGoal} 
            onChange={(e) => setUserGoal(e.target.value)} 
            className="w-full bg-slate-900/50 border border-white/10 rounded-[2rem] p-6 text-lg font-bold text-white outline-none focus:border-cyan-500/30 flex-1 mb-8 italic"
            placeholder="Ex: Improve hill climb efficiency..."
          />
          <button 
            onClick={() => { localStorage.setItem('wattson_goal', userGoal); setSuggestion(null); setShowGoalEditor(false); }}
            className="w-full py-5 bg-cyan-500 text-slate-950 font-bold text-[10px] uppercase tracking-[0.2em] rounded-[1.8rem] shadow-2xl active:scale-95 transition-all"
          >
            Update Engine Target
          </button>
        </div>
      )}

      {selectedActivity && creds && <CoachingModal activity={selectedActivity} creds={creds} onClose={() => setSelectedActivity(null)} userGoal={userGoal} />}
      {showWeeklyBriefing && creds && <WeeklyBriefingModal activities={activities || []} wellness={wellnessData} creds={creds} userGoal={userGoal} onClose={() => setShowWeeklyBriefing(false)} todaySuggestion={suggestion} />}
    </div>
  );
};

export default App;
