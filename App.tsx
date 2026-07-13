import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  IntervalsCredentials, 
  DailySuggestion,
  ChatMessage,
  Wellness,
  UserProfileAnalysis,
  AnnualPowerCurve,
  WeeklyBriefing
} from './types';
import { fetchActivities, fetchWellness, fetchAthleteId, fetchAthleteProfile, getAnnualPowerCurves, uploadWorkout } from './services/intervalsService';
import { getDailySuggestion, sendChatMessage, getWeeklyBriefing, analyzeUserProfile } from './services/geminiService';
import { ActivityCard } from './components/ActivityCard';
import { SuggestedWorkoutCard } from './components/SuggestedWorkoutCard';
import { CoachingModal } from './components/CoachingModal';
import { WeeklyBriefingModal } from './components/WeeklyBriefingModal';
import { ChangelogModal } from './components/ChangelogModal';
import { StepLabel, getStepPhaseLabel, GroupedWorkoutStepsList } from './components/StepLabel';
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
  MoreHorizontal,
  Check,
  Menu,
  X,
  Info,
  Trophy,
  Loader2,
  Edit
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

const getFriendlyNextRideDay = (targetDate: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  
  if (target.getTime() === today.getTime()) {
    return 'Today';
  } else if (target.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  } else {
    return target.toLocaleDateString('en-US', { weekday: 'long' });
  }
};

const CHAT_SUGGESTIONS: string[] = [
  "Analyze recent load",
  "Current readiness?",
  "Goal check",
  "Efficiency trend"
];

const APP_VERSION = '1.1.1';
const APP_CHANGELOG = [
  "New: Version changelog popup to keep you informed of updates.",
  "Fix: Resolved iOS layout scaling issues when keyboard is active. The screen no longer shifts up and the bottom bar correctly hides.",
  "Improvement: Maximized screen real-estate by removing dead space.",
  "Update: Reorganized Training Plan and Recovery Advice on the home screen for better visibility."
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
  const [powerCurves, setPowerCurves] = useState<AnnualPowerCurve[]>(() => {
    try {
      const saved = localStorage.getItem('wattson_power_curves');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedSuggestedDay, setSelectedSuggestedDay] = useState<WeeklyBriefing['days'][0] | null>(null);
  const [showWeeklyBriefing, setShowWeeklyBriefing] = useState(false);
  const [weeklyBriefing, setWeeklyBriefing] = useState<WeeklyBriefing | null>(null);
  const [weeklyBriefingError, setWeeklyBriefingError] = useState<string | null>(null);
  const [loadingWeeklyBriefing, setLoadingWeeklyBriefing] = useState(false);
  const [planMode, setPlanMode] = useState<'power' | 'hr'>(() => {
    return (localStorage.getItem('wattson_plan_mode') as 'power' | 'hr') || 'power';
  });
  const [triathlonMode, setTriathlonMode] = useState<boolean>(() => {
    return localStorage.getItem('wattson_triathlon_mode') === 'true';
  });
  
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
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<'main' | 'goal' | 'data' | 'methodology' | 'ftp'>('main');
  const [userProfile, setUserProfile] = useState<UserProfileAnalysis | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [showWorkoutDetail, setShowWorkoutDetail] = useState(false);
  const [syncingWorkout, setSyncingWorkout] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [reasoningPopup, setReasoningPopup] = useState<{title: string, content: string} | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  const APP_VERSION = "1.1.0";

  useEffect(() => {
    const seenVersion = localStorage.getItem('wattson_seen_version');
    if (seenVersion !== APP_VERSION) {
      setShowReleaseNotes(true);
      safeSetItem('wattson_seen_version', APP_VERSION);
    }
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('wattson_chat_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [confirmClear, setConfirmClear] = useState(false);

  const safeSetItem = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`Storage limit reached for ${key}. Data not cached.`);
      if (e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        // Fallback: Clear old potentially large caches if critical
        if (key === 'wattson_activities_cache' || key === 'wattson_wellness_cache') {
          // We could try to clear chat history or just leave it
        }
      }
    }
  };

  useEffect(() => {
    safeSetItem('wattson_chat_history', JSON.stringify(messages));
  }, [messages]);

  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [planContext, setPlanContext] = useState<string | null>(() => localStorage.getItem('wattson_plan_context'));
  const [showSuggestionDetail, setShowSuggestionDetail] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const todayElementRef = useRef<HTMLDivElement>(null);
  
  const [userGoal, setUserGoal] = useState<string>(() => localStorage.getItem('wattson_goal') || 'Improve cycling performance');
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [formKey, setFormKey] = useState(creds?.apiKey || '');
  const [formId, setFormId] = useState(creds?.athleteId || '');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const lastSeenVersion = localStorage.getItem('wattson_last_version');
    if (lastSeenVersion !== APP_VERSION) {
      setShowChangelog(true);
      localStorage.setItem('wattson_last_version', APP_VERSION);
    }
  }, []);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

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

      const [fetchedActivities, fetchedWellness, profile, curves] = await Promise.all([
        fetchActivities(activeCreds, 3650),
        fetchWellness(activeCreds, 3650),
        activeCreds.apiKey === 'demo' ? Promise.resolve({ id: '0', icu_ftp: 250 }) : fetchAthleteProfile(activeCreds),
        getAnnualPowerCurves(activeCreds, 3) // Last 3 years
      ]);
      
      setActivities(fetchedActivities || []);
      setWellnessData(fetchedWellness || []);
      setPowerCurves(curves || []);
      if (profile?.icu_ftp) {
        setFtp(profile.icu_ftp);
        safeSetItem('wattson_ftp', profile.icu_ftp.toString());
      }
      
      // Limit cache to avoid QuotaExceededError (5MB limit)
      // Save only last 2 years of activities to disk while keeping full history in memory
      const activitiesToCache = (fetchedActivities || []).slice(0, 500); 
      const wellnessToCache = (fetchedWellness || []).slice(-730);

      safeSetItem('wattson_activities_cache', JSON.stringify(activitiesToCache));
      safeSetItem('wattson_wellness_cache', JSON.stringify(wellnessToCache));
      safeSetItem('wattson_power_curves', JSON.stringify(curves || []));
      
      const credsChanged = !creds || 
                           activeCreds.apiKey !== creds.apiKey || 
                           activeCreds.athleteId !== creds.athleteId;
      
      if (credsChanged) {
        setCreds(activeCreds);
        safeSetItem('wattson_creds', JSON.stringify(activeCreds));
      }

      // If initial load and we have history, greet the user
      if (isInitial && fetchedActivities && fetchedActivities.length > 0 && messages.length === 0) {
        const sorted = [...fetchedActivities].sort((a,b) => a.start_date_local.localeCompare(b.start_date_local));
        const oldestRide = sorted[0];
        const oldestDateStr = new Date(oldestRide.start_date_local).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        
        let introMsg = `Connection established. I've analyzed your full history of **${fetchedActivities.length} activities** extending back to **${oldestDateStr}**.\n\nI'm ready to provide coaching based on your long-term evolution. What's on your mind today?`;
        
        if (planContext) {
          introMsg += `\n\n*Applied context: ${planContext}*`;
        }
        
        setMessages([{ role: 'model', text: introMsg }]);
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
                        (!suggestion || suggestion.date !== targetStr || (suggestion.primary.intensity !== 'Rest' && !suggestion.primary.workout_steps));

    if (shouldFetch) {
      const fetchNewSuggestion = async () => {
        setLoadingSuggestion(true);
        try {
          const data = await getDailySuggestion(activities!, userGoal, hasRideToday, ftp || undefined);
          setSuggestion(data);
          safeSetItem('wattson_daily_cache', JSON.stringify(data));
        } catch (err) {
          console.error("Suggestion failed:", err);
        } finally {
          setLoadingSuggestion(false);
        }
      };
      fetchNewSuggestion();
    }
  }, [activities, userGoal, hasRideToday]);

  const fetchWeeklyBriefingData = useCallback(async (customPlanContext?: string, force = false, mode?: 'power' | 'hr', triMode?: boolean) => {
    if (!activities || activities.length === 0) return;
    setLoadingWeeklyBriefing(true);
    setWeeklyBriefingError(null);
    try {
      const now = new Date();
      const todayStr = toLocalDateStr(now);
      const hasActivityToday = activities.some(a => a.start_date_local.startsWith(todayStr));
      
      const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      const tomorrowName = tomorrow.toLocaleDateString('en-US', { weekday: 'long' });

      const todaySuggestionText = suggestion 
        ? `The primary suggested workout is: "${suggestion.primary.title}" (${suggestion.primary.duration_minutes} min, ${suggestion.primary.intensity} intensity). `
        : "";
        
      let startContext = `CURRENT DATE: ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. `;
      if (hasActivityToday) {
        startContext += `Plan MUST start from TOMORROW, which is ${tomorrowName} (Day 1 = Tomorrow), as the athlete already completed a workout today. ${todaySuggestionText} Use this workout for ${tomorrowName}. `;
      } else {
        startContext += `Plan MUST start from TODAY, which is ${todayName}. ${todaySuggestionText} Use this workout for ${todayName} (Day 1). `;
      }

      const ctxToUse = customPlanContext !== undefined ? customPlanContext : (planContext || undefined);
      const activeMode = mode || planMode;
      const activeTriMode = triMode !== undefined ? triMode : triathlonMode;

      const data = await getWeeklyBriefing(activities, wellnessData, userGoal, startContext, ftp || undefined, powerCurves, ctxToUse || undefined, force, activeMode, activeTriMode);
      setWeeklyBriefing(data);
    } catch (err: any) {
      console.error("Failed to load weekly briefing:", err);
      setWeeklyBriefingError(err.message || String(err));
    } finally {
      setLoadingWeeklyBriefing(false);
    }
  }, [activities, wellnessData, userGoal, suggestion, ftp, powerCurves, planContext, planMode, triathlonMode]);

  useEffect(() => {
    if (activities && activities.length > 0) {
      fetchWeeklyBriefingData(undefined, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  useEffect(() => {
    // Methodology view: Athlete DNA
    if (activeTab === 'settings' && settingsView === 'methodology') {
      const fetchProfile = async () => {
        setIsLoadingProfile(true);
        try {
          const profile = await analyzeUserProfile(activities || [], userGoal, powerCurves);
          setUserProfile(profile);
        } catch (err) {
          console.error("Failed to fetch user profile", err);
        } finally {
          setIsLoadingProfile(false);
        }
      };
      fetchProfile();
    }
  }, [settingsView, activities, userGoal]);

  const handleLogout = () => {
    const keys = [
      'wattson_creds', 
      'wattson_activities_cache', 
      'wattson_wellness_cache', 
      'wattson_ftp', 
      'wattson_daily_cache', 
      'wattson_chat_history',
      'wattson_goal',
      'wattson_seen_version',
      'wattson_plan_context'
    ];
    keys.forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

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
    const total7DayTimeSeconds = safeActivities
        .filter(a => {
            const d = new Date(a.start_date_local);
            const now = new Date();
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 7);
            return d >= sevenDaysAgo;
        })
        .reduce((acc, a) => acc + (a.moving_time ?? 0), 0);
    const total7DayTime = Math.round(total7DayTimeSeconds / 3600 * 10) / 10;

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

    return { last7Days, total7DayLoad, total7DayTime, statusLabel, statusColor, statusBg, readiness, recoveryProgress, recoveryLabel, form: Math.round(form), ctl: Math.round(ctl), atl: Math.round(atl) };
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
        readiness: suggestion?.readiness_score ?? stats.readiness,
        activities: activities || [],
        wellness: wellnessData || [],
        powerCurves
      });
      
      // Look for [UPDATE_PLAN: ...] in the response
      const planUpdateIdx = response.indexOf('[UPDATE_PLAN:');
      let finalResponseText = response;
      let hasPlanUpdate = false;
      let directive = '';
      if (planUpdateIdx !== -1) {
        const closingIdx = response.indexOf(']', planUpdateIdx);
        if (closingIdx !== -1) {
          directive = response.substring(planUpdateIdx + 13, closingIdx).trim();
          finalResponseText = response.substring(0, planUpdateIdx).trim() + response.substring(closingIdx + 1).trim();
          hasPlanUpdate = true;
        }
      }

      const rawText = hasPlanUpdate 
        ? finalResponseText + "\n\n*System: Coach context updated. Your next weekly plan generation will reflect these changes.*"
        : finalResponseText;

      // Add empty model message first
      setMessages(prev => [...prev, { role: 'model', text: '' }]);
      
      let currentIdx = 0;
      const speed = 10; // Fast and ultra-fluid typing simulation
      
      const typeNext = () => {
        if (currentIdx < rawText.length) {
          const chunkSize = Math.min(3, rawText.length - currentIdx);
          currentIdx += chunkSize;
          
          setMessages(prev => {
            const copy = [...prev];
            if (copy.length > 0 && copy[copy.length - 1].role === 'model') {
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                text: rawText.substring(0, currentIdx)
              };
            }
            return copy;
          });
          
          setTimeout(typeNext, speed);
        } else {
          // Finished typing, synchronize context
          if (hasPlanUpdate && directive) {
            setPlanContext(directive);
            safeSetItem('wattson_plan_context', directive);
            fetchWeeklyBriefingData(directive, true);
          }
          setIsChatLoading(false);
        }
      };
      
      setTimeout(typeNext, 50);

    } catch {
      setMessages(prev => [...prev, { role: 'model', text: "Engine response error." }]);
      setIsChatLoading(false);
    }
  };

  const groupedActivities = useMemo(() => {
    const safeActivities = activities || [];
    const recognizedTypes = ['Ride', 'VirtualRide', 'Run', 'VirtualRun', 'Swim'];
    const filtered = safeActivities.filter(a => !a.type || recognizedTypes.includes(a.type));
    const sorted = [...filtered].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local));
    const groups: Record<string, Activity[]> = {};
    sorted.forEach(a => {
      const d = new Date(a.start_date_local);
      const monthYear = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!groups[monthYear]) groups[monthYear] = [];
      groups[monthYear].push(a);
    });
    return groups;
  }, [activities]);

  const timelineItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toLocalDateStr(today);

    const items: {
      type: 'past' | 'today_actual' | 'today_suggested' | 'future_suggested';
      key: string;
      date: Date;
      label: string;
      dayData?: WeeklyBriefing['days'][0];
      activityData?: Activity;
      absoluteIndex?: number;
    }[] = [];

    // 1. Process suggested workouts from weekly briefing
    if (weeklyBriefing && weeklyBriefing.days) {
      const hasActivityToday = (activities || []).some(a => a.start_date_local.startsWith(todayStr));
      const offset = hasActivityToday ? 1 : 0;

      weeklyBriefing.days.forEach((day, idx) => {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + idx + offset);
        
        const dateStr = toLocalDateStr(targetDate);
        const isTodayDay = dateStr === todayStr;

        if (isTodayDay) {
          items.push({
            type: 'today_suggested',
            key: `suggested-today-${idx}`,
            date: targetDate,
            label: "Today's Target Workout",
            dayData: day,
            absoluteIndex: idx
          });
        } else if (targetDate > today) {
          items.push({
            type: 'future_suggested',
            key: `suggested-future-${idx}`,
            date: targetDate,
            label: "Suggested Workout",
            dayData: day,
            absoluteIndex: idx
          });
        }
      });
    }

    // 2. Process actual activities
    const safeActivities = activities || [];
    const recognizedTypes = ['Ride', 'VirtualRide', 'Run', 'VirtualRun', 'Swim'];
    const filtered = safeActivities.filter(a => !a.type || recognizedTypes.includes(a.type));

    filtered.forEach(a => {
      const activityDate = new Date(a.start_date_local);
      const dateOnlyStr = a.start_date_local.split('T')[0];
      
      if (dateOnlyStr === todayStr) {
        items.push({
          type: 'today_actual',
          key: `actual-today-${a.id}`,
          date: activityDate,
          label: "Today's Activity",
          activityData: a
        });
      } else if (activityDate < today) {
        items.push({
          type: 'past',
          key: `actual-past-${a.id}`,
          date: activityDate,
          label: "Completed Ride",
          activityData: a
        });
      }
    });

    return items;
  }, [activities, weeklyBriefing]);

  const sortedTimelineItems = useMemo(() => {
    return [...timelineItems].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [timelineItems]);

  const nextRideFromPlan = useMemo(() => {
    if (!weeklyBriefing || !weeklyBriefing.days) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toLocalDateStr(today);
    const hasActivityToday = (activities || []).some(a => a.start_date_local.startsWith(todayStr));
    const offset = hasActivityToday ? 1 : 0;

    const daysWithDates = weeklyBriefing.days.map((day, idx) => {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + idx + offset);
      const isRest = day.intensity === 'Rest' || day.focus.toLowerCase().includes('rest') || day.load_target === 0;
      return {
        day,
        date: targetDate,
        isRest,
        absoluteIndex: idx
      };
    });

    const upcomingRides = daysWithDates.filter(d => {
      if (d.isRest) return false;
      if (toLocalDateStr(d.date) === todayStr) {
        return !hasActivityToday;
      }
      return d.date > today;
    });

    return upcomingRides[0] || null;
  }, [weeklyBriefing, activities]);

  useEffect(() => {
    if (activeTab === 'rides') {
      const scrollToday = () => {
        if (todayElementRef.current) {
          todayElementRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      };
      scrollToday();
      const t1 = setTimeout(scrollToday, 50);
      const t2 = setTimeout(scrollToday, 150);
      const t3 = setTimeout(scrollToday, 400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [activeTab, sortedTimelineItems]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatLoading]);

  const currentWorkout = suggestion ? (showAlternative ? suggestion.alternative : suggestion.primary) : null;

  if (loading && (!activities || activities.length === 0)) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-8 bg-transparent">
      <div className="premium-bg"></div>
      <div className="w-8 h-8 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Syncing Engine...</p>
    </div>
  );

  if (!creds || syncError) return (
    <div className="fixed inset-0 flex flex-col p-8 justify-center items-center">
      <div className="premium-bg"></div>
      <div className="glass-card w-full max-w-sm p-8 rounded-[2rem] text-center">
        <div className="w-12 h-12 bg-emerald-500/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5 shadow-inner">
          <CyclistIcon size={24} className="text-emerald-400" />
        </div>
        <h1 className="text-3xl font-black text-white italic mb-8 tracking-tight">
          wa<span className="text-emerald-400">TT</span>son
        </h1>
        <div className="space-y-3">
          {syncError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-400 font-bold leading-tight">
              {syncError}
            </div>
          )}
          <input 
            type="password" 
            placeholder="Intervals.icu API Key" 
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white text-base outline-none focus:border-emerald-500/50 transition-colors" 
            value={formKey}
            onChange={(e) => {
              setFormKey(e.target.value);
              if (syncError) setSyncError(null);
            }}
          />
          <input 
            type="text" 
            placeholder="Athlete ID (e.g. i12345)" 
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white text-base outline-none focus:border-emerald-500/50 transition-colors" 
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
    <div 
      className="fixed inset-0 flex flex-col overflow-hidden bg-transparent max-w-[450px] mx-auto w-full shadow-2xl" 
    >
      <div className="premium-bg"></div>
      
      {/* Global Top Bar */}
      <header className="flex-none flex items-center justify-between pb-4 px-6 bg-transparent border-b border-white/5 z-30" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl glass-card flex flex-shrink-0 items-center justify-center shadow-inner relative overflow-hidden">
             {isSyncing && <div className="absolute inset-0 bg-emerald-500/20 animate-pulse" />}
             {activeTab === 'chat' ? <Bot size={18} className="text-emerald-400" /> : <CyclistIcon size={20} className="text-emerald-400" />}
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-white italic tracking-tight leading-none">
                wa<span className="text-emerald-400">TT</span>son
              </h2>
              {isSyncing && <RotateCcw size={12} className="animate-spin text-emerald-400" />}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 items-center">
          {activeTab === 'chat' && (
            <button 
              onClick={() => { 
                if (confirmClear) {
                  setMessages([]);
                  setConfirmClear(false);
                } else {
                  setConfirmClear(true);
                  setTimeout(() => setConfirmClear(false), 3000);
                }
              }}
              className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                confirmClear 
                ? 'bg-rose-500 border-rose-600 text-white shadow-[0_0_10px_rgba(244,63,94,0.3)]' 
                : 'bg-white/5 border-white/5 text-slate-500 hover:text-rose-400 hover:border-rose-500/20'
              }`}
            >
              {confirmClear ? 'Confirm?' : 'Clear'}
            </button>
          )}

          {activeTab !== 'chat' && (
            <button 
              onClick={() => { setSuggestion(null); loadData(creds!); }}
              disabled={isSyncing}
              className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-emerald-400 border border-emerald-500/20 active:scale-95 transition-all shadow-[0_0_15px_rgba(34,211,238,0.15)]"
            >
              <RefreshCw size={16} className={isSyncing ? 'animate-spin text-emerald-400' : ''} />
            </button>
          )}
        </div>
      </header>

      {/* Scrollable View Area */}
      <div 
        className={`flex-1 hide-scrollbar scroll-smooth flex flex-col relative ${activeTab === 'chat' ? 'p-0 overflow-hidden' : 'px-4 pt-4 pb-16 overflow-y-auto'}`}
      >

        {activeTab === 'dashboard' && (
          <div className="flex flex-col space-y-3.5 animate-in fade-in duration-500 pb-2">
            
            {/* Section: Why */}
            <div className="flex flex-col space-y-1.5">
              <div className="px-1">
                <span className="inline-block px-2.5 py-0.5 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-[0.2em] rounded-md">
                  Why
                </span>
              </div>
              <div className="glass-card p-2.5 rounded-xl border border-emerald-500/10 flex items-center gap-2.5 bg-gradient-to-r from-slate-950 via-slate-900/40 to-slate-950 relative overflow-hidden group">
                <div className="absolute inset-y-0 right-0 w-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-500" />
                
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex flex-shrink-0 items-center justify-center relative shadow-inner overflow-hidden">
                  <div className="absolute inset-1.5 border border-emerald-500/25 rounded-lg animate-ping [animation-duration:3s]" />
                  <Target size={15} className="text-emerald-400" />
                </div>
                
                <div className="flex-1 min-w-0 pr-1">
                  <h2 className="text-[12px] font-black text-white italic tracking-tight leading-snug truncate">
                    "{userGoal || 'Define your primary training goal'}"
                  </h2>
                </div>
                
                <button
                  onClick={() => setShowGoalEditor(true)}
                  className="w-7 h-7 rounded-md bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center shrink-0"
                  title="Edit Goal"
                >
                  <Edit size={10} />
                </button>
              </div>
            </div>

            {/* Section: How */}
            <div className="flex flex-col space-y-1.5">
              <div className="px-1">
                <span className="inline-block px-2.5 py-0.5 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-[0.2em] rounded-md">
                  How
                </span>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                {/* Training Plan Card */}
                <div 
                  onClick={() => setShowWeeklyBriefing(true)}
                  className="glass-card p-2.5 rounded-xl border border-white/5 hover:border-emerald-500/20 flex items-center gap-2.5 bg-gradient-to-r from-slate-950 via-slate-900/20 to-slate-950 active:scale-[0.99] transition-all duration-300 cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 group-hover:scale-105 transition-all shrink-0">
                    <Calendar size={14} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[11px] font-black uppercase tracking-wider text-white">
                      Trainings Plan
                    </h3>
                  </div>
                  <ChevronRight size={12} className="text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>

                {/* Next Ride Card */}
                {nextRideFromPlan ? (
                  <div 
                    onClick={() => setSelectedSuggestedDay(nextRideFromPlan.day)}
                    className="glass-card p-2.5 rounded-xl border border-white/5 hover:border-emerald-500/20 flex items-center gap-2.5 bg-gradient-to-r from-slate-950 via-slate-900/20 to-slate-950 active:scale-[0.99] transition-all duration-300 cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-500/10 border-l border-b border-emerald-500/10 rounded-bl-lg text-[7px] font-black uppercase tracking-wider text-emerald-400">
                      {getFriendlyNextRideDay(nextRideFromPlan.date)}
                    </div>

                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 group-hover:scale-105 transition-all shrink-0">
                      <Bike size={14} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0 pr-8">
                      <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                        Next Scheduled Ride
                      </span>
                      <h3 className="text-[11px] font-black text-white group-hover:text-emerald-400 transition-colors truncate">
                        {nextRideFromPlan.day.focus}
                      </h3>
                    </div>
                    <ChevronRight size={12} className="text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                ) : (
                  <div className="glass-card p-2.5 rounded-xl border border-white/5 flex items-center gap-2.5 bg-gradient-to-r from-slate-950 via-slate-900/20 to-slate-950 opacity-60">
                    <div className="w-8 h-8 rounded-lg bg-slate-900/50 border border-white/5 flex items-center justify-center text-slate-500 shrink-0">
                      <Bike size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                        Next Scheduled Ride
                      </span>
                      <h3 className="text-[11px] font-bold text-slate-400 truncate">
                        No upcoming ride planned
                      </h3>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Results */}
            <div className="flex flex-col space-y-1.5">
              <div className="px-1">
                <span className="inline-block px-2.5 py-0.5 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-[0.2em] rounded-md">
                  Results
                </span>
              </div>

              {/* Last Ride Section */}
              {(() => {
                const lastActivity = activities && activities.length > 0 
                  ? [...activities].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local))[0] 
                  : null;
                
                if (!lastActivity) return null;

                return (
                  <div className="mb-2">
                    <ActivityCard 
                      activity={lastActivity} 
                      onClick={(activity) => {
                        setSelectedActivity(activity);
                        setActiveTab('rides');
                      }} 
                    />
                  </div>
                );
              })()}

              {/* 3-column PMC metrics */}
              <div className="grid grid-cols-3 gap-2">
                {/* Fitness / CTL */}
                <div className="glass-card p-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-slate-900/30 to-slate-950/20 text-center min-h-[58px] group hover:border-white/10 transition-all">
                  <div className="absolute top-0 right-0 w-8 h-8 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
                  <div className="flex items-center gap-1 text-blue-400">
                    <TrendingUp size={9} strokeWidth={2.5} />
                    <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-400">Fitness</span>
                  </div>
                  <div className="mt-0.5">
                    <span className="text-xl font-black italic tracking-tight text-white font-mono">{stats.ctl}</span>
                  </div>
                </div>

                {/* Fatigue / ATL */}
                <div className="glass-card p-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-slate-900/30 to-slate-950/20 text-center min-h-[58px] group hover:border-white/10 transition-all">
                  <div className="absolute top-0 right-0 w-8 h-8 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
                  <div className="flex items-center gap-1 text-amber-400">
                    <Zap size={9} strokeWidth={2.5} fill="currentColor" />
                    <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-400">Fatigue</span>
                  </div>
                  <div className="mt-0.5">
                    <span className="text-xl font-black italic tracking-tight text-white font-mono">{stats.atl}</span>
                  </div>
                </div>

                {/* Form / TSB */}
                <div className="glass-card p-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-slate-900/30 to-slate-950/20 text-center min-h-[58px] group hover:border-white/10 transition-all">
                  <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
                  <div className="flex items-center gap-1 text-emerald-400">
                    <ActivityIcon size={9} strokeWidth={2.5} />
                    <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-400">Form</span>
                  </div>
                  <div className="mt-0.5 flex flex-col items-center">
                    <span className={`text-xl font-black italic tracking-tight font-mono leading-none ${stats.form >= 5 ? 'text-emerald-400' : stats.form < -25 ? 'text-rose-400' : stats.form < -10 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {stats.form > 0 ? `+${stats.form}` : stats.form}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2-column secondary metrics */}
              <div className="grid grid-cols-2 gap-2">
                {/* Total Time 7D */}
                <div className="glass-card p-2 rounded-xl border border-white/5 bg-gradient-to-b from-slate-900/30 to-slate-950/20 hover:border-white/10 transition-all flex items-center justify-between min-h-[38px] px-3">
                  <h4 className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest">Total Time (7D)</h4>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-base font-black italic tracking-tighter text-white font-mono">
                      {stats.total7DayTime}
                    </span>
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">h</span>
                  </div>
                </div>
                
                {/* 7-Day Load */}
                <div className="glass-card p-2 rounded-xl border border-white/5 bg-gradient-to-b from-slate-900/30 to-slate-950/20 hover:border-white/10 transition-all flex items-center justify-between min-h-[38px] px-3">
                  <h4 className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest">7D Load</h4>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-base font-black italic tracking-tighter text-white font-mono">
                      {stats.total7DayLoad}
                    </span>
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">TSS</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'rides' && (
          <div className="flex flex-col animate-in slide-in-from-right-2 duration-400">
             {selectedActivity && creds ? (
               <CoachingModal 
                 activity={selectedActivity} 
                 creds={creds} 
                 onClose={() => setSelectedActivity(null)} 
                 userGoal={userGoal} 
                 ftp={ftp || undefined}
                 allActivities={activities || undefined}
               />
             ) : (
                <div className="flex flex-col pt-1 pb-2 space-y-3.5">
                  {(() => {
                    const futureItems = sortedTimelineItems.filter(i => i.type === 'future_suggested');
                    const todayItems = sortedTimelineItems.filter(i => i.type === 'today_suggested' || i.type === 'today_actual');
                    const pastItems = sortedTimelineItems.filter(i => i.type === 'past');
                    
                    return (
                      <>
                        {/* Future Rides Section */}
                        {futureItems.length > 0 && (
                          <div className="flex flex-col space-y-3.5 relative">
                            <div className="z-10 bg-slate-950 pt-4 pb-2 px-1 -mx-1 border-b border-white/5 shadow-md">
                              <div className="flex items-center gap-3">
                                <span className="inline-block px-3 py-1 bg-blue-500 text-slate-950 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.4)]">
                                  Plan
                                </span>
                                <div className="flex-1 h-px bg-gradient-to-r from-blue-500/40 to-transparent" />
                              </div>
                            </div>
                            {futureItems.map((item, idx, arr) => (
                              <React.Fragment key={item.key}>
                                {item.dayData && (
                                  <div ref={idx === arr.length - 1 ? todayElementRef : null} className="scroll-mt-[112px]">
                                    <SuggestedWorkoutCard 
                                      day={item.dayData}
                                      absoluteIndex={item.absoluteIndex ?? 0}
                                      onClick={(day) => setSelectedSuggestedDay(day)}
                                      isToday={false}
                                    />
                                  </div>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {/* Today Section */}
                        {todayItems.length > 0 && (
                          <div className="flex flex-col space-y-3.5 pt-2">
                            <div 
                              className="flex items-center gap-3 px-1"
                              ref={futureItems.length === 0 ? todayElementRef : null}
                            >
                              <span className="inline-block px-3 py-1 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse">
                                Today
                              </span>
                              <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/40 to-transparent" />
                            </div>
                            {todayItems.map(item => (
                              <React.Fragment key={item.key}>
                                {item.type === 'today_actual' ? (
                                  item.activityData && (
                                    <ActivityCard 
                                      activity={item.activityData} 
                                      onClick={setSelectedActivity} 
                                    />
                                  )
                                ) : (
                                  item.dayData && (
                                    <div className="scroll-mt-[120px]">
                                      <SuggestedWorkoutCard 
                                        day={item.dayData}
                                        absoluteIndex={item.absoluteIndex ?? 0}
                                        onClick={(day) => setSelectedSuggestedDay(day)}
                                        isToday={true}
                                      />
                                    </div>
                                  )
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {/* Past Section */}
                        {pastItems.length > 0 && (
                          <div className="flex flex-col space-y-3.5 pt-4">
                            <div className="flex items-center gap-3 px-1 pb-2">
                              <span className="inline-block px-3 py-1 bg-[#12141c] border border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg">
                                Training History
                              </span>
                              <div className="flex-1 h-px bg-gradient-to-r from-white/5 to-transparent" />
                            </div>
                            {pastItems.map((item, idx, arr) => {
                              const prevItem = idx > 0 ? arr[idx - 1] : null;
                              let showMonthHeader = false;
                              let monthLabel = '';
                              if (item.activityData) {
                                const itemMonth = new Date(item.activityData.start_date_local).toLocaleString('default', { month: 'long', year: 'numeric' });
                                const prevMonth = prevItem && prevItem.activityData 
                                  ? new Date(prevItem.activityData.start_date_local).toLocaleString('default', { month: 'long', year: 'numeric' })
                                  : '';
                                if (itemMonth !== prevMonth && idx > 0) { 
                                  showMonthHeader = true;
                                  monthLabel = itemMonth.toUpperCase();
                                }
                              }
                              
                              return (
                                <React.Fragment key={item.key}>
                                  {showMonthHeader && (
                                    <div className="flex items-center gap-3 px-1 pt-4 pb-2">
                                      <span className="inline-block px-3 py-1 bg-[#12141c] border border-white/5 text-slate-400 text-[10px] font-black uppercase tracking-[0.25em] rounded-lg">
                                        {monthLabel}
                                      </span>
                                      <div className="flex-1 h-px bg-gradient-to-r from-white/5 to-transparent" />
                                    </div>
                                  )}
                                  {item.activityData && (
                                    <ActivityCard 
                                      activity={item.activityData} 
                                      onClick={setSelectedActivity} 
                                    />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>             )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 bg-transparent animate-in fade-in duration-500 overflow-hidden relative">
             <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-4 py-4 custom-scrollbar">
               {messages.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-center px-6 pb-12 animate-in fade-in duration-500">
                    <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5 shadow-inner animate-pulse relative">
                       <div className="absolute inset-2 border border-emerald-500/20 rounded-2xl animate-ping [animation-duration:4s]" />
                       <Bot size={28} className="text-emerald-400" />
                    </div>
                    <p className="text-sm font-black text-white italic uppercase tracking-wider mb-2">waTTson Coach AI</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-6 max-w-[240px]">
                      Your performance engine is fully calibrated. Ask me anything or select a diagnostic focus chip below:
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-[320px]">
                       {(CHAT_SUGGESTIONS as string[]).map((suggestionText) => (
                         <button 
                           key={suggestionText}
                           onClick={() => handleSendMessage(suggestionText)}
                           className="text-[10px] font-black text-slate-200 bg-[#12141c]/80 border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-400 rounded-xl py-2.5 px-4 active:scale-95 transition-all flex items-center gap-1.5 uppercase tracking-wider shadow-md"
                         >
                           <Sparkles size={11} className="text-emerald-400" /> {suggestionText}
                         </button>
                       ))}
                    </div>
                 </div>
               ) : (
                <div className="space-y-4">
                  {(messages as ChatMessage[]).map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    
                    // Parse system instructions if appended
                    const textParts = msg.text.split('*System:');
                    const mainText = textParts[0].trim();
                    const systemText = textParts[1] ? textParts[1].replace(/\*/g, '').trim() : '';

                    // If it's a typing model placeholder
                    const isEmptyModel = !isUser && !mainText;

                    return (
                      <div 
                        key={idx} 
                        className={`flex gap-2.5 items-end ${isUser ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
                      >
                        {/* waTTson Avatar */}
                        {!isUser && (
                          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-emerald-500/20 flex flex-shrink-0 items-center justify-center shadow-md relative overflow-hidden self-start mt-0.5">
                            <Bot size={14} className="text-emerald-400" />
                          </div>
                        )}
                        
                        <div className={`max-w-[80%] px-4 py-3 rounded-2xl shadow-md ${
                          isUser 
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold rounded-tr-none' 
                          : 'glass-card text-slate-100 rounded-tl-none border border-emerald-500/5'
                        }`}>
                          <div className="text-[14px] leading-relaxed whitespace-pre-line">
                            {isEmptyModel ? (
                              <div className="flex gap-1 items-center py-1">
                                <div className="w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-bounce [animation-delay:0ms]"></div>
                                <div className="w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-bounce [animation-delay:150ms]"></div>
                                <div className="w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-bounce [animation-delay:300ms]"></div>
                              </div>
                            ) : (
                              mainText
                            )}
                          </div>
                          
                          {systemText && (
                            <div className="mt-3 pt-2.5 border-t border-emerald-500/10 flex items-start gap-2 text-[10px] text-emerald-400 font-mono tracking-wide leading-relaxed bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
                              <Check size={11} className="text-emerald-400 mt-0.5 shrink-0" />
                              <div>
                                <span className="font-bold uppercase text-[8px] tracking-widest text-emerald-500 block mb-0.5">DIRECTIVE SYNCED</span>
                                {systemText}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* User Avatar */}
                        {isUser && (
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-shrink-0 items-center justify-center shadow-md self-start mt-0.5">
                            <User size={13} className="text-emerald-400" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {isChatLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                    <div className="flex justify-start gap-2.5 items-end animate-in fade-in duration-200">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 border border-emerald-500/20 flex flex-shrink-0 items-center justify-center relative overflow-hidden">
                          <Bot size={14} className="text-emerald-400 animate-pulse" />
                        </div>
                        <div className="glass-card px-4 py-3 rounded-2xl rounded-tl-none flex gap-1.5 items-center">
                          <div className="w-1.5 h-1.5 bg-emerald-400/60 rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-emerald-400/60 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-1.5 h-1.5 bg-emerald-400/60 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                    </div>
                  )}
                  <div ref={chatEndRef} className="h-4" />
                </div>
               )}
             </div>

             <div className="sticky bottom-0 shrink-0 px-4 pt-3 bg-slate-950/80 backdrop-blur-md border-t border-white/5 z-20" style={{ paddingBottom: isKeyboardOpen ? '12px' : 'calc(max(16px, env(safe-area-inset-bottom)) + 12px)' }}>
               <form 
                 onSubmit={(e) => { e.preventDefault(); handleSendMessage(chatInput); }} 
                 className="relative max-w-full"
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
                   className="w-full bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-[1.5rem] pl-5 pr-12 py-3.5 text-base text-white focus:outline-none focus:border-emerald-500/40 shadow-xl resize-none custom-scrollbar min-h-[48px] transition-colors"
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
          <div className="flex flex-col animate-in slide-in-from-right-2 duration-400">
             {settingsView === 'main' ? null : (
               <div className="flex items-center justify-start pb-2 px-1 pt-1 mb-2">
                 <button 
                   onClick={() => setSettingsView('main')}
                   className="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-500 border border-white/10 active:scale-95 transition-all"
                 >
                   <ChevronLeft size={18} />
                 </button>
               </div>
             )}

             <div className="flex flex-col pb-2 px-1">
               {settingsView === 'main' && (
                 <>
                   <div className="flex flex-col gap-2">
                     <button 
                       onClick={() => setSettingsView('methodology')}
                       className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-amber-500/10 shadow-sm"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400"><User size={20} /></div>
                         <div className="text-left">
                           <p className="text-[11px] font-black text-white uppercase tracking-widest">Your Rider Profile</p>
                           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">AI Assessment</p>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-600 group-hover:text-amber-400 transition-colors" />
                     </button>

                      <button 
                        onClick={() => setSettingsView('ftp')}
                        className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-orange-500/10 shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400"><Zap size={20} /></div>
                          <div className="text-left">
                            <p className="text-[11px] font-black text-white uppercase tracking-widest">Your FTP</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{ftp || '---'} Watts</p>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-600 group-hover:text-orange-400 transition-colors" />
                      </button>

                     <button 
                       onClick={() => setSettingsView('goal')}
                       className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-emerald-500/10 shadow-sm"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"><Target size={20} /></div>
                         <div className="text-left">
                           <p className="text-[11px] font-black text-white uppercase tracking-widest">Your Goal</p>
                           <p className="text-[10px] text-slate-500 font-bold italic truncate max-w-[180px]">"{userGoal}"</p>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
                     </button>

                     <button 
                       onClick={() => setSettingsView('data')}
                       className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-purple-500/10 shadow-sm"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400"><Database size={20} /></div>
                         <div className="text-left">
                           <p className="text-[11px] font-black text-white uppercase tracking-widest">Your Data</p>
                           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Connected Assets</p>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-600 group-hover:text-purple-400 transition-colors" />
                     </button>
                   

                      <div className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between border border-blue-500/10 shadow-sm transition-all hover:border-blue-500/20">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <Trophy size={20} />
                          </div>
                          <div className="text-left">
                            <p className="text-[11px] font-black text-white uppercase tracking-widest">Triathlon Mode</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                              {triathlonMode ? 'Enabled (Run & Swim)' : 'Disabled (Cycling Only)'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const newMode = !triathlonMode;
                            setTriathlonMode(newMode);
                            localStorage.setItem('wattson_triathlon_mode', newMode ? 'true' : 'false');
                            fetchWeeklyBriefingData(undefined, true, undefined, newMode);
                          }}
                          className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none flex items-center ${
                            triathlonMode ? 'bg-emerald-500 justify-end' : 'bg-slate-800 justify-start'
                          }`}
                        >
                          <motion.div 
                            layout 
                            className="w-4 h-4 rounded-full bg-slate-950 shadow-md"
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                        </button>
                      </div>
                    </div>
                   
                   <div className="grid grid-cols-2 gap-2 mt-auto pt-4">
                     <button onClick={() => { setSuggestion(null); loadData(creds!); }} className="p-3.5 bg-white/5 rounded-[1.3rem] border border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500 flex flex-col items-center gap-2 active:scale-95 transition-all">
                        <RotateCcw size={16} /> Sync Engine
                     </button>
                     <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="p-3.5 bg-rose-500/5 rounded-[1.3rem] border border-rose-500/10 text-[9px] font-black uppercase tracking-widest text-rose-500 flex flex-col items-center gap-2 active:scale-95 transition-all">
                        <LogOut size={16} /> Logout
                     </button>
                   </div>
                 </>
               )}

               {settingsView === 'goal' && (
                 <div className="glass-card p-4 rounded-[1.5rem] space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
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

                {settingsView === 'ftp' && (
                  <div className="glass-card p-4 rounded-[1.5rem] space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                        Your FTP (Functional Threshold Power) is the engine's core benchmark. While we sync this from Intervals.icu, you can override it here to fine-tune intensity.
                      </p>
                      
                      <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center">
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-2">Configure Engine Value</span>
                        <div className="flex items-center gap-6">
                          <button 
                            onClick={() => {
                              const newVal = Math.max(0, (ftp || 200) - 5);
                              setFtp(newVal);
                              safeSetItem('wattson_ftp', newVal.toString());
                            }}
                            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:bg-white/10"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <span className="text-4xl font-black italic text-white tracking-tighter w-24 text-center">{ftp || '---'}</span>
                          <button 
                            onClick={() => {
                              const newVal = (ftp || 200) + 5;
                              setFtp(newVal);
                              safeSetItem('wattson_ftp', newVal.toString());
                            }}
                            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:bg-white/10"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-4 text-orange-400">Watts</span>
                      </div>
                      
                      <div className="pt-2">
                         <p className="text-[10px] text-slate-500 leading-relaxed italic text-center">
                           Changes here take effect immediately for all subsequent coaching suggestions and intensity calculations.
                         </p>
                      </div>
                    </div>
                  </div>
                )}

                {settingsView === 'data' && (
                 <div className="glass-card p-4 rounded-[1.5rem] space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <div className="flex items-start gap-4 p-4 bg-slate-950/40 rounded-2xl border border-white/5">
                        <div className="w-8 h-8 mt-1 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0"><ActivityIcon size={16} /></div>
                        <div>
                          <p className="text-[12px] font-bold text-white mb-1">Ride History</p>
                          <p className="text-[10px] text-slate-400 mb-2">waTTson synchronizes your full training history of interval activity to understand your power curve and endurance.</p>
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

                      <div className="pt-2 px-1 space-y-4">
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-start gap-3">
                          <Shield size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">Security Audit Passed</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                              waTTson operates on a **Zero-Persistence** model. Your Intervals.icu API keys are stored only locally in your browser and are never uploaded to a custom server. Data is fetched directly from Intervals.icu to your device.
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-start gap-3">
                          <Bot size={16} className="text-blue-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">AI Processing Trace</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                              To provide insights, training data is shared with Google Gemini Pro. The context shared includes TSS, duration, and watts. Personally identifiable information (like location or name) is minimized.
                            </p>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-500 leading-relaxed italic text-center">
                          Alpha/Beta Build 1.1.0 • Built for waTTson Athletes
                        </p>
                      </div>
                    </div>
                 </div>
               )}

               {settingsView === 'methodology' && (
                 <div className="glass-card p-5 rounded-[1.8rem] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {isLoadingProfile ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="w-10 h-10 rounded-full border-t-2 border-emerald-500 animate-spin mb-4" />
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Generating Profile...</p>
                        <p className="text-[9px] text-slate-500 font-medium mt-1">Analyzing power curve and last 30 activities</p>
                      </div>
                    ) : userProfile ? (
                      <div className="space-y-6">
                        {/* Rider Type Header */}
                        <div className="text-center pb-4 border-b border-white/5">
                          <h3 className="text-xl font-black text-emerald-400 italic uppercase tracking-tight leading-tight">
                            {userProfile.athlete_type}
                          </h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">
                            Based on recent 30-day performance trends
                          </p>
                        </div>

                        {/* Rider Story Narrative */}
                        {userProfile.rider_story && (
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Rider Story</h4>
                            <p className="text-[12px] text-slate-300 leading-relaxed font-medium bg-white/[0.01] border border-white/[0.03] p-4 rounded-2xl italic">
                              "{userProfile.rider_story}"
                            </p>
                          </div>
                        )}

                        {/* Strengths and Limiters */}
                        <div className="grid grid-cols-1 gap-5">
                          {/* Strengths */}
                          <div className="relative pl-3">
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500/40 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]"></div>
                            <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2">Areas of Strength</h4>
                            <ul className="text-[11px] text-slate-400 leading-relaxed font-semibold space-y-1.5">
                              {userProfile.strengths.map((s, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-emerald-400 font-bold">✓</span>
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Limiters */}
                          <div className="relative pl-3">
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-rose-500/40 rounded-full"></div>
                            <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2">Limiters to Improve</h4>
                            <ul className="text-[11px] text-slate-400 leading-relaxed font-semibold space-y-1.5">
                              {userProfile.areas_for_improvement.map((a, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-rose-400 font-bold">!</span>
                                  <span>{a}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* What Can Be Improved Narrative */}
                        {userProfile.what_can_be_improved && (
                          <div className="space-y-2 pt-2 border-t border-white/5">
                            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Physiological Focus</h4>
                            <p className="text-[12px] text-slate-300 leading-relaxed font-medium">
                              {userProfile.what_can_be_improved}
                            </p>
                          </div>
                        )}

                        {/* Training Effectiveness & History */}
                        <div className="space-y-4 pt-4 border-t border-white/5">
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Training History & Response</h4>
                            {userProfile.effective_training_history ? (
                              <p className="text-[12px] text-slate-300 leading-relaxed font-medium">
                                {userProfile.effective_training_history}
                              </p>
                            ) : (
                              <p className="text-[12px] text-slate-300 leading-relaxed font-medium">
                                {userProfile.training_response}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-2xl border border-white/5">
                            <div>
                               <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                 <Check size={10} className="stroke-[3]" /> Effective
                               </p>
                               <ul className="text-[10px] text-slate-300 font-bold space-y-1">
                                 {userProfile.effective_methods.map((m, i) => (
                                   <li key={i} className="flex items-start gap-1">
                                     <span className="text-emerald-500/50">•</span> {m}
                                   </li>
                                 ))}
                               </ul>
                            </div>
                            <div>
                               <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                 <X size={10} className="stroke-[3]" /> Ineffective
                               </p>
                               <ul className="text-[10px] text-slate-300 font-bold space-y-1">
                                 {userProfile.ineffective_methods.map((m, i) => (
                                   <li key={i} className="flex items-start gap-1">
                                     <span className="text-rose-500/50">•</span> {m}
                                   </li>
                                 ))}
                               </ul>
                            </div>
                          </div>
                        </div>

                        {/* Recommended Training Approach */}
                        <div className="space-y-2 pt-4 border-t border-white/5 relative pl-3">
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-purple-500/40 rounded-full"></div>
                          <h4 className="text-[11px] font-black text-white uppercase tracking-widest pl-1">Recommended Approach</h4>
                          {userProfile.recommended_approach && (
                            <p className="text-[12px] text-slate-300 leading-relaxed font-medium pl-1 mb-2">
                              {userProfile.recommended_approach}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 font-bold leading-relaxed pl-1">
                            <span className="text-purple-400 uppercase tracking-widest text-[9px] font-extrabold block mb-0.5">waTTson's Focus:</span>
                            {userProfile.recommended_focus}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                         <p className="text-[11px] text-slate-400">Not enough data to form an assessment yet.</p>
                      </div>
                    )}
                 </div>
               )}
             </div>
          </div>
        )}
      </div>

      {showGoalEditor && (
        <div className="fixed inset-0 z-[210] bg-slate-950/98 backdrop-blur-3xl flex flex-col p-8 animate-in slide-in-from-bottom-4 duration-400" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
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
            onClick={() => { 
              safeSetItem('wattson_goal', userGoal); 
              setSuggestion(null); 
              setShowGoalEditor(false); 
              fetchWeeklyBriefingData(undefined, true);
            }}
            className="w-full py-5 bg-emerald-500 text-slate-950 font-bold text-[10px] uppercase tracking-[0.2em] rounded-[1.8rem] shadow-2xl active:scale-95 transition-all"
          >
            Update Engine Target
          </button>
        </div>
      )}
      {showWorkoutDetail && currentWorkout && (
        <div className="absolute inset-0 z-[220] flex items-center justify-center p-4 bg-[#05070a]/90 backdrop-blur-md" onClick={() => setShowWorkoutDetail(false)}>
          <div className="glass-card w-full max-w-[360px] rounded-[3.5rem] p-10 relative animate-in slide-in-from-bottom-4 duration-300 border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowWorkoutDetail(false)} className="absolute top-8 right-8 text-slate-600 hover:text-white transition-colors p-2 z-20">
              <X size={22} />
            </button>
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-slate-900/50 flex flex-col items-center justify-center shrink-0 border border-white/5 shadow-inner mb-8">
                <span className="text-[7.5px] font-black text-slate-500 uppercase leading-none mb-0.5 tracking-tighter">WRK</span>
                <span className="text-base font-black text-white italic leading-none">OUT</span>
              </div>
              
              <h3 className="text-3xl font-black text-white italic tracking-tighter mb-10 uppercase text-center">
                {currentWorkout.title}
              </h3>
              
              <div className="bg-[#0a0c10] p-8 rounded-[3rem] border border-white/5 w-full text-left space-y-6 shadow-inner relative overflow-hidden">
                 <div className="flex items-center justify-between border-b border-white/5 pb-5 mx-1">
                    <div className="flex items-center gap-2 text-[16px] font-black text-white tracking-tighter">
                       <Clock size={18} className="text-blue-400" /> {currentWorkout.duration_minutes} MIN
                    </div>
                    <div className="flex items-center gap-2 text-[16px] font-black text-amber-400 italic">
                       <Zap size={18} fill="currentColor" className="text-amber-400" /> {currentWorkout.tss || '--'} TSS
                    </div>
                 </div>

                 <div className="space-y-5 py-1 max-h-[220px] overflow-y-auto custom-scrollbar px-1">
                   {currentWorkout.workout_steps && currentWorkout.workout_steps.length > 0 ? (
                     <GroupedWorkoutStepsList 
                       steps={currentWorkout.workout_steps}
                       currentFtp={ftp || undefined}
                       originalFtp={weeklyBriefing?.ftp}
                       fontSize="base"
                     />
                   ) : (
                      <p className="text-[14px] text-slate-400 leading-relaxed italic text-center px-4 font-medium opacity-80">
                        {currentWorkout.description}
                      </p>
                   )}
                 </div>
              </div>

              <div className="mt-10 flex flex-col gap-4 w-full">
                <button 
                  onClick={() => setShowWorkoutDetail(false)}
                  className="w-full py-5 bg-[#1a1c22] rounded-full text-[12px] font-black text-slate-400 hover:text-white transition-all uppercase tracking-[0.2em] active:scale-95"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suggested Day Workout Detail Popup */}
      {selectedSuggestedDay && (() => {
          const index = weeklyBriefing ? weeklyBriefing.days.indexOf(selectedSuggestedDay) : -1;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStr = toLocalDateStr(today);
          const hasActivityToday = (activities || []).some(a => a.start_date_local.startsWith(todayStr));
          const offset = hasActivityToday ? 1 : 0;

          const targetDate = new Date(today);
          if (index !== -1) {
            targetDate.setDate(today.getDate() + index + offset);
          }
          const weekday = targetDate.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
          const dayNum = targetDate.getDate();

          return (
            <div className="fixed inset-0 z-[220] bg-[#05070a]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedSuggestedDay(null)}>
              <div className="bg-slate-950/80 w-full max-w-sm rounded-[2.5rem] p-6 pb-6 relative border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelectedSuggestedDay(null)} className="absolute top-5 right-5 text-slate-500 hover:text-white transition-colors p-2 z-20 bg-black/40 rounded-full">
                  <X size={18} />
                </button>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-xl bg-slate-900/50 flex flex-col items-center justify-center shrink-0 border border-white/5 shadow-inner mb-5">
                    <span className="text-[7.5px] font-black text-slate-500 uppercase leading-none mb-0.5 tracking-tighter">{weekday}</span>
                    <span className="text-base font-black text-white italic leading-none">{dayNum}</span>
                  </div>
                  
                  <h3 className="text-lg font-black text-white italic tracking-tighter mb-6 uppercase text-center leading-tight px-4">
                    {selectedSuggestedDay.focus}
                  </h3>
                  
                  <div className="bg-black/60 p-5 rounded-3xl border border-white/5 w-full text-left space-y-4 relative overflow-hidden">
                 <div className="flex items-center justify-center gap-6 border-b border-white/5 pb-4">
                    <div className="flex items-center gap-2 text-sm font-black text-white tracking-tighter">
                       <Clock size={16} className="text-blue-400" /> {selectedSuggestedDay.duration_target} MIN
                    </div>
                    <div className="flex items-center gap-2 text-sm font-black text-amber-400 italic">
                       <Zap size={16} fill="currentColor" className="text-amber-400" /> {selectedSuggestedDay.load_target} TSS
                    </div>
                 </div>

                 <div className="space-y-3 py-2 max-h-[220px] overflow-y-auto custom-scrollbar px-1">
                   {selectedSuggestedDay.workout_steps && selectedSuggestedDay.workout_steps.length > 0 ? (
                     <GroupedWorkoutStepsList 
                       steps={selectedSuggestedDay.workout_steps}
                       currentFtp={ftp || undefined}
                       originalFtp={weeklyBriefing?.ftp}
                       fontSize="sm"
                     />
                   ) : (
                      <p className="text-[13px] text-slate-400 leading-relaxed text-center px-2 font-medium opacity-80">
                        {selectedSuggestedDay.why}
                      </p>
                   )}
                 </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 w-full">
                <button 
                  onClick={() => setSelectedSuggestedDay(null)}
                  className="w-full py-4 bg-[#1a1c22] rounded-2xl text-[11px] font-black text-slate-300 hover:text-white hover:bg-slate-800 transition-all uppercase tracking-[0.2em] active:scale-95"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}

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
            <h3 className="text-lg font-black text-white italic tracking-tight mb-2">
              wa<span className="text-emerald-400">TT</span>son Update
            </h3>
            <p className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-widest mb-5">Version {APP_VERSION}</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">Athlete Profile Engine</h4>
                <p className="text-slate-400 text-[11px] leading-relaxed">waTTson now analyzes your full history of training to build a custom athlete shape based on your history. Access this in Settings &gt; Athlete Profile.</p>
              </div>
              <div>
                <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">Weekly Planning</h4>
                <p className="text-slate-400 text-[11px] leading-relaxed">Access your full data-driven training schedule through the Weekly Plan button. Dive into workout details and sync them directly to your calendar.</p>
              </div>
            </div>

            <button onClick={() => setShowReleaseNotes(false)} className="w-full py-4 bg-emerald-500 text-slate-950 rounded-[1.4rem] text-[10px] font-black uppercase tracking-[0.15em] hover:bg-emerald-400 transition-colors active:scale-[0.98]">
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Suggestion Detail Modal */}
      {showSuggestionDetail && suggestion && (
        <div className="fixed inset-0 z-[110] bg-[#05070a]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in slide-in-from-bottom-4 duration-300" onClick={() => setShowSuggestionDetail(false)}>
          <div className="glass-card w-full max-w-sm rounded-[3rem] p-6 pb-8 relative border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowSuggestionDetail(false)} className="absolute top-6 right-6 text-slate-600 hover:text-white transition-colors p-2 z-20">
              <X size={20} />
            </button>
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.1)] relative flex-shrink-0">
                <div className="absolute inset-1.5 border border-emerald-500/30 rounded-full" />
                <Trophy size={32} className="text-emerald-400" />
              </div>
              
              <h3 className="text-2xl font-black text-white italic tracking-tighter mb-8 uppercase text-center leading-tight">
                {hasRideToday ? "(TOMORROW'S) " : "(TODAY'S) "} {currentWorkout?.title.toUpperCase()}
              </h3>
              
              <div className="bg-[#0a0c10] p-6 rounded-[2.5rem] border border-white/5 w-full text-left space-y-5 shadow-inner relative overflow-hidden">
                 <div className="flex items-center justify-between border-b border-white/5 pb-4 mx-1">
                    <div className="flex items-center gap-2 text-[14px] font-black text-white tracking-tighter">
                       <Clock size={16} className="text-blue-400" /> {currentWorkout?.duration_minutes} MIN
                    </div>
                    <div className="flex items-center gap-2 text-[14px] font-black text-amber-400 italic">
                       <Zap size={16} fill="currentColor" className="text-amber-400" /> {currentWorkout?.tss || 45} TSS
                    </div>
                 </div>

                 <div className="space-y-4 py-1 max-h-[180px] overflow-y-auto custom-scrollbar px-1">
                   {currentWorkout?.workout_steps && currentWorkout.workout_steps.length > 0 ? (
                     <GroupedWorkoutStepsList 
                       steps={currentWorkout.workout_steps}
                       currentFtp={ftp || undefined}
                       originalFtp={weeklyBriefing?.ftp}
                       fontSize="sm"
                     />
                   ) : (
                      <p className="text-[13px] text-slate-400 leading-relaxed italic text-center px-4 font-medium opacity-80">
                        {suggestion.reasoning}
                      </p>
                   )}
                 </div>
              </div>

              <div className="mt-8 flex flex-col gap-3 w-full">
                <button 
                  onClick={() => setShowSuggestionDetail(false)}
                  className="w-full py-4.5 bg-[#40e0a0] rounded-full text-[12px] font-black text-slate-950 uppercase tracking-[0.2em] active:scale-95 shadow-xl shadow-emerald-400/10"
                >
                  OKAY, COACH
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWeeklyBriefing && creds && (
        <WeeklyBriefingModal 
          activities={activities || []} 
          wellness={wellnessData} 
          creds={creds} 
          userGoal={userGoal} 
          onClose={() => setShowWeeklyBriefing(false)} 
          todaySuggestion={suggestion}
          ftp={ftp || undefined}
          powerCurves={powerCurves}
          planContext={planContext || undefined}
          weeklyBriefing={weeklyBriefing}
          weeklyBriefingError={weeklyBriefingError}
          loadingWeeklyBriefing={loadingWeeklyBriefing}
          planMode={planMode}
          onPlanModeChange={(newMode) => {
            setPlanMode(newMode);
            localStorage.setItem('wattson_plan_mode', newMode);
            fetchWeeklyBriefingData(undefined, true, newMode);
          }}
          onResetPlanContext={() => {
            setPlanContext(null);
            localStorage.removeItem('wattson_plan_context');
            fetchWeeklyBriefingData("", true);
          }}
          onUpdatePlanContext={(directive) => {
            setPlanContext(directive);
            safeSetItem('wattson_plan_context', directive);
            fetchWeeklyBriefingData(directive, true);
          }}
          onForceRefresh={() => {
            fetchWeeklyBriefingData(undefined, true);
          }}
        />
      )}

      <ChangelogModal 
        isOpen={showChangelog}
        onClose={() => setShowChangelog(false)}
        version={APP_VERSION}
        changes={APP_CHANGELOG}
      />

      {/* Floating 3-Dot Options Menu & Button */}
      {!isKeyboardOpen && (
        <>
          {/* Menu Backdrop for clicking outside */}
          <AnimatePresence>
            {showOptionsMenu && (
              <div 
                className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] z-45"
                onClick={() => setShowOptionsMenu(false)}
              />
            )}
          </AnimatePresence>

          {/* Floating Action Menu */}
          <AnimatePresence>
            {showOptionsMenu && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                transition={{ type: 'spring', duration: 0.25 }}
                className="absolute bottom-20 right-6 z-50 bg-slate-950/95 border border-white/10 rounded-[1.8rem] shadow-[0_12px_40px_rgba(0,0,0,0.85)] p-3 min-w-[160px] backdrop-blur-2xl flex flex-col gap-1.5"
              >
                <div className="px-2.5 pb-1.5 mb-1 border-b border-white/5 flex flex-col">
                  <span className="text-[8px] font-black tracking-[0.25em] text-slate-500 uppercase">Navigation</span>
                </div>
                {[
                  { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
                  { id: 'rides', icon: Bike, label: 'Rides' },
                  { id: 'chat', icon: MessageSquare, label: 'waTTson' },
                  { id: 'settings', icon: Settings, label: 'Profile' }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setShowOptionsMenu(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-200 active:scale-95 text-left ${
                        isActive 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' 
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={isActive ? 'text-emerald-400' : 'text-slate-500'} />
                      <span className={`text-[12px] uppercase tracking-wider ${isActive ? 'font-black' : 'font-bold'}`}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Options Trigger Button */}
          <button
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
            className={`absolute bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-[0_8px_24px_rgba(16,185,129,0.3)] hover:bg-emerald-400 active:scale-90 transition-all duration-300`}
            aria-label="Toggle navigation menu"
          >
            {showOptionsMenu ? (
              <X size={24} className="animate-in spin-in-90 duration-200" />
            ) : (
              <MoreHorizontal size={24} className="animate-in fade-in duration-200" />
            )}
          </button>
        </>
      )}
    </div>
  );
};

export default App;
