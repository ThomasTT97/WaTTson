
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, 
  IntervalsCredentials, 
  DailySuggestion,
  ChatMessage,
  Wellness,
  WorkoutOption
} from './types';
import { fetchActivities, fetchWellness, getMockActivities, getMockWellness } from './services/intervalsService';
import { getDailySuggestion, sendChatMessage } from './services/geminiService';
import { ActivityCard } from './components/ActivityCard';
import { CoachingModal } from './components/CoachingModal';
import { WeeklyBriefingModal } from './components/WeeklyBriefingModal';
import { 
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Cell
} from 'recharts';
import { 
  LayoutDashboard, 
  Bike,
  Sparkles,
  RefreshCw,
  LogOut,
  Target,
  MessageSquare,
  Send,
  Bot,
  Zap,
  User,
  Clock,
  ChevronRight,
  Info,
  X,
  Trophy,
  Activity as ActivityIcon,
  Flame,
  Scale,
  Repeat,
  Calendar,
  TrendingUp,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

const CyclistIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
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

const GOAL_SUGGESTIONS = [
  { title: "Power Build", text: "Improve my 20-minute power and FTP by 5%" },
  { title: "Weight Loss", text: "Maintain power while safely losing 3kg for climbing season" },
  { title: "Gran Fondo", text: "Build endurance for a 160km event with significant climbing" },
  { title: "Crit Racing", text: "Develop anaerobic repeatability and race-winning sprint power" },
  { title: "Base Fitness", text: "Focus on aerobic base and metabolic efficiency" },
  { title: "Recovery Focus", text: "Active recovery and flexibility while dealing with high life stress" }
];

const App: React.FC = () => {
  const [creds, setCreds] = useState<IntervalsCredentials | null>(() => {
    const envKey = (process.env.INTERVALS_API_KEY as string) || '';
    if (envKey && envKey.length > 5) return { apiKey: envKey, athleteId: '0' };
    try {
      const saved = localStorage.getItem('wattson_creds');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [activities, setActivities] = useState<Activity[]>([]);
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'rides' | 'settings' | 'chat'>('dashboard');
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [userGoal, setUserGoal] = useState<string>(() => localStorage.getItem('wattson_goal') || 'Improve cycling performance');
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [showReadinessInfo, setShowReadinessInfo] = useState(false);
  const [formKey, setFormKey] = useState('');

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadData = async (credentials: IntervalsCredentials, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsSyncing(true);
    setSyncError(null);
    try {
      const [fetchedActivities, fetchedWellness] = await Promise.all([
        fetchActivities(credentials),
        fetchWellness(credentials)
      ]);
      setActivities(fetchedActivities);
      setWellnessData(fetchedWellness);
      setCreds(credentials);
      localStorage.setItem('wattson_creds', JSON.stringify(credentials));
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || "Failed to connect to Intervals.icu";
      if (errorMsg.includes("Failed to fetch")) {
        errorMsg = "Connection Blocked: Intervals.icu doesn't support direct mobile browser access. Try demo mode or check API Key permissions.";
      }
      setSyncError(errorMsg);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (creds && activities.length === 0) {
      if (creds.apiKey === 'demo') {
        setActivities(getMockActivities());
        setWellnessData(getMockWellness());
      } else {
        loadData(creds, true);
      }
    }
  }, []);

  useEffect(() => {
    const todayStr = toLocalDateStr(new Date());
    const shouldFetch = activities.length > 0 && 
                        !loadingSuggestion && 
                        (!suggestion || suggestion.date !== todayStr);

    if (shouldFetch) {
      const fetchNewSuggestion = async () => {
        setLoadingSuggestion(true);
        try {
          const data = await getDailySuggestion(activities, userGoal);
          setSuggestion(data);
          localStorage.setItem('wattson_daily_cache', JSON.stringify(data));
        } catch (err) {
          console.error("Suggestion fetch failed:", err);
        } finally {
          setLoadingSuggestion(false);
        }
      };
      fetchNewSuggestion();
    }
  }, [activities.length, userGoal]);

  const loadStats = useMemo(() => {
    const loadByDate = new Map<string, number>();
    const timeByDate = new Map<string, number>();
    const last7Days = [];
    const now = new Date();
    
    activities.forEach(a => {
      const d = a.start_date_local.split('T')[0];
      loadByDate.set(d, (loadByDate.get(d) || 0) + (a.icu_training_load ?? a.icu_tss ?? 0));
      timeByDate.set(d, (timeByDate.get(d) || 0) + (a.moving_time || 0));
    });

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const ds = toLocalDateStr(d);
      last7Days.push({
        day: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        load: Math.round(loadByDate.get(ds) || 0),
        time: timeByDate.get(ds) || 0
      });
    }

    const total7DayLoad = last7Days.reduce((acc, d) => acc + d.load, 0);
    const total7DaySeconds = last7Days.reduce((acc, d) => acc + d.time, 0);
    const total7DayHours = (total7DaySeconds / 3600).toFixed(1);

    let ctl = 0, atl = 0;
    const sortedDates = Array.from(loadByDate.keys()).sort();
    if (sortedDates.length > 0) {
      const start = new Date(sortedDates[0]);
      const end = new Date();
      let runningCtl = 0, runningAtl = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = toLocalDateStr(d);
        const dailyLoad = loadByDate.get(ds) || 0;
        runningCtl = runningCtl + (dailyLoad - runningCtl) * (1 / 42);
        runningAtl = runningAtl + (dailyLoad - runningAtl) * (1 / 7);
      }
      ctl = runningCtl; atl = runningAtl;
    }

    const form = ctl - atl;
    const rampRate = ctl > 0 ? (atl / ctl) : 0;
    
    let score = 5.0;
    if (form > 25) score = 7.0; 
    else if (form >= 5) score = 9.5; 
    else if (form >= -10) score = 8.5; 
    else if (form >= -30) score = 5.5; 
    else score = 2.0; 

    const readinessScore = Math.min(10, Math.max(1, Math.round(score)));
    let statusLabel = 'Maintaining', statusColor = 'text-cyan-400', statusBg = 'bg-cyan-500/10', glowColor = 'shadow-cyan-500/20';

    if (form > 5) { statusLabel = 'Fresh'; statusColor = 'text-sky-400'; statusBg = 'bg-sky-500/10'; glowColor = 'shadow-sky-500/20'; }
    else if (form >= -10) { statusLabel = 'Optimal'; statusColor = 'text-emerald-400'; statusBg = 'bg-emerald-500/10'; glowColor = 'shadow-emerald-500/20'; }
    else if (form >= -30) { statusLabel = 'Building'; statusColor = 'text-amber-400'; statusBg = 'bg-amber-500/10'; glowColor = 'shadow-amber-500/20'; }
    else { statusLabel = 'Overreaching'; statusColor = 'text-red-400'; statusBg = 'bg-red-500/10'; glowColor = 'shadow-red-500/20'; }

    return { 
      last7Days, total7DayLoad, total7DayHours, statusLabel, statusColor, statusBg, glowColor,
      readinessScore, form, rampRate, ctl, atl 
    };
  }, [activities]);

  const currentWorkout: WorkoutOption | null = suggestion ? (showAlternative ? suggestion.alternative : suggestion.primary) : null;

  const handleSaveGoal = (goal: string) => {
    setUserGoal(goal);
    localStorage.setItem('wattson_goal', goal);
    setShowGoalEditor(false);
    setSuggestion(null);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const response = await sendChatMessage(messages, text, { goal: userGoal, recentLoad: loadStats.total7DayLoad, readiness: loadStats.readinessScore });
      setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch {
      setMessages(prev => [...prev, { role: 'model', text: "Service unavailable." }]);
    } finally { setIsChatLoading(false); }
  };

  const handleClearCache = () => {
    localStorage.clear();
    if ('serviceWorker' in navigator) {
      caches.keys().then(names => {
        for (let name of names) caches.delete(name);
      });
    }
    window.location.reload();
  };

  if (loading) return (
    <div className="phone-container flex flex-col items-center justify-center p-8 h-[100dvh]">
      <div className="gradient-bg"></div>
      <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
      <p className="text-white font-bold tracking-tight animate-pulse">Syncing History...</p>
    </div>
  );

  if (!creds || syncError) return (
    <div className="phone-container flex flex-col p-6 min-h-[100dvh] py-12">
      <div className="gradient-bg"></div>
      <div className="glass-panel p-8 rounded-[2.5rem] shadow-2xl mb-6 text-center">
        <div className="w-20 h-20 bg-cyan-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 ring-1 ring-cyan-500/20">
          <CyclistIcon size={48} className="text-cyan-400" />
        </div>
        <h1 className="text-3xl mb-2 logo-text">WaTTson</h1>
        {syncError ? (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-6 text-left">
            <div className="flex items-center gap-2 text-red-400 mb-1">
              <AlertTriangle size={16} />
              <span className="text-xs font-bold uppercase">Sync Error</span>
            </div>
            <p className="text-red-200 text-xs leading-relaxed">{syncError}</p>
          </div>
        ) : (
          <p className="text-slate-400 text-sm mb-8 italic">AI-Driven Performance Optimization</p>
        )}
        <div className="space-y-4">
          <input type="password" value={formKey} onChange={(e) => setFormKey(e.target.value)} placeholder="Intervals.icu API Key" className="w-full bg-slate-900/60 border border-slate-700/50 rounded-2xl px-5 py-4 text-white text-sm" />
          <button onClick={() => loadData({ apiKey: formKey, athleteId: '0' }, true)} disabled={!formKey} className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all">Connect</button>
          <button onClick={() => { setCreds({apiKey: 'demo', athleteId: 'demo'}); setActivities(getMockActivities()); setWellnessData(getMockWellness()); setSyncError(null); }} className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-4">Try Demo</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="phone-container flex flex-col h-[100dvh] overflow-hidden">
      <div className="gradient-bg"></div>
      <div className="flex-1 flex flex-col overflow-hidden p-4 pb-24 custom-scrollbar" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
        
        {activeTab === 'dashboard' && (
          <div className="flex flex-col gap-3 h-full overflow-hidden">
            {!isExpanded && (
              <header className="flex items-center justify-between px-1 shrink-0 mb-1">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 backdrop-blur-sm shadow-inner shadow-white/5">
                    <CyclistIcon size={20} className="text-cyan-400" />
                  </div>
                  <div>
                    <h1 className="text-xl logo-text leading-none">WaTTson</h1>
                    <div onClick={() => setShowGoalEditor(true)} className="flex items-center gap-1 cursor-pointer pt-0.5">
                      <Target size={10} className="text-cyan-500/80" />
                      <span className="text-slate-500 text-[9px] font-black uppercase tracking-tighter truncate max-w-[140px] border-b border-transparent hover:border-cyan-500/30 transition-all">{userGoal}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setSuggestion(null); loadData(creds!); }} disabled={isSyncing} className="w-9 h-9 rounded-xl glass-panel flex items-center justify-center text-slate-500 hover:text-cyan-400 transition-colors">
                  <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                </button>
              </header>
            )}

            <div className={`glass-panel rounded-[2.5rem] p-6 bg-gradient-to-br from-cyan-900/10 to-slate-900/60 border-white/10 shadow-2xl relative transition-all duration-500 flex flex-col ${isExpanded ? 'flex-1 z-50 mb-0' : 'shrink-0 min-h-[220px]'}`}>
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                    <Sparkles size={12} className="text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em]">Today's Focus</span>
                </div>
                {suggestion && (
                  <button onClick={() => setShowAlternative(!showAlternative)} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 text-[9px] font-black text-slate-400 active:scale-95 hover:bg-white/10 transition-all uppercase tracking-widest">
                    <Repeat size={10} /> {showAlternative ? 'Indoor' : 'Outdoor'}
                  </button>
                )}
              </div>

              {loadingSuggestion ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-6 h-6 border-2 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin"></div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest animate-pulse">Consulting AI...</p>
                </div>
              ) : currentWorkout ? (
                <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="shrink-0 mb-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border tracking-wider ${
                        currentWorkout.type?.toLowerCase().includes('interval') 
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {currentWorkout.type}
                      </span>
                    </div>
                    <h2 className="text-2xl font-black text-white leading-tight tracking-tight italic">{currentWorkout.title}</h2>
                  </div>

                  <div className={`overflow-y-auto custom-scrollbar flex-1 mb-4 ${isExpanded ? 'max-h-full' : 'max-h-[80px]'}`}>
                     <p className={`text-slate-300 text-sm leading-relaxed font-medium ${isExpanded ? '' : 'line-clamp-3'}`}>
                       {currentWorkout.description}
                     </p>
                     
                     {isExpanded && (
                       <div className="mt-6 p-5 bg-slate-950/60 rounded-3xl border border-white/5 text-xs text-slate-300 leading-relaxed italic animate-in zoom-in duration-300 shadow-inner">
                         <div className="text-[10px] font-black text-cyan-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Info size={14} /> Coach Reasoning
                         </div>
                         <p className="font-light">"{suggestion?.reasoning}"</p>
                       </div>
                     )}
                  </div>

                  <div className="flex items-center justify-between shrink-0 pt-4 border-t border-white/10 mt-auto">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-black text-white bg-white/10 px-3 py-2 rounded-xl shadow-inner"><Clock size={14} className="text-blue-400" /> {currentWorkout.duration_minutes}M</div>
                      <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-400 bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-500/10 shadow-inner"><Zap size={14} fill="currentColor" /> {currentWorkout.intensity}</div>
                    </div>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 py-2 px-4 bg-white/5 rounded-xl hover:text-cyan-400 hover:bg-white/10 transition-all flex items-center gap-1">
                      {isExpanded ? 'Summary' : 'Coaching Details'} <ChevronRight size={12} className={`transition-transform duration-300 ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center opacity-30">
                  <p className="text-xs font-bold uppercase tracking-[0.2em]">No session generated</p>
                </div>
              )}
            </div>

            {!isExpanded && (
              <div className={`glass-panel p-6 rounded-[2.5rem] bg-slate-900/40 border-white/5 shadow-inner flex flex-col shrink-0 min-h-[200px] transition-all duration-300 overflow-hidden ${loadStats.glowColor}`}>
                <div className="flex justify-between items-start mb-6 shrink-0">
                  <div>
                    <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">Fitness Status</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-black italic tracking-tighter uppercase ${loadStats.statusColor}`}>{loadStats.statusLabel}</span>
                      <span className="text-slate-800 text-lg">•</span>
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{loadStats.total7DayLoad} TSS / WK</span>
                    </div>
                  </div>
                  <button onClick={() => setShowReadinessInfo(true)} className={`w-11 h-11 rounded-[1.2rem] flex flex-col items-center justify-center ${loadStats.statusBg} border border-white/10 shadow-xl active:scale-90 transition-transform`}>
                    <span className={`text-base font-black leading-none ${loadStats.statusColor}`}>{loadStats.readinessScore}</span>
                    <span className="text-[7px] font-black text-slate-600 uppercase tracking-tighter mt-0.5">SCORE</span>
                  </button>
                </div>
                <div className="flex-1 w-full relative min-h-[100px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={loadStats.last7Days} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#475569', fontWeight: '900'}} dy={6} />
                      <YAxis hide domain={[0, 'auto']} />
                      <Bar dataKey="load" radius={[6, 6, 6, 6]} barSize={24}>
                        {loadStats.last7Days.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 6 ? '#22d3ee' : '#1e293b'} fillOpacity={index === 6 ? 1 : 0.6} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'rides' && (
          <div className="space-y-4 h-full overflow-y-auto custom-scrollbar pr-1">
             <div className="flex items-center justify-between px-1 mb-2 shrink-0">
                <h1 className="text-2xl font-black text-white tracking-tighter italic">TRAINING HISTORY</h1>
                <button onClick={() => setShowWeeklyBriefing(true)} className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl text-cyan-400 text-[10px] font-black uppercase tracking-widest active:scale-95 shadow-xl transition-all">
                  <Calendar size={14} /> 7-DAY OUTLOOK
                </button>
             </div>
             <div className="space-y-3 pb-8">
               {activities.sort((a,b) => b.start_date_local.localeCompare(a.start_date_local)).slice(0, 25).map(a => (
                 <ActivityCard key={a.id} activity={a} onClick={setSelectedActivity} />
               ))}
               {activities.length === 0 && <div className="py-24 text-center opacity-30 italic text-sm font-bold uppercase tracking-widest">No activities recorded</div>}
             </div>
          </div>
        )}

        {activeTab === 'chat' && (
           <div className="flex flex-col h-full overflow-hidden">
             <div className="flex items-center justify-between px-1 mb-4 shrink-0">
               <h1 className="text-2xl font-black text-white tracking-tighter italic">COACH CHAT</h1>
               <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                 <Bot size={16} />
               </div>
             </div>
             <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 custom-scrollbar">
               {messages.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-8">
                   <div className="w-20 h-20 bg-cyan-500/10 rounded-[2.5rem] flex items-center justify-center mb-6 ring-1 ring-cyan-500/20">
                     <MessageSquare size={40} className="text-cyan-500" />
                   </div>
                   <p className="text-[12px] font-black uppercase tracking-[0.3em] leading-relaxed">System Ready.<br/>Awaiting commands.</p>
                 </div>
               ) : messages.map((msg, idx) => (
                 <div key={idx} className={`flex gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                   <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'user' ? 'bg-slate-800 text-slate-400' : 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white ring-1 ring-white/20'}`}>
                     {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                   </div>
                   <div className={`max-w-[85%] p-4 rounded-3xl text-[13px] shadow-xl whitespace-pre-wrap leading-relaxed ${msg.role === 'user' ? 'bg-slate-900/80 text-white rounded-tr-sm border border-white/5' : 'glass-panel text-slate-200 rounded-tl-sm border-cyan-500/10'}`}>
                     {msg.text}
                   </div>
                 </div>
               ))}
               {isChatLoading && (
                 <div className="flex gap-3 animate-pulse">
                   <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 ring-1 ring-cyan-500/30 shadow-lg"><Bot size={14} /></div>
                   <div className="bg-slate-900/50 p-4 rounded-3xl rounded-tl-sm border border-white/5 w-16">
                     <div className="flex gap-1.5 justify-center">
                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                     </div>
                   </div>
                 </div>
               )}
               <div ref={chatEndRef} />
             </div>
             <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(chatInput); }} className="relative mb-2 shrink-0">
               <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Consult WaTTson..." className="w-full bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-4 text-[14px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/40 shadow-2xl" />
               <button type="submit" disabled={!chatInput.trim() || isChatLoading} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-[0.8rem] flex items-center justify-center text-white active:scale-90 shadow-lg transition-transform disabled:opacity-50">
                 <Send size={16} />
               </button>
             </form>
           </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4 h-full overflow-y-auto custom-scrollbar pb-8 pr-1">
             <h1 className="text-2xl font-black text-white mb-4 tracking-tighter italic px-1">PROFILE</h1>
             <div onClick={() => setShowGoalEditor(true)} className="glass-panel p-6 rounded-[2.5rem] border-white/5 space-y-4 cursor-pointer hover:bg-white/5 active:scale-[0.99] transition-all group shadow-xl">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Training Goal</p>
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors"><Target size={14} className="text-cyan-400" /></div>
                </div>
                <div className="bg-slate-950/40 p-5 rounded-2xl border border-white/5 group-hover:border-cyan-500/30 transition-all shadow-inner">
                  <p className="text-sm font-bold text-white leading-relaxed">{userGoal}</p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="h-px bg-slate-800 flex-1"></div>
                  <p className="text-[9px] text-cyan-600 font-black uppercase tracking-widest">Adjust Strategy</p>
                  <div className="h-px bg-slate-800 flex-1"></div>
                </div>
             </div>
             <div className="glass-panel p-6 rounded-[2.5rem] border-white/5 space-y-6 shadow-xl">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">System Preferences</p>
                <div className="flex items-center gap-4 p-3 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 border border-white/10 shadow-lg"><User size={24} /></div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-tighter">ATHLETE ID: {creds?.athleteId}</p>
                    <p className="text-[10px] text-emerald-500/70 font-black uppercase tracking-widest mt-0.5">INTERVALS.ICU SYNCED</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={handleClearCache} className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all flex items-center justify-center gap-2 shadow-lg"><RotateCcw size={14} /> Clear</button>
                  <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="py-4 text-[10px] font-black uppercase tracking-widest text-red-400/80 bg-red-500/5 rounded-2xl border border-red-500/10 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 shadow-lg"><LogOut size={14} /> Exit</button>
                </div>
             </div>
          </div>
        )}
      </div>

      {showGoalEditor && (
        <div className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-2xl flex flex-col p-6 animate-in fade-in slide-in-from-bottom-8 duration-500 h-[100dvh] max-w-[450px] mx-auto">
          <div className="flex items-center justify-between mb-8" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tighter italic">TRAINING STRATEGY</h2>
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mt-1">Refining AI Perspective</p>
            </div>
            <button onClick={() => setShowGoalEditor(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-colors border border-white/10 shadow-xl"><X size={20} /></button>
          </div>
          <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-10">
            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Current Ambition</label>
              <textarea value={userGoal} onChange={(e) => setUserGoal(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-[2rem] p-6 text-[15px] font-medium text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 min-h-[160px] shadow-2xl" placeholder="Ex: I want to finish my first 100-mile ride..." />
            </div>
            <div className="space-y-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Strategic Blueprints</p>
              <div className="grid grid-cols-1 gap-3">
                {GOAL_SUGGESTIONS.map((g, i) => (
                  <button key={i} onClick={() => setUserGoal(g.text)} className="p-5 bg-white/5 border border-white/10 rounded-[1.5rem] text-left hover:border-cyan-500/40 active:scale-[0.98] group transition-all shadow-lg">
                    <p className="text-[11px] font-black text-cyan-400 uppercase tracking-[0.15em] mb-1.5">{g.title}</p>
                    <p className="text-[13px] text-slate-400 leading-relaxed group-hover:text-slate-200 transition-colors">{g.text}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="pt-4 pb-8 shrink-0">
            <button onClick={() => handleSaveGoal(userGoal)} className="w-full py-5 bg-gradient-to-br from-cyan-600 to-blue-700 text-white font-black text-[12px] uppercase tracking-[0.25em] rounded-2xl shadow-2xl active:scale-95 transition-all ring-1 ring-white/20">
              Apply Strategy
            </button>
          </div>
        </div>
      )}

      {showReadinessInfo && (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in-95 duration-200">
          <div className="glass-panel w-full max-w-[340px] rounded-[3rem] p-10 relative border border-white/15 shadow-2xl">
            <button onClick={() => setShowReadinessInfo(false)} className="absolute top-8 right-8 text-slate-600 hover:text-white transition-colors"><X size={20} /></button>
            <div className="flex flex-col items-center text-center space-y-6">
              <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center ${loadStats.statusBg} border border-white/10 mb-2 shadow-2xl ring-1 ring-white/10`}>
                <span className={`text-4xl font-black italic tracking-tighter ${loadStats.statusColor}`}>{loadStats.readinessScore}</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-white tracking-tight uppercase italic mb-1">Status: {loadStats.statusLabel}</h3>
                <p className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Global Readiness Score</p>
              </div>
              <div className="bg-slate-950/60 p-5 rounded-2xl border border-white/5 shadow-inner w-full">
                <p className="text-slate-400 text-xs leading-relaxed italic font-light">"Analyzed over 42-day rolling window using exponential load tracking metrics."</p>
              </div>
              <div className="w-full space-y-4 pt-2 text-left">
                <div className="flex gap-4 items-center group"><div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 ring-1 ring-cyan-500/20"><TrendingUp size={16} /></div><div className="flex-1 flex justify-between items-baseline border-b border-white/5 pb-1"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Fitness (CTL)</p><p className="text-sm font-black text-white italic">{loadStats.ctl.toFixed(1)}</p></div></div>
                <div className="flex gap-4 items-center group"><div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 ring-1 ring-amber-500/20"><Scale size={16} /></div><div className="flex-1 flex justify-between items-baseline border-b border-white/5 pb-1"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Form (TSB)</p><p className="text-sm font-black text-white italic">{loadStats.form.toFixed(1)}</p></div></div>
                <div className="flex gap-4 items-center group"><div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 ring-1 ring-emerald-500/20"><Zap size={16} /></div><div className="flex-1 flex justify-between items-baseline border-b border-white/5 pb-1"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Ramp Ratio</p><p className="text-sm font-black text-white italic">{loadStats.rampRate.toFixed(2)}</p></div></div>
              </div>
              <button onClick={() => setShowReadinessInfo(false)} className="mt-4 w-full py-4 bg-white/10 rounded-2xl text-[11px] font-black text-white uppercase tracking-[0.2em] hover:bg-white/20 transition-all shadow-lg">Understood</button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation - Enhanced aesthetics */}
      <nav className="fixed bottom-6 left-5 right-5 max-w-[410px] mx-auto h-16 nav-pill rounded-[1.5rem] flex items-center justify-around z-[100] px-4 shadow-2xl">
        <button onClick={() => { setActiveTab('dashboard'); setIsExpanded(false); }} className={`flex-1 flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'dashboard' ? 'text-cyan-400 scale-110 drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-500 opacity-60'}`}>
          <LayoutDashboard size={20} strokeWidth={activeTab === 'dashboard' ? 3 : 2} />
          <span className="text-[9px] font-black uppercase tracking-tighter">Home</span>
        </button>
        <button onClick={() => setActiveTab('rides')} className={`flex-1 flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'rides' ? 'text-cyan-400 scale-110 drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-500 opacity-60'}`}>
          <Bike size={20} strokeWidth={activeTab === 'rides' ? 3 : 2} />
          <span className="text-[9px] font-black uppercase tracking-tighter">Rides</span>
        </button>
        <button onClick={() => setActiveTab('chat')} className={`flex-1 flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'chat' ? 'text-cyan-400 scale-110 drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-500 opacity-60'}`}>
          <MessageSquare size={20} strokeWidth={activeTab === 'chat' ? 3 : 2} />
          <span className="text-[9px] font-black uppercase tracking-tighter">Coach</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'settings' ? 'text-cyan-400 scale-110 drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-500 opacity-60'}`}>
          <User size={20} strokeWidth={activeTab === 'settings' ? 3 : 2} />
          <span className="text-[9px] font-black uppercase tracking-tighter">Profile</span>
        </button>
      </nav>

      {selectedActivity && creds && <CoachingModal activity={selectedActivity} creds={creds} onClose={() => setSelectedActivity(null)} userGoal={userGoal} />}
      {showWeeklyBriefing && creds && <WeeklyBriefingModal activities={activities} wellness={wellnessData} creds={creds} userGoal={userGoal} onClose={() => setShowWeeklyBriefing(false)} todaySuggestion={suggestion} />}
    </div>
  );
};

export default App;
