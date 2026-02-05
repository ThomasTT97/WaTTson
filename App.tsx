
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, 
  IntervalsCredentials, 
  DailySuggestion,
  ChatMessage,
  Wellness
} from './types';
import { fetchActivities, fetchWellness, getMockActivities, getMockWellness } from './services/intervalsService';
import { getDailySuggestion, sendChatMessage } from './services/geminiService';
import { ActivityCard } from './components/ActivityCard';
import { CoachingModal } from './components/CoachingModal';
import { 
  BarChart, Bar, ResponsiveContainer, Cell, Tooltip 
} from 'recharts';
import { 
  Settings, 
  LayoutDashboard, 
  Bike,
  Sparkles,
  RefreshCw,
  LogOut,
  History,
  AlertCircle,
  Loader2,
  AlertTriangle,
  Link2Off,
  User,
  Clock,
  TrendingUp,
  Activity as ActivityIcon,
  Check,
  Copy,
  ChevronRight,
  Key,
  HeartPulse,
  Battery,
  Target,
  ArrowLeft,
  Save,
  MessageSquare,
  Send,
  Zap,
  Flame,
  Info,
  Bot
} from 'lucide-react';

const App: React.FC = () => {
  // Safe initialization of credentials
  const [creds, setCreds] = useState<IntervalsCredentials | null>(() => {
    // 1. Check for Cloudflare/Environment injected key
    const envKey = (process.env.INTERVALS_API_KEY as string) || '';
    if (envKey && envKey.length > 5) {
      return { apiKey: envKey, athleteId: '0' };
    }

    // 2. Fallback to Local Storage
    try {
      const saved = localStorage.getItem('wattson_creds');
      // Ensure we have a valid object with an apiKey
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && typeof parsed === 'object' && parsed.apiKey) {
        return parsed;
      }
      return null;
    } catch (e) {
      console.warn("Corrupt credentials in storage, clearing.");
      localStorage.removeItem('wattson_creds');
      return null;
    }
  });

  const [activities, setActivities] = useState<Activity[]>([]);
  const [wellnessData, setWellnessData] = useState<Wellness[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [suggestion, setSuggestion] = useState<DailySuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rides' | 'settings' | 'chat'>('dashboard');
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Dashboard Question Input
  const [dashboardQuestion, setDashboardQuestion] = useState('');

  // Interactive Chart State
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  
  // Goal State
  const [userGoal, setUserGoal] = useState<string>(() => {
    return localStorage.getItem('wattson_goal') || '';
  });
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoal, setTempGoal] = useState('');
  
  const [formKey, setFormKey] = useState('');

  const appOrigin = window.location.origin;
  const isStravaError = error?.includes("STRAVA_DATA_ERROR");

  const loadData = async (credentials: IntervalsCredentials, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsSyncing(true);
    
    setError(null);
    try {
      // Fetch both activities and wellness data
      const [fetchedActivities, fetchedWellness] = await Promise.all([
        fetchActivities(credentials),
        fetchWellness(credentials)
      ]);
      
      setActivities(fetchedActivities);
      setWellnessData(fetchedWellness);
      
      setCreds(credentials);
      setLastSync(new Date());
      // Only save to localStorage if it's NOT the env key, to avoid clutter or confusion
      if (credentials.apiKey !== process.env.INTERVALS_API_KEY) {
        localStorage.setItem('wattson_creds', JSON.stringify(credentials));
      }
    } catch (err: any) {
      console.error("Sync Error:", err);
      const errorMessage = err.message || "Failed to sync training data.";
      setError(errorMessage);
      
      // CRITICAL: If auth fails, clear credentials so user can try again
      if (errorMessage.includes("Invalid API Key") || errorMessage.includes("Access Denied")) {
        setCreds(null);
        localStorage.removeItem('wattson_creds');
      }
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (creds) {
      if (creds.apiKey === 'demo') {
        setActivities(getMockActivities());
        setWellnessData(getMockWellness());
        setLastSync(new Date());
      } else {
        loadData(creds, true);
      }
    }
  }, []);

  // AUTO-FETCH SUGGESTION: Trigger when activities are loaded and no suggestion exists
  useEffect(() => {
    if (activities.length > 0 && !suggestion && !loadingSuggestion) {
      const triggerSuggestion = async () => {
        setLoadingSuggestion(true);
        try {
          const data = await getDailySuggestion(activities, userGoal);
          setSuggestion(data);
        } catch (err) {
          console.error("Auto-fetch suggestion failed", err);
        } finally {
          setLoadingSuggestion(false);
        }
      };
      triggerSuggestion();
    }
  }, [activities, suggestion, userGoal, loadingSuggestion]);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const useDemoMode = () => {
    const demoCreds = { apiKey: 'demo', athleteId: 'demo' };
    setCreds(demoCreds);
    localStorage.setItem('wattson_creds', JSON.stringify(demoCreds));
    
    setActivities(getMockActivities());
    setWellnessData(getMockWellness());
    setLastSync(new Date());
  };

  // Goal Management
  const handleSaveGoal = () => {
    setUserGoal(tempGoal);
    localStorage.setItem('wattson_goal', tempGoal);
    setIsEditingGoal(false);
  };

  const openGoalEditor = () => {
    setTempGoal(userGoal);
    setIsEditingGoal(true);
  };

  const suggestedGoals = [
    "Increase my FTP by 10%",
    "Complete a 100km ride",
    "Train for a Gran Fondo",
    "Lose 5kg and build endurance",
    "Improve climbing power",
    "Prepare for race season"
  ];

  // Chart Data: Last 7 Calendar Days (Load Trend)
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const loadByDate = new Map<string, number>();
    activities.forEach(a => {
      const dateStr = a.start_date_local.split('T')[0];
      const load = a.icu_training_load ?? a.icu_tss ?? 0;
      loadByDate.set(dateStr, (loadByDate.get(dateStr) || 0) + load);
    });

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      const weekday = d.toLocaleDateString('en-US', { weekday: 'narrow' });
      
      data.push({
        name: weekday,
        fullDate: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        tss: Math.round(loadByDate.get(dateKey) || 0)
      });
    }
    return data;
  }, [activities]);

  const stats = useMemo(() => {
    // Basic Sums from Activities
    const totalTss = activities.reduce((acc, curr) => acc + (curr.icu_training_load ?? curr.icu_tss ?? 0), 0);
    const sevenDayLoad = chartData.reduce((acc, day) => acc + day.tss, 0);
    const avgTss = activities.length ? Math.round(totalTss / activities.length) : 0;

    // --- FITNESS / FATIGUE / FORM ---
    // Prefer data from the Wellness API which is pre-calculated by Intervals.icu
    let fitness = 0;
    let fatigue = 0;
    let form = 0;

    if (wellnessData.length > 0) {
      // Wellness data is sorted by date desc
      const sortedWellness = [...wellnessData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Look for latest available value for each metric independently
      const latestFitness = sortedWellness.find(w => w.ctl !== null && w.ctl !== undefined);
      if (latestFitness) fitness = Math.round(latestFitness.ctl);
      
      const latestFatigue = sortedWellness.find(w => w.atl !== null && w.atl !== undefined);
      if (latestFatigue) fatigue = Math.round(latestFatigue.atl);
      
      // Form (TSB) is Fitness (CTL) - Fatigue (ATL)
      form = fitness - fatigue;

    } else if (activities.length > 0) {
      // Fallback: Estimate if API wellness is missing
       const sortedActs = [...activities].sort((a, b) => 
        new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime()
      );
      
      const startDate = new Date(sortedActs[0].start_date_local);
      startDate.setHours(0,0,0,0);
      const endDate = new Date();
      endDate.setHours(0,0,0,0);
      
      const loadMap = new Map<string, number>();
      sortedActs.forEach(a => {
        const d = a.start_date_local.split('T')[0];
        const l = a.icu_training_load ?? a.icu_tss ?? 0;
        loadMap.set(d, (loadMap.get(d) || 0) + l);
      });

      let ctl = 0;
      let atl = 0;
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);

      for (let i = 0; i <= daysDiff; i++) {
        const currentD = new Date(startDate.getTime() + i * msPerDay);
        const dateStr = currentD.toISOString().split('T')[0];
        const dayLoad = loadMap.get(dateStr) || 0;
        if (i === 0) { ctl = dayLoad; atl = dayLoad; } 
        else {
          ctl = ctl + (dayLoad - ctl) / 42;
          atl = atl + (dayLoad - atl) / 7;
        }
      }
      fitness = Math.round(ctl);
      fatigue = Math.round(atl);
      form = Math.round(ctl - atl);
    }

    // Determine Zone
    let formZone = 'Neutral';
    if (form > 5) formZone = 'Fresh';
    else if (form >= -10 && form <= 5) formZone = 'Optimal'; 
    else if (form >= -30 && form < -10) formZone = 'High Load';
    else if (form < -30) formZone = 'Overload';

    return {
      totalTss: Math.round(totalTss),
      sevenDayLoad: Math.round(sevenDayLoad),
      avgTss,
      fitness,
      fatigue,
      form,
      formZone
    };
  }, [activities, chartData, wellnessData]);

  const getReadinessColor = (score: number) => {
    if (score >= 8) return 'text-emerald-400';
    if (score >= 5) return 'text-amber-400';
    return 'text-red-400';
  };

  const getFormColor = (form: number) => {
    if (form > 5) return 'text-emerald-400';
    if (form >= -10) return 'text-emerald-400'; // Optimal
    if (form >= -30) return 'text-amber-400'; // High Load
    return 'text-red-400'; // Overload
  };

  const getFormBg = (form: number) => {
    if (form > 5) return 'bg-emerald-500';
    if (form >= -10) return 'bg-emerald-500';
    if (form >= -30) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Chat Handlers
  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    const userMsg: ChatMessage = { role: 'user', text: text };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const responseText = await sendChatMessage(messages, text, {
        goal: userGoal,
        recentLoad: stats.sevenDayLoad,
        readiness: suggestion?.readiness_score
      });
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I'm having trouble connecting to the coaching server right now." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleDashboardQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dashboardQuestion.trim()) {
      setActiveTab('chat');
      handleSendMessage(dashboardQuestion);
      setDashboardQuestion('');
    }
  };

  // --- RENDER LOGIC ---

  if (loading) {
    return (
      <div className="phone-container flex flex-col items-center justify-center p-8">
        <div className="gradient-bg"></div>
        <div className="relative">
          <div className="w-24 h-24 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
          <Bike className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-500 animate-pulse" size={32} />
        </div>
        <h2 className="mt-8 text-xl font-bold text-white tracking-tight">WaTTson</h2>
        <p className="mt-2 text-slate-400 text-center text-sm font-medium">Syncing Intervals.icu...</p>
      </div>
    );
  }

  // LOGIN SCREEN - Display if no credentials exist
  if (!creds) {
    return (
      <div className="phone-container flex flex-col p-6 min-h-screen overflow-y-auto py-12">
        <div className="gradient-bg"></div>
        <div className="glass-panel p-8 rounded-3xl shadow-2xl mb-6 border border-white/10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 rounded-3xl mb-6 shadow-inner ring-1 ring-white/10">
              <Bike className="text-cyan-400 drop-shadow-lg" size={40} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">WaTTson</h1>
            <p className="text-slate-400 text-sm font-medium">Your intelligent training companion</p>
          </div>

          <div className="space-y-6">
            {error && (
              <div className={`p-4 rounded-xl flex gap-3 items-start animate-in fade-in slide-in-from-top-2 border ${isStravaError ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                {isStravaError ? <Link2Off className="text-amber-400 shrink-0 mt-0.5" size={18} /> : <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />}
                <div className="flex-1">
                  <p className={`text-xs font-bold mb-1 ${isStravaError ? 'text-amber-300' : 'text-red-300'}`}>
                    {isStravaError ? 'Strava Data Limit' : 'Connection Failed'}
                  </p>
                  <p className={`text-[11px] leading-tight ${isStravaError ? 'text-amber-200/80' : 'text-red-200/80'}`}>
                    {isStravaError ? "Check 'Download activities' in settings." : error}
                  </p>
                </div>
              </div>
            )}
            
            <div className="relative group">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 ml-1 group-focus-within:text-cyan-500 transition-colors">API Key</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" size={18} />
                <input 
                  type="password" 
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="Intervals.icu API Key"
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl pl-12 pr-4 py-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/30 transition-all text-sm shadow-inner"
                />
              </div>
            </div>

            <button 
              onClick={() => loadData({ apiKey: formKey, athleteId: '0' }, true)}
              disabled={loading || !formKey}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-cyan-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : "Connect Account"}
            </button>
            
            <button 
              onClick={useDemoMode}
              className="w-full py-2 text-slate-500 text-xs font-bold uppercase tracking-widest hover:text-slate-300 transition-colors"
            >
              Try Demo Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // APP DASHBOARD
  return (
    <div className="phone-container flex flex-col pb-28">
      <div className="gradient-bg"></div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 pt-8">
        
        {activeTab === 'dashboard' && (
          <div className="flex flex-col h-full space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header - Compact */}
            <header className="flex items-center justify-between px-1">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${lastSync ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-500'}`}></span>
                  <span className="text-slate-400 text-[10px] font-medium tracking-wide">
                    {lastSync ? `Updated ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Syncing...'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => loadData(creds)}
                disabled={isSyncing}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 transition-all active:scale-95 border border-white/5 backdrop-blur-sm shadow-lg"
              >
                <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
              </button>
            </header>

            {/* UNIFIED STATUS WIDGET */}
            <div className="glass-panel p-1 rounded-2xl border-white/10">
              <div className="grid grid-cols-3 divide-x divide-white/5 bg-slate-900/40 rounded-xl">
                 {/* Fitness */}
                 <div className="flex flex-col items-center justify-center py-3">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Zap size={10} className="text-cyan-400" fill="currentColor" /> Fitness
                    </span>
                    <span className="text-2xl font-bold text-white leading-none tracking-tight">{stats.fitness}</span>
                    <span className="text-[8px] text-slate-600 font-medium mt-1">Conditie (CTL)</span>
                 </div>
                 
                 {/* Fatigue */}
                 <div className="flex flex-col items-center justify-center py-3">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Flame size={10} className="text-pink-500" fill="currentColor" /> Fatigue
                    </span>
                    <span className="text-2xl font-bold text-white leading-none tracking-tight">{stats.fatigue}</span>
                    <span className="text-[8px] text-slate-600 font-medium mt-1">Verm. (ATL)</span>
                 </div>

                 {/* Form */}
                 <div className="flex flex-col items-center justify-center py-3 relative overflow-hidden group">
                    {/* Background glow for Form based on value */}
                    <div className={`absolute inset-0 opacity-10 ${getFormBg(stats.form)} blur-xl transition-colors duration-500`}></div>
                    
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <ActivityIcon size={10} className={getFormColor(stats.form)} /> Form
                    </span>
                    <span className={`text-2xl font-bold leading-none tracking-tight ${getFormColor(stats.form)}`}>
                      {stats.form > 0 ? `+${stats.form}` : stats.form}
                    </span>
                    <span className={`text-[8px] font-bold mt-1 px-1.5 py-0.5 rounded-full bg-white/5 uppercase tracking-wide ${getFormColor(stats.form)}`}>
                      Vorm (TSB)
                    </span>
                 </div>
              </div>
            </div>

            {/* Daily Insight Card - Denser */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-3xl blur opacity-15 group-hover:opacity-25 transition duration-1000"></div>
              <div className="relative glass-panel rounded-2xl overflow-hidden border-white/10">
                
                <div className="px-4 pt-3 pb-1 flex justify-between items-start">
                  <h3 className="text-white font-bold flex items-center gap-2 text-[11px] uppercase tracking-wider">
                    <Sparkles size={12} className="text-cyan-400" />
                    Coach WaTTson
                  </h3>
                  <button 
                    onClick={async () => {
                      if (activities.length === 0) return;
                      setLoadingSuggestion(true);
                      try {
                        const data = await getDailySuggestion(activities, userGoal);
                        setSuggestion(data);
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setLoadingSuggestion(false);
                      }
                    }}
                    disabled={loadingSuggestion || activities.length === 0}
                    className="p-1.5 bg-white/5 hover:bg-white/10 text-cyan-400 rounded-lg transition-all disabled:opacity-50"
                  >
                    {loadingSuggestion ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
                  </button>
                </div>

                {suggestion ? (
                  <div className="animate-in fade-in duration-300">
                    <div className="px-4 pb-2 border-b border-white/5">
                       <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white/5 border border-white/5 shadow-inner ${getReadinessColor(suggestion.readiness_score)}`}>
                             <HeartPulse size={16} />
                          </div>
                          <div>
                             <div className="flex items-baseline gap-2">
                                <span className={`text-2xl font-bold leading-none ${getReadinessColor(suggestion.readiness_score)}`}>{suggestion.readiness_score}</span>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">/ 10 readiness</span>
                             </div>
                             <p className="text-slate-400 text-[10px] leading-tight truncate max-w-[280px]">{suggestion.readiness_analysis}</p>
                          </div>
                       </div>
                    </div>

                    <div className="px-4 py-3 bg-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider ${
                          suggestion.intensity === 'High' ? 'bg-red-500/20 text-red-400' :
                          suggestion.intensity === 'Rest' ? 'bg-slate-500/20 text-slate-300' :
                          'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {suggestion.intensity}
                        </span>
                        <span className="text-slate-400 text-[9px] font-bold uppercase flex items-center gap-1">
                          <Clock size={10} /> {suggestion.duration_minutes}m
                        </span>
                      </div>
                      <h4 className="text-white font-bold text-xs mb-1 truncate">{suggestion.title}</h4>
                      <p className="text-slate-400 text-[10px] leading-relaxed line-clamp-2">{suggestion.description}</p>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pb-4 mt-2">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-dashed border-white/10">
                       <Loader2 className="text-cyan-500 animate-spin" size={16} />
                       <p className="text-slate-400 text-[10px] font-medium italic">Calculating your briefing...</p>
                    </div>
                  </div>
                )}
                
                <form onSubmit={handleDashboardQuestionSubmit} className="p-1.5 border-t border-white/5">
                   <div className="relative group/input">
                     <input 
                       type="text" 
                       value={dashboardQuestion}
                       onChange={(e) => setDashboardQuestion(e.target.value)}
                       placeholder="Ask WaTTson anything..." 
                       className="w-full bg-slate-900/40 border border-white/10 rounded-xl pl-3 pr-8 py-2.5 text-[10px] text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/30 transition-all group-hover/input:bg-slate-900/60"
                     />
                     <button type="submit" disabled={!dashboardQuestion.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-500 disabled:opacity-0 transition-opacity">
                       <Send size={12} />
                     </button>
                   </div>
                </form>
              </div>
            </div>

            {/* Load Section - Denser */}
            <div className="glass-panel p-4 rounded-2xl border-white/5 flex flex-col gap-3">
               <div className="flex justify-between items-end">
                  <div>
                    <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                       <TrendingUp size={11} className="text-cyan-400"/> Load Trend
                    </h3>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                       <span className="text-2xl font-bold text-white tracking-tighter">{stats.sevenDayLoad}</span>
                       <span className="text-[8px] font-bold text-slate-500 uppercase">7d Sum</span>
                    </div>
                  </div>
                  <div className="flex gap-4 text-right">
                     <div>
                        <div className="text-[8px] text-slate-500 uppercase font-bold tracking-tight">30d Sum</div>
                        <div className="text-base font-bold text-white">{stats.totalTss}</div>
                     </div>
                     <div>
                        <div className="text-[8px] text-slate-500 uppercase font-bold tracking-tight">Avg TSS</div>
                        <div className="text-base font-bold text-white">{stats.avgTss}</div>
                     </div>
                  </div>
               </div>

               <div className="h-32 w-full mt-1">
                {activities.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={chartData} 
                      barSize={24}
                      onMouseLeave={() => setActiveIndex(null)}
                    >
                       <Tooltip 
                        cursor={{fill: 'transparent'}}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-slate-900/95 border border-white/20 p-2 rounded-xl text-[10px] backdrop-blur-xl z-50 shadow-2xl ring-1 ring-white/10">
                                <p className="text-white font-bold">{payload[0].value} <span className="text-slate-500 font-normal">TSS</span></p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="tss" radius={[4, 4, 4, 4]} isAnimationActive={true}>
                        {chartData.map((entry, index) => {
                           const isActive = activeIndex === index || (activeIndex === null && index === chartData.length - 1);
                           return (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={isActive ? '#22d3ee' : '#334155'} 
                                fillOpacity={isActive ? 1 : 0.4}
                                onMouseEnter={() => setActiveIndex(index)}
                                style={{ transition: 'all 0.3s ease' }}
                              />
                           );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-white/5 rounded-xl">
                     <p className="text-[9px] text-slate-600 font-bold uppercase">No data loaded</p>
                  </div>
                )}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'rides' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
             <header className="mb-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Rides</h1>
                <p className="text-slate-400 text-xs mt-0.5">Your training history</p>
            </header>
            <div className="space-y-2.5 pb-8">
                {activities.length > 0 ? (
                activities.slice(0, 30).map(a => (
                    <ActivityCard key={a.id} activity={a} onClick={setSelectedActivity} />
                ))
                ) : (
                <div className="text-center py-20 flex flex-col items-center gap-4">
                    <ActivityIcon size={24} className="text-slate-700" />
                    <p className="text-slate-500 text-sm">No rides found.</p>
                </div>
                )}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
           <div className="flex flex-col h-[calc(100vh-140px)] animate-in fade-in slide-in-from-right-4 duration-300">
             <header className="mb-4 shrink-0">
                <h1 className="text-2xl font-bold text-white tracking-tight">Coach WaTTson</h1>
                <p className="text-slate-400 text-sm mt-1">AI Powered Training Guidance</p>
            </header>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5 mb-4 pr-1 pb-4">
               {messages.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
                    <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 flex items-center justify-center mb-6 ring-1 ring-cyan-500/20">
                      <Bot size={32} className="text-cyan-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-300">Your coach is online.</p>
                    <p className="text-[11px] text-slate-500 mt-2 max-w-[200px] leading-relaxed">
                      Ask about your training load, recovery status, or progress towards your {userGoal ? 'goal' : 'goals'}.
                    </p>
                 </div>
               ) : (
                 messages.map((msg, idx) => (
                   <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                     {/* Avatar */}
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                       msg.role === 'user' 
                        ? 'bg-slate-700 text-slate-300' 
                        : 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30'
                     }`}>
                       {msg.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
                     </div>

                     {/* Message Bubble */}
                     <div className={`max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap shadow-lg ${
                       msg.role === 'user' 
                         ? 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-tr-sm' 
                         : 'glass-panel text-slate-200 rounded-tl-sm border-white/5'
                     }`}>
                       {msg.text}
                     </div>
                   </div>
                 ))
               )}
               {isChatLoading && (
                  <div className="flex justify-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0 ring-1 ring-cyan-500/30">
                       <Bot size={14} className="text-cyan-400" />
                    </div>
                    <div className="glass-panel px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1 items-center h-10 border-white/5">
                      <div className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                      <div className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                      <div className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                    </div>
                  </div>
               )}
               <div ref={chatEndRef} />
            </div>

            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(chatInput); }}
              className="mt-auto relative shrink-0 pb-1"
            >
              <div className="relative group">
                {/* Floating Input Capsule */}
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message Coach WaTTson..."
                  disabled={isChatLoading}
                  className="w-full bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-3xl pl-5 pr-14 py-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/30 shadow-2xl transition-all"
                />
                
                {/* Send Button */}
                <button 
                  type="submit" 
                  disabled={!chatInput.trim() || isChatLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 disabled:opacity-0 disabled:scale-75 transition-all active:scale-95"
                >
                  <Send size={18} className="ml-0.5" />
                </button>
              </div>
            </form>
           </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
             {!isEditingGoal ? (
               <>
                 <header className="mb-2">
                    <h1 className="text-xl font-bold text-white tracking-tight">Settings</h1>
                    <p className="text-slate-400 text-xs mt-0.5">Manage your connection</p>
                </header>
                
                <div className="glass-panel rounded-2xl overflow-hidden border-white/5">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                            <User size={16} />
                        </div>
                        <p className="text-xs font-bold text-white">Account Status</p>
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 ${activities.length > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {activities.length > 0 ? 'Connected' : 'Offline'}
                    </span>
                  </div>
                  
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                            <History size={16} />
                        </div>
                        <p className="text-xs font-bold text-white">Last Sync</p>
                    </div>
                    <p className="text-[10px] text-slate-400">{lastSync ? lastSync.toLocaleTimeString() : 'Never'}</p>
                  </div>

                  <button 
                    onClick={openGoalEditor}
                    className="w-full p-4 text-left text-xs font-bold text-white hover:bg-white/5 transition-colors flex items-center justify-between border-b border-white/5"
                  >
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                            <Target size={16} />
                        </div>
                        <p>Training Goal</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-600" />
                  </button>

                  <button 
                    onClick={() => {
                      localStorage.removeItem('wattson_creds');
                      localStorage.removeItem('wattson_goal');
                      setCreds(null);
                      setActivities([]);
                      setWellnessData([]);
                      setSuggestion(null);
                      setUserGoal('');
                      setError(null);
                      setFormKey('');
                      setActiveTab('dashboard');
                    }}
                    className="w-full p-4 text-left text-xs font-bold text-red-400 hover:bg-red-500/5 transition-colors flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                        <LogOut size={14} />
                    </div>
                    Disconnect Account
                  </button>
                </div>
              </>
             ) : (
               <div className="animate-in slide-in-from-right duration-300">
                 <header className="mb-4 flex items-center gap-4">
                    <button onClick={() => setIsEditingGoal(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                      <ArrowLeft size={16} className="text-white" />
                    </button>
                    <div>
                      <h1 className="text-xl font-bold text-white tracking-tight">Set Goal</h1>
                    </div>
                 </header>

                 <div className="glass-panel p-5 rounded-2xl border-white/10 space-y-4">
                   <div>
                     <textarea 
                        value={tempGoal}
                        onChange={(e) => setTempGoal(e.target.value)}
                        placeholder="e.g., Increase my FTP to 300W"
                        className="w-full h-24 bg-slate-900/60 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-slate-700 focus:outline-none resize-none"
                     />
                   </div>
                   <div className="flex flex-wrap gap-1.5">
                     {suggestedGoals.map((goal) => (
                       <button
                         key={goal}
                         onClick={() => setTempGoal(goal)}
                         className="px-2 py-1 rounded-full bg-white/5 border border-white/5 text-[9px] font-medium text-slate-400 hover:bg-purple-500/10 transition-colors"
                       >
                         {goal}
                       </button>
                     ))}
                   </div>
                   <button 
                     onClick={handleSaveGoal}
                     className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
                   >
                     <Save size={16} />
                     Save Goal
                   </button>
                 </div>
               </div>
             )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-6 left-6 right-6 max-w-[402px] mx-auto h-16 bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 flex items-center justify-around z-50 shadow-2xl px-2">
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className={`relative flex-1 h-full flex flex-col items-center justify-center gap-1 transition-all duration-300 ${activeTab === 'dashboard' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-400'}`}
        >
          {activeTab === 'dashboard' && <div className="absolute inset-0 bg-cyan-500/10 blur-lg rounded-full scale-50"></div>}
          <LayoutDashboard size={20} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} className="relative z-10" />
          <span className="text-[9px] font-bold tracking-wide relative z-10">Home</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('rides')} 
          className={`relative flex-1 h-full flex flex-col items-center justify-center gap-1 transition-all duration-300 ${activeTab === 'rides' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-400'}`}
        >
          {activeTab === 'rides' && <div className="absolute inset-0 bg-cyan-500/10 blur-lg rounded-full scale-50"></div>}
          <Bike size={20} strokeWidth={activeTab === 'rides' ? 2.5 : 2} className="relative z-10" />
          <span className="text-[9px] font-bold tracking-wide relative z-10">Rides</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('chat')} 
          className={`relative flex-1 h-full flex flex-col items-center justify-center gap-1 transition-all duration-300 ${activeTab === 'chat' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-400'}`}
        >
          {activeTab === 'chat' && <div className="absolute inset-0 bg-cyan-500/10 blur-lg rounded-full scale-50"></div>}
          <MessageSquare size={20} strokeWidth={activeTab === 'chat' ? 2.5 : 2} className="relative z-10" />
          <span className="text-[9px] font-bold tracking-wide relative z-10">Coach</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('settings')} 
          className={`relative flex-1 h-full flex flex-col items-center justify-center gap-1 transition-all duration-300 ${activeTab === 'settings' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-400'}`}
        >
          {activeTab === 'settings' && <div className="absolute inset-0 bg-cyan-500/10 blur-lg rounded-full scale-50"></div>}
          <Settings size={20} strokeWidth={activeTab === 'settings' ? 2.5 : 2} className="relative z-10" />
          <span className="text-[9px] font-bold tracking-wide relative z-10">Profile</span>
        </button>
      </nav>

      {selectedActivity && creds && (
        <CoachingModal 
          activity={selectedActivity} 
          creds={creds}
          onClose={() => setSelectedActivity(null)}
          userGoal={userGoal}
        />
      )}
    </div>
  );
};

export default App;
