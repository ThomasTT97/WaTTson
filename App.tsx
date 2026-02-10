
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
  PlusCircle,
  Trophy,
  Activity as ActivityIcon,
  Flame,
  Scale,
  Repeat,
  Compass,
  Layers,
  Calendar
} from 'lucide-react';

// Custom Cyclist Icon matching the user's requested style
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
    try {
      const [fetchedActivities, fetchedWellness] = await Promise.all([
        fetchActivities(credentials),
        fetchWellness(credentials)
      ]);
      setActivities(fetchedActivities);
      setWellnessData(fetchedWellness);
      setCreds(credentials);
      localStorage.setItem('wattson_creds', JSON.stringify(credentials));
    } catch (err) {
      console.error(err);
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
    if (activities.length > 0 && !loadingSuggestion && (!suggestion || suggestion.date !== todayStr)) {
      const triggerSuggestion = async () => {
        setLoadingSuggestion(true);
        try {
          const data = await getDailySuggestion(activities, userGoal);
          setSuggestion(data);
          localStorage.setItem('wattson_daily_cache', JSON.stringify(data));
        } catch {} finally { setLoadingSuggestion(false); }
      };
      triggerSuggestion();
    }
  }, [activities, userGoal]);

  const loadStats = useMemo(() => {
    const loadByDate = new Map<string, number>();
    const last7Days = [];
    const now = new Date();
    
    activities.forEach(a => {
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
    const wellnessLatest = wellnessData[wellnessData.length - 1];
    const form = wellnessLatest?.tsb ?? 0;
    const ctl = wellnessLatest?.ctl ?? 1;
    const atl = wellnessLatest?.atl ?? 0;
    const rampRate = atl / ctl;
    
    let score = 5.0;
    if (form > 25) score = 6.5;
    else if (form >= 5) score = 9.5;
    else if (form >= -10) score = 8.0;
    else if (form >= -30) score = 5.5;
    else score = 2.0;

    if (rampRate > 1.5) score -= 2.0;
    else if (rampRate > 1.3) score -= 1.0;
    else if (rampRate >= 0.8) score += 0.5;
    else score -= 0.5;

    const readinessScore = Math.min(10, Math.max(1, Math.round(score)));

    let statusLabel = 'Maintaining';
    let statusColor = 'text-cyan-400';
    let statusBg = 'bg-cyan-500/10';

    if (form > 5) { statusLabel = 'Fresh'; statusColor = 'text-sky-400'; statusBg = 'bg-sky-500/10'; }
    else if (form >= -10) { statusLabel = 'Optimal'; statusColor = 'text-emerald-400'; statusBg = 'bg-emerald-500/10'; }
    else if (form >= -30) { statusLabel = 'Building'; statusColor = 'text-amber-400'; statusBg = 'bg-amber-500/10'; }
    else { statusLabel = 'Overreaching'; statusColor = 'text-red-400'; statusBg = 'bg-red-500/10'; }

    return { last7Days, total7DayLoad, statusLabel, statusColor, statusBg, readinessScore, form, rampRate };
  }, [activities, wellnessData, suggestion]);

  const currentWorkout: WorkoutOption | null = suggestion ? (showAlternative ? suggestion.alternative : suggestion.primary) : null;

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

  const handleSaveGoal = (goal: string) => {
    setUserGoal(goal);
    localStorage.setItem('wattson_goal', goal);
    setShowGoalEditor(false);
    setSuggestion(null);
    localStorage.removeItem('wattson_daily_cache');
  };

  if (loading) return (
    <div className="phone-container flex flex-col items-center justify-center p-8 h-[100dvh]">
      <div className="gradient-bg"></div>
      <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
      <p className="text-white font-bold tracking-tight">Syncing History...</p>
    </div>
  );

  if (!creds) return (
    <div className="phone-container flex flex-col p-6 min-h-[100dvh] py-12">
      <div className="gradient-bg"></div>
      <div className="glass-panel p-8 rounded-[2.5rem] shadow-2xl mb-6 text-center">
        <div className="w-20 h-20 bg-cyan-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 ring-1 ring-cyan-500/20">
          <CyclistIcon size={48} className="text-cyan-400" />
        </div>
        <h1 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase italic">WaTTson</h1>
        <p className="text-slate-400 text-sm mb-8 italic">AI-Driven Performance Optimization</p>
        <div className="space-y-4">
          <input type="password" value={formKey} onChange={(e) => setFormKey(e.target.value)} placeholder="Intervals.icu API Key" className="w-full bg-slate-900/60 border border-slate-700/50 rounded-2xl px-5 py-4 text-white text-sm" />
          <button onClick={() => loadData({ apiKey: formKey, athleteId: '0' }, true)} disabled={!formKey} className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all">Connect</button>
          <button onClick={() => { setCreds({apiKey: 'demo', athleteId: 'demo'}); setActivities(getMockActivities()); setWellnessData(getMockWellness()); }} className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-4">Try Demo</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="phone-container flex flex-col h-[100dvh] overflow-hidden">
      <div className="gradient-bg"></div>
      <div className="flex-1 overflow-y-auto p-5 pb-24 custom-scrollbar" style={{ paddingTop: 'max(env(safe-area-inset-top), 1.5rem)' }}>
        
        {activeTab === 'dashboard' && (
          <div className="flex flex-col space-y-4">
            <header className="flex items-start justify-between px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-lg shadow-cyan-500/10 ring-1 ring-white/5 backdrop-blur-sm">
                    <CyclistIcon size={22} className="text-cyan-400" />
                  </div>
                  <h1 className="text-2xl font-black text-white tracking-tighter uppercase italic">WaTTson</h1>
                </div>
                <div onClick={() => setShowGoalEditor(true)} className="flex items-center gap-1.5 cursor-pointer group pt-1">
                  <Target size={12} className="text-cyan-500 group-hover:scale-110 transition-transform" />
                  <span className="text-slate-400 text-xs font-medium truncate max-w-[200px] border-b border-white/5 group-hover:text-cyan-400">{userGoal}</span>
                </div>
              </div>
              <button onClick={() => { setSuggestion(null); loadData(creds!); }} disabled={isSyncing} className="w-10 h-10 rounded-2xl glass-panel flex items-center justify-center text-slate-400 hover:bg-white/5 transition-colors">
                <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
              </button>
            </header>

            <div className="glass-panel rounded-[2.5rem] p-6 bg-gradient-to-br from-cyan-900/20 to-slate-900/60 border-white/10 shadow-xl overflow-hidden relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-cyan-400" />
                  <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">Training Suggestion</span>
                </div>
                {suggestion && (
                  <button 
                    onClick={() => setShowAlternative(!showAlternative)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-bold text-slate-400 hover:text-white transition-all active:scale-95"
                  >
                    <Repeat size={10} /> {showAlternative ? 'Indoor Intervals' : 'Outdoor Option'}
                  </button>
                )}
              </div>

              {loadingSuggestion ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                  <p className="text-slate-400 text-xs italic">Consulting the Coach...</p>
                </div>
              ) : currentWorkout ? (
                <div className="space-y-4 animate-in fade-in duration-500">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      {currentWorkout.type === 'intervals' ? (
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/20">
                          <Layers size={10} /> Structured
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/20">
                          <Compass size={10} /> Outdoor
                        </div>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-white leading-tight">{currentWorkout.title}</h2>
                  </div>
                  
                  <p className={`text-slate-300 text-sm leading-relaxed whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-3'}`}>{currentWorkout.description}</p>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-white/10 px-3 py-1.5 rounded-full"><Clock size={12} /> {currentWorkout.duration_minutes}m</div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/10"><Zap size={12} fill="currentColor" /> {currentWorkout.intensity}</div>
                  </div>

                  <button onClick={() => setIsExpanded(!isExpanded)} className="w-full text-[10px] font-bold uppercase tracking-widest text-slate-500 pt-2 flex items-center justify-center gap-1 hover:text-cyan-400 transition-colors">
                    {isExpanded ? 'Hide Context' : 'Coach Reasoning'} <ChevronRight size={10} className={isExpanded ? '-rotate-90' : 'rotate-90'} />
                  </button>
                  {isExpanded && <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 text-xs text-slate-400 leading-relaxed italic">"{suggestion?.reasoning}"</div>}
                </div>
              ) : (
                <div className="py-6 text-center opacity-40">
                  <p className="text-xs italic">Sync history to get suggestions</p>
                </div>
              )}
            </div>

            <div className="glass-panel p-6 rounded-[2.5rem] bg-slate-900/40 border-white/5 shadow-inner">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fitness Readiness</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${loadStats.statusColor}`}>{loadStats.statusLabel}</span>
                    <span className="text-slate-700">•</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{loadStats.total7DayLoad} TSS / wk</span>
                  </div>
                </div>
                <button 
                  onClick={() => setShowReadinessInfo(true)}
                  className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center ${loadStats.statusBg} border border-white/10 active:scale-95 transition-all shadow-lg hover:brightness-110`}
                >
                  <span className={`text-base font-black ${loadStats.statusColor}`}>{loadStats.readinessScore}</span>
                  <span className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter">Score</span>
                </button>
              </div>
              <div className="h-44 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={loadStats.last7Days} margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} dy={10} />
                    <YAxis hide domain={[0, 'auto']} />
                    <Bar dataKey="load" radius={[6, 6, 6, 6]} barSize={24}>
                      {loadStats.last7Days.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 6 ? '#22d3ee' : '#334155'} fillOpacity={index === 6 ? 1 : 0.4} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rides' && (
          <div className="space-y-4">
             <div className="flex items-center justify-between px-1 mb-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Rides</h1>
                <button 
                  onClick={() => setShowWeeklyBriefing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400 text-xs font-bold uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-cyan-500/5"
                >
                  <Calendar size={14} /> 7-Day Outlook
                </button>
             </div>
             
             <div className="space-y-3">
               {activities.sort((a,b) => b.start_date_local.localeCompare(a.start_date_local)).slice(0, 25).map(a => (
                 <ActivityCard key={a.id} activity={a} onClick={setSelectedActivity} />
               ))}
               {activities.length === 0 && (
                 <div className="py-20 text-center opacity-40 italic text-sm">No rides recorded yet.</div>
               )}
             </div>
          </div>
        )}

        {activeTab === 'chat' && (
           <div className="flex flex-col h-full">
             <h1 className="text-2xl font-bold text-white mb-4 px-1 tracking-tight">Coach WaTTson</h1>
             <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 custom-scrollbar">
               {messages.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center opacity-40 text-center p-8">
                   <Bot size={48} className="text-cyan-500 mb-4" />
                   <p className="text-sm font-medium">I'm ready to coach. Ask me about your power numbers, recovery, or training plan.</p>
                 </div>
               ) : messages.map((msg, idx) => (
                 <div key={idx} className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-700 text-slate-300' : 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30 shadow-sm'}`}>
                     {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                   </div>
                   <div className={`max-w-[85%] p-4 rounded-2xl text-[13px] shadow-lg whitespace-pre-wrap leading-relaxed ${msg.role === 'user' ? 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-tr-sm' : 'glass-panel text-slate-200 rounded-tl-sm border-white/5'}`}>
                     {msg.text}
                   </div>
                 </div>
               ))}
               {isChatLoading && (
                 <div className="flex gap-3 animate-pulse">
                   <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 ring-1 ring-cyan-500/30">
                     <Bot size={14} />
                   </div>
                   <div className="bg-slate-900/50 p-4 rounded-2xl rounded-tl-sm border border-white/5 w-16">
                     <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                        <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                     </div>
                   </div>
                 </div>
               )}
               <div ref={chatEndRef} />
             </div>
             <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(chatInput); }} className="relative mb-2">
               <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message WaTTson..." className="w-full bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-3xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50" />
               <button type="submit" disabled={!chatInput.trim() || isChatLoading} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-cyan-600 rounded-full flex items-center justify-center text-white active:scale-95 shadow-md">
                 <Send size={18} />
               </button>
             </form>
           </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
             <h1 className="text-2xl font-bold text-white mb-4 tracking-tight px-1">Athlete Profile</h1>
             
             <div onClick={() => setShowGoalEditor(true)} className="glass-panel p-6 rounded-[2.5rem] border-white/5 space-y-4 cursor-pointer hover:bg-white/5 transition-colors group">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Training Goal</p>
                  <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-all">
                    <Target size={14} className="text-cyan-400" />
                  </div>
                </div>
                <div className="bg-slate-950/40 p-5 rounded-2xl border border-white/5 group-hover:border-cyan-500/20 transition-colors">
                  <p className="text-sm font-bold text-white leading-relaxed">{userGoal}</p>
                </div>
                <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider text-center pt-2">Tap to edit objective</p>
             </div>

             <div className="glass-panel p-6 rounded-[2.5rem] border-white/5 space-y-6">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Configuration</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 border border-white/5 shadow-inner">
                    <User size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Athlete ID: {creds?.athleteId}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Connected to Intervals.icu</p>
                  </div>
                </div>
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full p-4 text-sm font-bold text-red-400 bg-red-500/5 hover:bg-red-500/10 rounded-2xl border border-red-500/10 flex items-center justify-center gap-2 transition-colors"><LogOut size={16} /> Disconnect Account</button>
             </div>
          </div>
        )}
      </div>

      {/* Goal Editor Modal */}
      {showGoalEditor && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex flex-col p-6 animate-in fade-in slide-in-from-bottom duration-300 h-[100dvh] max-w-[450px] mx-auto">
          <div className="flex items-center justify-between mb-8" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <h2 className="text-2xl font-bold text-white tracking-tight">Define Your Focus</h2>
            <button onClick={() => setShowGoalEditor(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400"><X size={20} /></button>
          </div>

          <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-1">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Current Ambition</label>
              <textarea 
                value={userGoal} 
                onChange={(e) => setUserGoal(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-[2rem] p-6 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 min-h-[140px] shadow-inner"
                placeholder="Ex: I want to finish my first 100-mile ride without cramping."
              />
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Example Objectives</p>
              <div className="grid grid-cols-1 gap-2.5">
                {GOAL_SUGGESTIONS.map((g, i) => (
                  <button 
                    key={i} 
                    onClick={() => setUserGoal(g.text)}
                    className="p-5 bg-white/5 border border-white/5 rounded-2xl text-left hover:border-cyan-500/40 transition-all active:scale-[0.98] group"
                  >
                    <p className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-1 group-hover:text-cyan-300">{g.title}</p>
                    <p className="text-[13px] text-slate-400 leading-snug group-hover:text-slate-200">{g.text}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={() => handleSaveGoal(userGoal)}
            className="mt-6 w-full py-5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-[2rem] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 mb-4"
          >
            <Trophy size={18} /> Update Training Goal
          </button>
        </div>
      )}

      {/* Readiness Explanation Modal */}
      {showReadinessInfo && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in duration-200">
          <div className="glass-panel w-full max-w-[340px] rounded-[3rem] p-8 relative border border-white/10 shadow-2xl">
            <button onClick={() => setShowReadinessInfo(false)} className="absolute top-6 right-6 text-slate-600 hover:text-white transition-colors"><X size={18} /></button>
            
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center ${loadStats.statusBg} border border-white/10 mb-2 shadow-inner`}>
                <span className={`text-4xl font-black ${loadStats.statusColor}`}>{loadStats.readinessScore}</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">Scientific Readiness: {loadStats.readinessScore}/10</h3>
              
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5">
                <p className="text-slate-400 text-[12px] leading-relaxed italic">
                  "Calculated using Training Stress Balance (TSB) and ACWR Workload Ratios."
                </p>
              </div>
              
              <div className="w-full space-y-4 pt-2 text-left">
                <div className="flex gap-3 items-start">
                  <div className="mt-1"><Scale size={14} className="text-cyan-500" /></div>
                  <div>
                    <p className="text-xs font-bold text-slate-200">Form: {loadStats.form.toFixed(1)} TSB</p>
                    <p className="text-[11px] text-slate-500 leading-normal">Your freshness level. Values between +5 and +25 indicate peak readiness.</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="mt-1"><Clock size={14} className="text-emerald-500" /></div>
                  <div>
                    <p className="text-xs font-bold text-slate-200">Ramp Rate: {loadStats.rampRate.toFixed(2)}</p>
                    <p className="text-[11px] text-slate-500 leading-normal">The 'Sweet Spot' for safe training load increase is between 0.8 and 1.3.</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowReadinessInfo(false)}
                className="mt-6 w-full py-3 bg-white/10 rounded-full text-xs font-bold text-white hover:bg-white/20 transition-colors uppercase tracking-widest"
              >
                Got it, Coach
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-6 left-6 right-6 max-w-[402px] mx-auto h-16 nav-pill rounded-[1.5rem] flex items-center justify-around z-50">
        <button onClick={() => setActiveTab('dashboard')} className={`flex-1 flex flex-col items-center gap-1 transition-all ${activeTab === 'dashboard' ? 'text-cyan-400 scale-110' : 'text-slate-500'}`}>
          <LayoutDashboard size={20} />
          <span className="text-[9px] font-bold">Home</span>
        </button>
        <button onClick={() => setActiveTab('rides')} className={`flex-1 flex flex-col items-center gap-1 transition-all ${activeTab === 'rides' ? 'text-cyan-400 scale-110' : 'text-slate-500'}`}>
          <Bike size={20} />
          <span className="text-[9px] font-bold">Rides</span>
        </button>
        <button onClick={() => setActiveTab('chat')} className={`flex-1 flex flex-col items-center gap-1 transition-all ${activeTab === 'chat' ? 'text-cyan-400 scale-110' : 'text-slate-500'}`}>
          <MessageSquare size={20} />
          <span className="text-[9px] font-bold">Coach</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-cyan-400 scale-110' : 'text-slate-500'}`}>
          <User size={20} />
          <span className="text-[9px] font-bold">Profile</span>
        </button>
      </nav>

      {selectedActivity && creds && (
        <CoachingModal activity={selectedActivity} creds={creds} onClose={() => setSelectedActivity(null)} userGoal={userGoal} />
      )}

      {showWeeklyBriefing && creds && (
        <WeeklyBriefingModal 
          activities={activities} 
          wellness={wellnessData} 
          creds={creds} 
          userGoal={userGoal}
          onClose={() => setShowWeeklyBriefing(false)} 
          todaySuggestion={suggestion}
        />
      )}
    </div>
  );
};

export default App;
