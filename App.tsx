import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, 
  IntervalsCredentials, 
  DailySuggestion,
  ChatMessage,
  Wellness,
  UserProfileAnalysis
} from './types';
import { fetchActivities, fetchWellness, fetchAthleteId, fetchAthleteProfile } from './services/intervalsService';
import { getDailySuggestion, sendChatMessage, getWeeklyBriefing, analyzeUserProfile } from './services/geminiService';
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
  Settings,
  Shield,
  Database,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Activity as ActivityIcon,
  History,
  MoreVertical,
  Check
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

  const [activities, setActivities] = useState<Activity[] | null>(() => {
    try {
      const saved = localStorage.getItem('wattson_activities_cache');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  
  const hasRideToday = useMemo(() => {
    if (!activities) return false;
    const todayStr = toLocalDateStr(new Date());
    return activities.some(a => a.start_date_local.startsWith(todayStr));
  }, [activities]);

  const [wellnessData, setWellnessData] = useState<Wellness[]>(() => {
    try {
      const saved = localStorage.getItem('wattson_wellness_cache');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [ftp, setFtp] = useState<number | null>(() => {
    const saved = localStorage.getItem('wattson_ftp');
    return saved ? parseInt(saved, 10) : null;
  });
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeepSyncing, setIsDeepSyncing] = useState(false);
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
  const [settingsView, setSettingsView] = useState<'main' | 'goal' | 'data' | 'methodology'>('main');
  const [userProfile, setUserProfile] = useState<UserProfileAnalysis | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isWorkoutExpanded, setIsWorkoutExpanded] = useState(false);
  const [reasoningPopup, setReasoningPopup] = useState<{title: string, content: string} | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  const APP_VERSION = "1.1.0";

  useEffect(() => {
    const seenVersion = localStorage.getItem('wattson_seen_version');
    if (seenVersion !== APP_VERSION) {
      setShowReleaseNotes(true);
      localStorage.setItem('wattson_seen_version', APP_VERSION);
    }
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('wattson_chat_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    localStorage.setItem('wattson_chat_history', JSON.stringify(messages));
  }, [messages]);

  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
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

      const [fetchedActivities, fetchedWellness, profile] = await Promise.all([
        fetchActivities(activeCreds),
        fetchWellness(activeCreds),
        activeCreds.apiKey === 'demo' ? Promise.resolve({ id: '0', icu_ftp: 250 }) : fetchAthleteProfile(activeCreds)
      ]);
      
      setActivities(fetchedActivities || []);
      setWellnessData(fetchedWellness || []);
      if (profile?.icu_ftp) {
        setFtp(profile.icu_ftp);
        localStorage.setItem('wattson_ftp', profile.icu_ftp.toString());
      }
      
      localStorage.setItem('wattson_activities_cache', JSON.stringify(fetchedActivities || []));
      localStorage.setItem('wattson_wellness_cache', JSON.stringify(fetchedWellness || []));
      
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

  const handleDeepSync = async (days: number) => {
    if (!creds || loading || isSyncing || isDeepSyncing) return;
    setIsDeepSyncing(true);
    setIsChatMenuOpen(false);
    setSyncError(null);
    try {
      const [fetchedActivities, fetchedWellness] = await Promise.all([
        fetchActivities(creds, days),
        fetchWellness(creds, days)
      ]);
      
      setActivities(fetchedActivities || []);
      setWellnessData(fetchedWellness || []);
      
      localStorage.setItem('wattson_activities_cache', JSON.stringify(fetchedActivities || []));
      localStorage.setItem('wattson_wellness_cache', JSON.stringify(fetchedWellness || []));

      // Trigger coach acknowledgment
      if (fetchedActivities && fetchedActivities.length > 0) {
        const sorted = [...fetchedActivities].sort((a,b) => a.start_date_local.localeCompare(b.start_date_local));
        const oldestRide = sorted[0];
        const oldestDateStr = new Date(oldestRide.start_date_local).toLocaleDateString();
        
        const introMsg = `I've successfully expanded my deep-memory search. My access now extends back to ${oldestDateStr}.\n\nI can see your ride "${oldestRide.name}" from that day—you covered ${Math.round((oldestRide.distance || 0) / 1000)}km with a TSS of ${oldestRide.icu_training_load || oldestRide.icu_tss || 0}. I'll use this full history for our future analysis.`;
        
        setMessages(prev => [...prev, { role: 'model', text: introMsg }]);
      }
    } catch (err: any) {
      console.error("Deep sync error:", err);
      setSyncError(err.message || "Failed to fetch deep history");
    } finally {
      setIsDeepSyncing(false);
    }
  };

  const hasInitiallySynced = useRef(false);
  useEffect(() => {
    if (creds && !hasInitiallySynced.current && !syncError && !loading) {
      hasInitiallySynced.current = true;
      loadData(creds, activities === null);
    }
  }, [creds, activities, syncError, loading]);

  useEffect(() => {
    if (!activities || activities.length === 0) return;
    
    const today = new Date();
    const todayStr = toLocalDateStr(today);
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = toLocalDateStr(tomorrow);
    
    const targetStr = hasRideToday ? tomorrowStr : todayStr;
    const shouldFetch = !loadingSuggestion && 
                        (!suggestion || suggestion.date !== targetStr);

    if (shouldFetch) {
      const fetchNewSuggestion = async () => {
        setLoadingSuggestion(true);
        try {
          const data = await getDailySuggestion(activities!, userGoal, hasRideToday);
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
  }, [activities, userGoal, hasRideToday]);

  useEffect(() => {
    if (settingsView === 'methodology' && activities && activities.length > 0 && !userProfile && !isLoadingProfile) {
      const fetchProfile = async () => {
        setIsLoadingProfile(true);
        try {
          const profile = await analyzeUserProfile(activities, userGoal);
          setUserProfile(profile);
        } catch (err) {
          console.error("Failed to fetch user profile", err);
        } finally {
          setIsLoadingProfile(false);
        }
      };
      
      fetchProfile();
    }
  }, [settingsView, activities, userGoal, userProfile, isLoadingProfile]);

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
    
    let statusLabel = 'Optimal', statusColor = 'text-emerald-400', statusBg = 'bg-emerald-500/10';
    if (form > 5) { statusLabel = 'Fresh'; statusColor = 'text-emerald-400'; statusBg = 'bg-emerald-500/10'; }
    else if (form < -25) { statusLabel = 'Fatigued'; statusColor = 'text-rose-400'; statusBg = 'bg-rose-500/10'; }
    else if (form < -10) { statusLabel = 'Productive'; statusColor = 'text-amber-400'; statusBg = 'bg-amber-500/10'; }

    const recoveryProgress = form < 0 ? Math.max(10, 100 - (Math.abs(form) * 2)) : 100;
    const recoveryLabel = form < 0 ? `${Math.round(Math.abs(form) * 2.5)}h Recovery` : "Fully Primed";

    return { last7Days, total7DayLoad, statusLabel, statusColor, statusBg, readiness, recoveryProgress, recoveryLabel, form };
  }, [activities]);

  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isChatLoading) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
    }
    setIsChatLoading(true);
    try {
      const response = await sendChatMessage(messages, text, { 
        goal: userGoal, 
        recentLoad: stats.total7DayLoad, 
        readiness: stats.readiness,
        activities: activities || [],
        wellness: wellnessData || []
      });
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

  if (loading && (!activities || activities.length === 0)) return (
    <div className="phone-container flex flex-col items-center justify-center p-8 bg-transparent">
      <div className="premium-bg"></div>
      <div className="w-8 h-8 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Syncing Engine...</p>
    </div>
  );

  if (!creds || syncError) return (
    <div className="phone-container p-8 justify-center">
      <div className="premium-bg"></div>
      <div className="glass-card p-8 rounded-[2rem] text-center">
        <div className="w-12 h-12 bg-emerald-500/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5 shadow-inner">
          <CyclistIcon size={24} className="text-emerald-400" />
        </div>
        <h1 className="text-3xl font-black text-white italic mb-8 tracking-tight">wa<span className="text-emerald-400">TT</span>son</h1>
        <div className="space-y-3">
          {syncError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-400 font-bold leading-tight">
              {syncError}
            </div>
          )}
          <input 
            type="password" 
            placeholder="Intervals.icu API Key" 
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors" 
            value={formKey}
            onChange={(e) => {
              setFormKey(e.target.value);
              if (syncError) setSyncError(null);
            }}
          />
          <input 
            type="text" 
            placeholder="Athlete ID (e.g. i12345)" 
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors" 
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
            className="w-full bg-emerald-500 text-slate-950 font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-xl"
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
    <div className="phone-container overflow-hidden bg-transparent flex flex-col">
      <div className="premium-bg"></div>
      
      {/* Global Top Bar */}
      <header className="flex-none flex items-center justify-between py-4 px-4 bg-[#05070a] border-b border-white/5 z-30" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl glass-card flex flex-shrink-0 items-center justify-center shadow-inner relative overflow-hidden">
             {activeTab === 'chat' && isDeepSyncing && <div className="absolute inset-0 bg-emerald-500/20 animate-pulse" />}
             {activeTab === 'chat' ? <Bot size={18} className="text-emerald-400" /> : <CyclistIcon size={20} className="text-emerald-400" />}
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-white italic tracking-tight leading-none">wa<span className="text-emerald-400">TT</span>son</h2>
              {activeTab === 'chat' && isDeepSyncing && <RotateCcw size={12} className="animate-spin text-emerald-400" />}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          {activeTab === 'chat' ? (
            <div className="relative">
              <button 
                onClick={() => setIsChatMenuOpen(!isChatMenuOpen)}
                className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-slate-400 hover:text-emerald-400 transition-colors"
                title="Historical Sync Options"
              >
                <MoreVertical size={18} />
              </button>
              
              {isChatMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-900 rounded-[1.2rem] border border-white/20 shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200 p-1.5 text-left">
                  <button 
                    onClick={() => { setSuggestion(null); loadData(creds!); setIsChatMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-xl transition-colors text-left"
                  >
                    <RefreshCw size={14} className={isSyncing ? 'animate-spin text-emerald-400' : 'text-slate-400'} />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sync Recent</span>
                  </button>
                  
                  <div className="h-px bg-white/5 my-1 mx-2" />
                  <p className="px-3 py-1.5 text-[8px] font-black text-slate-600 uppercase tracking-widest">Historical Memory</p>
                  
                  <button 
                    onClick={() => handleDeepSync(365)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-emerald-500/10 rounded-xl transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <History size={14} className="text-slate-400 group-hover:text-emerald-400" />
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">1 Year</span>
                    </div>
                    {isDeepSyncing && <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />}
                  </button>
                  
                  <button 
                    onClick={() => handleDeepSync(365 * 2)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-emerald-500/10 rounded-xl transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <History size={14} className="text-slate-400 group-hover:text-emerald-400" />
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">2 Years</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => handleDeepSync(365 * 5)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-emerald-500/10 rounded-xl transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <History size={14} className="text-slate-400 group-hover:text-emerald-400" />
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">5 Years</span>
                    </div>
                  </button>
                  
                  <div className="h-px bg-white/5 my-1 mx-2" />
                  <button 
                    onClick={() => { setMessages([]); setIsChatMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-500/10 rounded-xl transition-colors text-left group"
                  >
                    <RotateCcw size={14} className="text-slate-400 group-hover:text-rose-400" />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest group-hover:text-rose-400">Reset Chat</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={() => { setSuggestion(null); loadData(creds!); }}
              disabled={isSyncing}
              className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-slate-400 hover:text-emerald-400 active:rotate-180 transition-all duration-700"
            >
              <RefreshCw size={16} className={isSyncing ? 'animate-spin text-emerald-400' : ''} />
            </button>
          )}
        </div>
      </header>

      {/* Scrollable View Area */}
      <div className={`flex-1 hide-scrollbar scroll-smooth flex flex-col relative ${activeTab === 'chat' ? 'p-0 overflow-hidden' : 'px-4 pb-6 pt-4 overflow-y-auto'}`}>

        {activeTab === 'dashboard' && (
          <div className="flex flex-col space-y-3 animate-in fade-in duration-500 pb-2">
            {/* Performance Status - Simplified 1-Screen Card - MOVED TO TOP */}
            <div className="glass-card p-4 rounded-[1.8rem] flex flex-col flex-shrink-0">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${stats.statusColor.replace('text-', 'bg-')}`}></div>
                  <h3 className="text-[11px] font-bold text-white uppercase tracking-tight">Physiology: <span className={stats.statusColor}>{stats.statusLabel}</span></h3>
                </div>
                <button 
                  onClick={() => setShowWeeklyBriefing(true)} 
                  className="text-[10px] font-black text-slate-950 uppercase tracking-[0.14em] flex items-center gap-2 bg-emerald-400 px-4 py-2 rounded-full hover:bg-emerald-300 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] active:scale-95 transition-all"
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
                  <div className={`h-full transition-all duration-1000 ${stats.form < 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${stats.recoveryProgress}%` }} />
                </div>
              </div>
            </div>

            {/* suggestion card - Optimized for 1-screen fit */}
            <div 
              onClick={() => suggestion && setReasoningPopup({ title: 'Coaching Rationale', content: suggestion.reasoning })} 
              className="glass-card rounded-[1.8rem] p-4 flex flex-col relative overflow-hidden flex-shrink-0 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center justify-between mb-2.5 relative z-10">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
                  <Sparkles size={10} className="text-emerald-400" />
                  <span className="text-[9px] font-black text-white uppercase tracking-[0.15em]">
                    {hasRideToday ? "TARGET: TOMORROW" : "TARGET: TODAY"}
                  </span>
                </div>
                {suggestion && (
                  <button onClick={(e) => { e.stopPropagation(); setShowAlternative(!showAlternative); }} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-colors">
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>

              {loadingSuggestion ? (
                <div className="flex flex-col items-center justify-center py-6 opacity-40">
                  <div className="w-5 h-5 border border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin"></div>
                </div>
              ) : currentWorkout ? (
                <div className="flex flex-col relative z-10">
                  <h3 className="text-xl text-header italic mb-3 leading-tight tracking-tight">{currentWorkout.title}</h3>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 rounded-xl border border-white/5 text-[10px] font-bold">
                        <Clock size={12} className="text-blue-400" /> {currentWorkout.duration_minutes}m
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/5 rounded-xl border border-amber-500/10 text-[10px] font-bold text-amber-400/80">
                        <Zap size={12} fill="currentColor" /> {currentWorkout.intensity}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setIsWorkoutExpanded(!isWorkoutExpanded); }} className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                      <ChevronDown size={16} className={`transition-transform duration-300 ${isWorkoutExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {isWorkoutExpanded && (
                    <div className="mt-4 space-y-3 animate-in slide-in-from-bottom-2">
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        {currentWorkout.description}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Main Stats Hub - Re-shaped for 1 screen */}
            <div className="grid grid-cols-2 gap-3 flex-shrink-0">
              <div 
                onClick={() => suggestion && setReasoningPopup({ title: 'Readiness Analysis', content: suggestion.readiness_analysis })}
                className="glass-card p-4 rounded-[1.8rem] flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div>
                  <h4 className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Readiness</h4>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-black italic tracking-tighter ${stats.statusColor}`}>{stats.readiness}</span>
                    <span className="text-[10px] font-bold text-slate-600">/ 10</span>
                  </div>
                </div>
              </div>
              
              <div 
                onClick={() => setReasoningPopup({ title: '7D Load', content: `Over the past week you've accumulated ${stats.total7DayLoad} total TSS. Steady volume is key to building base endurance, while carefully managing acute fatigue (ATL).` })}
                className="glass-card p-4 rounded-[1.8rem] flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div>
                  <h4 className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">7D Load</h4>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black italic tracking-tighter text-white">{stats.total7DayLoad}</span>
                    <span className="text-[10px] font-bold text-slate-600 uppercase">TSS</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Progress Glimpse - Bottom strip */}
            <div 
              onClick={() => setReasoningPopup({ title: 'Training Status', content: `waTTson determines your status using chronic training load (fitness) and acute training load (fatigue). Currently your form (TSB) is ${Math.round(stats.form)}, classifying you as ${stats.statusLabel}.` })}
              className="mt-auto glass-card py-3 px-5 rounded-full border-white/5 flex items-center justify-between flex-shrink-0 cursor-pointer active:scale-[0.98] transition-transform"
            >
               <div className="flex items-center gap-2">
                 <TrendingUp size={14} className="text-emerald-400" />
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Training Status</span>
               </div>
               <span className="text-[9px] font-bold text-white uppercase tracking-widest">{stats.statusLabel}</span>
            </div>
          </div>
        )}

        {activeTab === 'rides' && (
          <div className="space-y-4 animate-in slide-in-from-right-2 duration-400 pb-2">
             <div className="space-y-4 pt-1">
               {Object.entries(groupedActivities).map(([month, monthRides]) => (
                 <div key={month} className="space-y-1.5">
                   <div className="flex items-center gap-3 px-1 mb-1">
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
          <div className="flex-1 flex flex-col min-h-0 bg-transparent animate-in fade-in duration-500 overflow-hidden relative">
             <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-4 py-4 custom-scrollbar">
               {messages.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-center px-6 pb-12">
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-6 max-w-[220px]">Coach wa<span className="text-emerald-400">TT</span>son is ready. Ask for training context or recent load analysis.</p>
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
                          ? 'bg-emerald-500 text-slate-950 font-bold rounded-tr-sm' 
                          : 'glass-card text-slate-100 rounded-tl-sm'
                        }`}>
                          {msg.text}
                        </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                        <div className="glass-card px-4 py-3 rounded-[1.4rem] flex gap-1.5 items-center">
                          <div className="w-1.5 h-1.5 bg-emerald-400/50 rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-emerald-400/50 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-1.5 h-1.5 bg-emerald-400/50 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                    </div>
                  )}
                  <div ref={chatEndRef} className="h-4" />
                </div>
               )}
             </div>

             <div className="sticky bottom-0 shrink-0 px-4 pb-4 pt-3 bg-transparent backdrop-blur-2xl border-t border-white/5 z-20">
               <form 
                 onSubmit={(e) => { e.preventDefault(); handleSendMessage(chatInput); }} 
                 className="relative max-w-[400px] mx-auto"
               >
                 <textarea 
                   ref={chatInputRef}
                   value={chatInput}
                   onChange={(e) => {
                     setChatInput(e.target.value);
                     // Auto-expand
                     e.target.style.height = 'inherit';
                     e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                   }}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && !e.shiftKey) {
                       e.preventDefault();
                       handleSendMessage(chatInput);
                     }
                   }}
                   placeholder="Message waTTson..."
                   rows={1}
                   className="w-full bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-[1.5rem] pl-5 pr-12 py-3.5 text-sm text-white focus:outline-none focus:border-emerald-500/40 shadow-xl resize-none custom-scrollbar min-h-[48px] transition-colors"
                   style={{ height: 'auto' }}
                 />
                 <button 
                   type="submit" 
                   disabled={!chatInput.trim() || isChatLoading}
                   className="absolute right-2.5 bottom-2 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-slate-950 disabled:opacity-30 active:scale-90 transition-all shadow-lg"
                 >
                   <Send size={16} />
                 </button>
               </form>
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex flex-col space-y-5 animate-in slide-in-from-right-2 duration-400">
             <div className="flex justify-between items-center pt-2 px-1">
               <h2 className="text-xl text-header italic uppercase tracking-tight">
                 {settingsView === 'main' ? 'Pro DNA' : 
                  settingsView === 'goal' ? 'Set Ambition' :
                  settingsView === 'data' ? 'Data Vault' : 'Athlete Profile'}
               </h2>
               {settingsView !== 'main' && (
                 <button 
                   onClick={() => setSettingsView('main')}
                   className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
                 >
                   <ChevronLeft size={14} /> Back
                 </button>
               )}
             </div>

             <div className="flex flex-col space-y-5 pb-4 px-1">
               {settingsView === 'main' && (
                 <>
                   <div className="glass-card p-6 rounded-[2rem] space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 border border-white/5 shadow-inner"><User size={24} /></div>
                        <div>
                          <p className="text-sm font-bold text-white tracking-tight">Athlete ID: {creds?.athleteId}</p>
                          <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-0.5">Systems Operational</p>
                        </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 gap-3">
                     <button 
                       onClick={() => setSettingsView('goal')}
                       className="glass-card p-5 rounded-[1.8rem] flex items-center justify-between group active:scale-[0.98] transition-all"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"><Target size={20} /></div>
                         <div className="text-left">
                           <p className="text-[11px] font-black text-white uppercase tracking-widest">Training Goal</p>
                           <p className="text-[10px] text-slate-500 font-bold italic truncate max-w-[180px]">"{userGoal}"</p>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
                     </button>

                     <button 
                       onClick={() => setSettingsView('data')}
                       className="glass-card p-5 rounded-[1.8rem] flex items-center justify-between group active:scale-[0.98] transition-all"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400"><Database size={20} /></div>
                         <div className="text-left">
                           <p className="text-[11px] font-black text-white uppercase tracking-widest">Data & Privacy</p>
                           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Connected Assets</p>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-600 group-hover:text-purple-400 transition-colors" />
                     </button>

                     <button 
                       onClick={() => setSettingsView('methodology')}
                       className="glass-card p-5 rounded-[1.8rem] flex items-center justify-between group active:scale-[0.98] transition-all"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400"><User size={20} /></div>
                         <div className="text-left">
                           <p className="text-[11px] font-black text-white uppercase tracking-widest">Athlete Profile</p>
                           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">AI Assessment</p>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-600 group-hover:text-amber-400 transition-colors" />
                     </button>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-3">
                     <button onClick={() => { setSuggestion(null); loadData(creds!); }} className="p-5 bg-white/5 rounded-[1.8rem] border border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500 flex flex-col items-center gap-3 active:scale-95 transition-all">
                        <RotateCcw size={18} /> Sync Engine
                     </button>
                     <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="p-5 bg-rose-500/5 rounded-[1.8rem] border border-rose-500/10 text-[9px] font-black uppercase tracking-widest text-rose-500 flex flex-col items-center gap-3 active:scale-95 transition-all">
                        <LogOut size={18} /> Logout
                     </button>
                   </div>
                 </>
               )}

               {settingsView === 'goal' && (
                 <div className="glass-card p-6 rounded-[2rem] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                        waTTson adapts his coaching intensity, interval style, and recovery focus based on your current ambition.
                      </p>
                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] ml-1">Current Ambition</label>
                        <div onClick={() => { setShowGoalEditor(true); setSettingsView('main'); }} className="bg-slate-950/50 p-5 rounded-2xl border border-white/5 cursor-pointer hover:border-emerald-500/30 transition-all group">
                          <p className="text-[13px] text-white italic group-hover:text-emerald-400 transition-colors">"{userGoal}"</p>
                          <p className="text-[8px] text-slate-600 uppercase tracking-widest mt-3 font-bold">Tap to edit</p>
                        </div>
                      </div>
                    </div>
                 </div>
               )}

               {settingsView === 'data' && (
                 <div className="glass-card p-6 rounded-[2rem] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <div className="flex items-start gap-4 p-4 bg-slate-950/40 rounded-2xl border border-white/5">
                        <div className="w-8 h-8 mt-1 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0"><ActivityIcon size={16} /></div>
                        <div>
                          <p className="text-[12px] font-bold text-white mb-1">Ride History</p>
                          <p className="text-[10px] text-slate-400 mb-2">waTTson synchronizes your last 90 days of interval activity to understand your power curve and endurance.</p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">TSS</span>
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">Intensity Factor</span>
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">Duration</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 bg-slate-950/40 rounded-2xl border border-white/5">
                        <div className="w-8 h-8 mt-1 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0"><Zap size={16} /></div>
                        <div>
                          <p className="text-[12px] font-bold text-white mb-1">Athlete Metrics</p>
                          <p className="text-[10px] text-slate-400 mb-2">Constantly updating to ensure your targets are based on your most recent actual test data, not static values.</p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">FTP</span>
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">Weight</span>
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">Zones</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 bg-slate-950/40 rounded-2xl border border-white/5">
                        <div className="w-8 h-8 mt-1 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 shrink-0"><TrendingUp size={16} /></div>
                        <div>
                          <p className="text-[12px] font-bold text-white mb-1">Wellness & Recovery</p>
                          <p className="text-[10px] text-slate-400 mb-2">The preceding 28 days of biometric health stats tell the engine if it's safe to push you to the limit.</p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">HRV</span>
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">Sleep</span>
                            <span className="px-2 py-1 bg-white/5 border border-white/5 shadow-inner rounded-md text-[9px] font-bold text-slate-300">Form (TSB)</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 px-1">
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          All data is strictly pulled in read-only form from Intervals.icu via your API key. Data stays on your device and is not persisted.
                        </p>
                      </div>
                    </div>
                 </div>
               )}

               {settingsView === 'methodology' && (
                 <div className="glass-card p-6 rounded-[2rem] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {isLoadingProfile ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <div className="w-8 h-8 rounded-full border-t-2 border-emerald-500 animate-spin mb-4" />
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Analyzing Data...</p>
                      </div>
                    ) : userProfile ? (
                      <div className="space-y-6">
                        <div className="text-center mb-6">
                          <h3 className="text-xl font-black text-emerald-400 italic uppercase tracking-tight">{userProfile.athlete_type}</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Based on recent 30-day performance trends</p>
                        </div>
                        
                        <div className="relative">
                          <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-emerald-500/30"></div>
                          <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 pl-3">Areas of Strength</h4>
                          <ul className="text-[11px] text-slate-400 leading-relaxed font-medium pl-3 list-none space-y-1">
                            {userProfile.strengths.map((s, i) => (
                              <li key={i}>• {s}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="relative">
                          <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-rose-500/30"></div>
                          <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 pl-3">Limiters to Improve</h4>
                          <ul className="text-[11px] text-slate-400 leading-relaxed font-medium pl-3 list-none space-y-1">
                            {userProfile.areas_for_improvement.map((a, i) => (
                              <li key={i}>• {a}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="relative">
                          <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-amber-500/30"></div>
                          <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 pl-3">Training Response</h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed font-medium pl-3">
                            {userProfile.training_response}
                          </p>
                        </div>
                        
                        <div className="relative">
                          <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-purple-500/30"></div>
                          <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 pl-3">waTTson's Focus</h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed font-medium pl-3">
                            {userProfile.recommended_focus}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                         <p className="text-[11px] text-slate-400">Not enough data to form an assessment yet.</p>
                      </div>
                    )}
                 </div>
               )}
             </div>
          </div>
        )}
      </div>

      {/* Static Standard Bottom Navigation Bar */}
      <nav className="shrink-0 bg-[#05070a] border-t border-white/5 z-[100] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
            { id: 'rides', icon: Bike, label: 'Logs' },
            { id: 'chat', icon: MessageSquare, label: 'Chat' },
            { id: 'settings', icon: Settings, label: 'Pro' }
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center gap-1 transition-colors duration-300 py-2 px-4 rounded-xl ${activeTab === item.id ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <item.icon size={22} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              <span className="text-[9px] font-bold uppercase tracking-[0.05em]">{item.label}</span>
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
            className="w-full bg-slate-900/50 border border-white/10 rounded-[2rem] p-6 text-lg font-bold text-white outline-none focus:border-emerald-500/30 flex-1 mb-8 italic"
            placeholder="Ex: Improve hill climb efficiency..."
          />
          <button 
            onClick={() => { localStorage.setItem('wattson_goal', userGoal); setSuggestion(null); setShowGoalEditor(false); }}
            className="w-full py-5 bg-emerald-500 text-slate-950 font-bold text-[10px] uppercase tracking-[0.2em] rounded-[1.8rem] shadow-2xl active:scale-95 transition-all"
          >
            Update Engine Target
          </button>
        </div>
      )}

      {reasoningPopup && (
        <div className="absolute inset-0 z-[220] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setReasoningPopup(null)}>
          <div className="glass-card w-full max-w-[340px] rounded-[2rem] p-7 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Sparkles size={14} /> {reasoningPopup.title}
            </h3>
            <p className="text-slate-300 text-[12px] leading-relaxed mb-6">"{reasoningPopup.content}"</p>
            <button onClick={() => setReasoningPopup(null)} className="w-full py-4 bg-white/5 border border-white/10 rounded-[1.4rem] text-[10px] font-black uppercase tracking-[0.15em] hover:bg-white/10 hover:text-white text-slate-300 transition-colors active:scale-[0.98]">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showReleaseNotes && (
        <div className="absolute inset-0 z-[220] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowReleaseNotes(false)}>
          <div className="glass-card w-full max-w-[340px] rounded-[2rem] p-7 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white italic tracking-tight mb-2">wa<span className="text-emerald-400">TT</span>son Update</h3>
            <p className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-widest mb-5">Version {APP_VERSION}</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">Athlete Profile Engine</h4>
                <p className="text-slate-400 text-[11px] leading-relaxed">waTTson now analyzes your last 30 days of training to build a custom athlete shape based on your history. Access this in Settings &gt; Athlete Profile.</p>
              </div>
              <div>
                <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">Interactive Rationale</h4>
                <p className="text-slate-400 text-[11px] leading-relaxed">You can now tap on waTTson's recommendations on the home tab to dive deep into exactly why he suggested them based on your fatigue.</p>
              </div>
            </div>

            <button onClick={() => setShowReleaseNotes(false)} className="w-full py-4 bg-emerald-500 text-slate-950 rounded-[1.4rem] text-[10px] font-black uppercase tracking-[0.15em] hover:bg-emerald-400 transition-colors active:scale-[0.98]">
              Got it
            </button>
          </div>
        </div>
      )}

      {selectedActivity && creds && <CoachingModal activity={selectedActivity} creds={creds} onClose={() => setSelectedActivity(null)} userGoal={userGoal} />}
      {showWeeklyBriefing && creds && (
        <WeeklyBriefingModal 
          activities={activities || []} 
          wellness={wellnessData} 
          creds={creds} 
          userGoal={userGoal} 
          onClose={() => setShowWeeklyBriefing(false)} 
          todaySuggestion={suggestion}
          ftp={ftp || undefined}
        />
      )}
    </div>
  );
};

export default App;
