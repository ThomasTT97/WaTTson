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
  WeeklyBriefing,
  TrainingMode,
  TrainingMethodology,
  ThreeMonthReview
} from './types';
import { fetchActivities, fetchWellness, fetchAthleteId, fetchAthleteProfile, getAnnualPowerCurves, uploadWorkout } from './services/intervalsService';
import { getDailySuggestion, sendChatMessage, getWeeklyBriefing, analyzeUserProfile, analyzeThreeMonthReview } from './services/geminiService';
import { ActivityCard } from './components/ActivityCard';
import { SuggestedWorkoutCard, formatPlannedRideTitle } from './components/SuggestedWorkoutCard';
import { CoachingModal } from './components/CoachingModal';
import { ChangelogModal } from './components/ChangelogModal';
import { PowerDurationGraph } from './components/PowerDurationGraph';
import { StepLabel, getStepPhaseLabel, GroupedWorkoutStepsList, scaleLabelWatts } from './components/StepLabel';
import { CheckCircle } from 'lucide-react';
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
  Edit,
  Trash2,
  Sliders
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
  const [weeklyBriefing, setWeeklyBriefing] = useState<WeeklyBriefing | null>(null);
  const [weeklyBriefingError, setWeeklyBriefingError] = useState<string | null>(null);
  const [loadingWeeklyBriefing, setLoadingWeeklyBriefing] = useState(false);
  const [generatedWeeks, setGeneratedWeeks] = useState<number[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState<{ [week: number]: boolean }>({});
  const [reworkingWeeks, setReworkingWeeks] = useState<number[]>([]);
  const [overallTweakInput, setOverallTweakInput] = useState('');
  const [isPlanTweakExpanded, setIsPlanTweakExpanded] = useState(false);
  const [specificRideTweakInput, setSpecificRideTweakInput] = useState('');

  const [showRequestChangeModal, setShowRequestChangeModal] = useState(false);
  const [showDirectivesSubModal, setShowDirectivesSubModal] = useState(false);
  const [requestChangeInput, setRequestChangeInput] = useState('');
  const [lastAppliedTweak, setLastAppliedTweak] = useState<string | null>(null);
  const [showTweakSuccessNotice, setShowTweakSuccessNotice] = useState(false);
  const [editingDirectiveIdx, setEditingDirectiveIdx] = useState<number | null>(null);
  const [editingDirectiveText, setEditingDirectiveText] = useState('');

  const [planMode, setPlanMode] = useState<'power' | 'hr'>(() => {
    return (localStorage.getItem('wattson_plan_mode') as 'power' | 'hr') || 'power';
  });
  const [trainingMode, setTrainingMode] = useState<TrainingMode>(() => {
    return (localStorage.getItem('wattson_training_mode') as TrainingMode) || 'cycling';
  });
  const [trainingMethodology, setTrainingMethodology] = useState<TrainingMethodology>(() => {
    return (localStorage.getItem('wattson_training_methodology') as TrainingMethodology) || 'polarized';
  });
  const [threeMonthReview, setThreeMonthReview] = useState<ThreeMonthReview | null>(null);
  const [isLoadingThreeMonthReview, setIsLoadingThreeMonthReview] = useState(false);
  const [methodologyTab, setMethodologyTab] = useState<'selection' | 'review'>('selection');
  
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

  const [isOtherFutureExpanded, setIsOtherFutureExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rides' | 'chat' | 'settings'>('dashboard');
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<'main' | 'goal' | 'data' | 'rider_profile' | 'training_method' | 'ftp'>('main');
  const [userProfile, setUserProfile] = useState<UserProfileAnalysis | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const handleFetchThreeMonthReview = async (force: boolean = false) => {
    if (!activities) return;
    setIsLoadingThreeMonthReview(true);
    try {
      const review = await analyzeThreeMonthReview(activities, userGoal, ftp || undefined, trainingMethodology, force);
      setThreeMonthReview(review);
    } catch (err) {
      console.error("Failed to fetch 3-month review:", err);
    } finally {
      setIsLoadingThreeMonthReview(false);
    }
  };
  const [showWorkoutDetail, setShowWorkoutDetail] = useState(false);
  const [syncingWorkout, setSyncingWorkout] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [reasoningPopup, setReasoningPopup] = useState<{title: string, content: string} | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  const isPlanUpdating = loadingWeeklyBriefing || loadingWeeks[1] || false;

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
  const [syncingDayInApp, setSyncingDayInApp] = useState<string | null>(null);
  const [syncSuccessInApp, setSyncSuccessInApp] = useState<string | null>(null);

  const getWeekForDayInApp = (dayObj: any) => {
    if (!weeklyBriefing) return 1;
    const idx = weeklyBriefing.days.indexOf(dayObj);
    if (idx === -1) return 1;
    
    if (weeklyBriefing.days.length === 0) return 1;
    const firstDay = weeklyBriefing.days[0].day;
    const getDayOfWeekFromAbbr = (abbr: string): number => {
      const clean = abbr.trim().substring(0, 3).toLowerCase();
      switch (clean) {
        case 'mon': return 1;
        case 'tue': return 2;
        case 'wed': return 3;
        case 'thu': return 4;
        case 'fri': return 5;
        case 'sat': return 6;
        case 'sun': return 7;
        default: return 1;
      }
    };
    const firstDayOfWeek = getDayOfWeekFromAbbr(firstDay);
    const week1Len = 8 - firstDayOfWeek;
    
    if (idx < week1Len) return 1;
    if (idx < week1Len + 7) return 2;
    if (idx < week1Len + 14) return 3;
    return 4;
  };

  const handleAddTweakFromApp = (newTweakDirective: string, weekIndex?: number) => {
    let currentTweaks: string[] = [];
    if (planContext) {
      currentTweaks = planContext.split(' ; ').filter(Boolean);
    }
    currentTweaks.push(newTweakDirective);
    const newContext = currentTweaks.join(' ; ');
    
    setLastAppliedTweak(newTweakDirective);
    setShowTweakSuccessNotice(false);
    setPlanContext(newContext);
    safeSetItem('wattson_plan_context', newContext);
    setActiveTab('rides');
    
    if (!weekIndex) {
      // Global tweak: clear existing weeks and fetch just week 1 for speed
      setGeneratedWeeks([]);
      setWeeklyBriefing(null);
      fetchWeeklyBriefingData(newContext, true, undefined, undefined, 1);
    } else {
      // Tweak for a specific week
      fetchWeeklyBriefingData(newContext, true, undefined, undefined, weekIndex);
    }
  };

  const handleSyncToIntervalsFromApp = async (day: any, absoluteIndex: number) => {
    if (!creds) return;
    setSyncingDayInApp(day.day);
    try {
      const todayStr = toLocalDateStr(new Date());
      const hasActivityToday = (activities || []).some(a => a.start_date_local.startsWith(todayStr));
      const offset = hasActivityToday ? 1 : 0;

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + absoluteIndex + offset);
      const dateStr = toLocalDateStr(targetDate);
      
      const effOriginalFtp = weeklyBriefing?.ftp || 250;
      const scalingRatio = ftp && effOriginalFtp ? (ftp / effOriginalFtp) : 1;

      const workoutText = day.workout_steps?.map((s: any) => {
        const scaledWatts = s.target_pct 
          ? Math.round(s.target_pct * (ftp || 250)) 
          : (s.target_watts ? Math.round(s.target_watts * scalingRatio) : null);
        
        const scaledLabel = s.target_pct && s.target_pct > 0
          ? scaleLabelWatts(s.label, ftp || 250, effOriginalFtp)
          : (ftp && effOriginalFtp ? scaleLabelWatts(s.label, ftp, effOriginalFtp) : s.label);

        return `- ${scaledLabel || 'Step'} ${s.duration}m ${scaledWatts ? `${scaledWatts}w` : ''}`;
      }).join('\n') || day.why;

      await uploadWorkout(creds, {
        name: day.focus,
        description: day.why,
        date: dateStr,
        moving_time: day.duration_target * 60,
        icu_training_load: day.load_target,
        workout_text: workoutText
      });
      
      setSyncSuccessInApp(day.day);
      setTimeout(() => setSyncSuccessInApp(null), 3000);
    } catch (err) {
      console.error("Sync failed:", err);
      alert("Failed to sync workout to Intervals.icu calendar.");
    } finally {
      setSyncingDayInApp(null);
    }
  };

  const [showSuggestionDetail, setShowSuggestionDetail] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const todayElementRef = useRef<HTMLDivElement>(null);
  const todayAndPastContainerRef = useRef<HTMLDivElement>(null);
  const [hidePlanHeader, setHidePlanHeader] = useState(false);
  
  const [userGoal, setUserGoal] = useState<string>(() => localStorage.getItem('wattson_goal') || 'Improve cycling performance');
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [formKey, setFormKey] = useState(creds?.apiKey || '');
  const [formId, setFormId] = useState(creds?.athleteId || '');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({ 1: true });

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
      setTimeout(() => {
        const active = document.activeElement;
        if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) {
          setIsKeyboardOpen(false);
        }
      }, 100);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    const vv = window.visualViewport;
    const handleViewportResize = () => {
      if (vv) {
        const isMobileKeyboard = window.innerHeight - vv.height > 150;
        if (isMobileKeyboard) {
          setIsKeyboardOpen(true);
        } else {
          const active = document.activeElement;
          if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) {
            setIsKeyboardOpen(false);
          }
        }
      }
    };

    if (vv) {
      vv.addEventListener('resize', handleViewportResize);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      if (vv) {
        vv.removeEventListener('resize', handleViewportResize);
      }
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
        fetchActivities(activeCreds, 365),
        fetchWellness(activeCreds, 365),
        activeCreds.apiKey === 'demo' ? Promise.resolve({ id: '0', icu_ftp: 250 }) : fetchAthleteProfile(activeCreds),
        getAnnualPowerCurves(activeCreds, 3) // Last 3 years
      ]);
      
      console.log("Fetched activities sample:", fetchedActivities?.length > 0 ? fetchedActivities[0] : "empty");
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
                        (!suggestion || suggestion.date !== targetStr || (suggestion.primary?.intensity !== 'Rest' && !suggestion.primary?.workout_steps));

    if (shouldFetch) {
      const fetchNewSuggestion = async () => {
        setLoadingSuggestion(true);
        try {
          const data = await getDailySuggestion(activities!, userGoal, hasRideToday, ftp || undefined, trainingMethodology);
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
  }, [activities, userGoal, hasRideToday, trainingMethodology]);

  const fetchWeeklyBriefingData = useCallback(async (customPlanContext?: string, force = false, mode?: 'power' | 'hr', trainingModeArg?: TrainingMode, weekIndex?: number) => {
    if (!activities || activities.length === 0) return;
    
    if (weekIndex) {
      setLoadingWeeks(prev => ({ ...prev, [weekIndex]: true }));
      setReworkingWeeks(prev => [...prev, weekIndex]);
    } else {
      setLoadingWeeklyBriefing(true);
    }
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
        ? `The primary suggested workout is: "${suggestion.primary?.title}" (${suggestion.primary?.duration_minutes} min, ${suggestion.primary?.intensity} intensity). `
        : "";
        
      let startContext = `CURRENT DATE: ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. `;
      startContext += `Plan MUST start from TODAY, which is ${todayName} (Day 1 = Today). Note: The athlete may have completed a workout today (${hasActivityToday ? '1 or more activities completed today' : 'no activities completed yet today'}). ALWAYS output ALL workouts for Today (both the ones already completed and the ones remaining) so the UI can match them properly. CRITICAL FOR TODAY (DAY 1): If the custom directives or request mention adding, changing, scheduling, or modifying a workout or commute for TODAY, you MUST generate and include that requested workout in Day 1 regardless of whether any workouts were already completed today. If their request or custom directives specify multiple workouts or commutes per day, include all of them for Today in Day 1. When scheduling 2 commutes for a day, the first commute MUST be named "Commute AM" and the second commute MUST be named "Commute PM". `;

      const ctxToUse = customPlanContext !== undefined ? customPlanContext : (planContext || undefined);
      const activeMode = mode || planMode;
      const activeTrainingMode = trainingModeArg || trainingMode;

      const data = await getWeeklyBriefing(activities, wellnessData, userGoal, startContext, ftp || undefined, powerCurves, ctxToUse || undefined, force, activeMode, activeTrainingMode, weekIndex, trainingMethodology);
      setWeeklyBriefing(prev => {
        if (!prev) return data;
        
        if (weekIndex) {
          const now = new Date();
          const startDayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
          const week1Length = 8 - startDayOfWeek;

          const weekRanges = [
            { start: 0, end: week1Length },
            { start: week1Length, end: week1Length + 7 },
            { start: week1Length + 7, end: week1Length + 14 },
            { start: week1Length + 14, end: week1Length + 21 }
          ];

          const range = weekRanges[weekIndex - 1];
          
          // Reconstruct the days array: [days before week] + [new week days] + [days after week]
          const daysBefore = prev.days.slice(0, range.start);
          const daysAfter = prev.days.slice(range.start + (weekRanges[weekIndex - 1].end - weekRanges[weekIndex - 1].start));
          
          const newDays = [...daysBefore, ...data.days, ...daysAfter];
          
          return { ...prev, days: newDays };
        }
        return data;
      });
      if (weekIndex) {
        setGeneratedWeeks(prev => [...new Set([...prev, weekIndex])]);
      } else {
        setGeneratedWeeks([1, 2, 3, 4]);
      }
    } catch (err: any) {
      console.error("Failed to load weekly briefing:", err);
      setWeeklyBriefingError(err.message || String(err));
    } finally {
      if (weekIndex) {
        setLoadingWeeks(prev => ({ ...prev, [weekIndex]: false }));
        setReworkingWeeks(prev => prev.filter(w => w !== weekIndex));
      } else {
        setLoadingWeeklyBriefing(false);
      }
      if (lastAppliedTweak) {
        setShowTweakSuccessNotice(true);
      }
    }
  }, [activities, wellnessData, userGoal, suggestion, ftp, powerCurves, planContext, planMode, trainingMode]);

  useEffect(() => {
    if (activities && activities.length > 0) {
      fetchWeeklyBriefingData(undefined, false, undefined, undefined, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  useEffect(() => {
    // Methodology view: Athlete DNA
    if (activeTab === 'settings' && settingsView === 'rider_profile') {
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
  const mainScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollToTop = () => {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = 0;
      }
    };
    scrollToTop();
    const timer = setTimeout(scrollToTop, 50);
    return () => clearTimeout(timer);
  }, [activeTab]);

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
            setGeneratedWeeks([]);
            setWeeklyBriefing(null);
            fetchWeeklyBriefingData(directive, true, undefined, undefined, 1);
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
      sessionIdx?: number;
    }[] = [];

    const todaySuggestedList: typeof items = [];
    const futureSuggestedList: typeof items = [];

    // 1. Process suggested workouts from weekly briefing
    if (weeklyBriefing && weeklyBriefing.days) {
      const uniqueDayLabels: string[] = [];
      weeklyBriefing.days.forEach(d => {
        if (d.day && !uniqueDayLabels.includes(d.day)) {
          uniqueDayLabels.push(d.day);
        }
      });

      weeklyBriefing.days.forEach((day, idx) => {
        const dayOffset = uniqueDayLabels.indexOf(day.day) !== -1 ? uniqueDayLabels.indexOf(day.day) : idx;
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + dayOffset);
        
        const dateStr = toLocalDateStr(targetDate);
        const isTodayDay = dateStr === todayStr;

        if (isTodayDay) {
          if (day) {
            todaySuggestedList.push({
              type: 'today_suggested',
              key: `suggested-today-${idx}`,
              date: targetDate,
              label: "Today's Target Workout",
              dayData: day,
              absoluteIndex: dayOffset,
              sessionIdx: idx
            });
          }
        } else if (targetDate > today) {
          futureSuggestedList.push({
            type: 'future_suggested',
            key: `suggested-future-${idx}`,
            date: targetDate,
            label: "Suggested Workout",
            dayData: day,
            absoluteIndex: dayOffset,
            sessionIdx: idx
          });
        }
      });
    }

    // 2. Process actual activities
    const safeActivities = activities || [];
    const recognizedTypes = ['Ride', 'VirtualRide', 'Run', 'VirtualRun', 'Swim'];
    const filtered = safeActivities.filter(a => !a.type || recognizedTypes.includes(a.type));

    const todayActualList: typeof items = [];
    const pastList: typeof items = [];

    filtered.forEach(a => {
      const activityDate = new Date(a.start_date_local);
      const dateOnlyStr = a.start_date_local.split('T')[0];
      
      if (dateOnlyStr === todayStr) {
        todayActualList.push({
          type: 'today_actual',
          key: `actual-today-${a.id}`,
          date: activityDate,
          label: "Today's Activity",
          activityData: a
        });
      } else if (activityDate < today) {
        pastList.push({
          type: 'past',
          key: `actual-past-${a.id}`,
          date: activityDate,
          label: "Completed Ride",
          activityData: a
        });
      }
    });

    // Match actual activities today against suggested workouts today so completed rides replace corresponding suggested sessions (e.g. morning commute)
    let remainingTodaySuggested = [...todaySuggestedList];
    const sortedTodayActual = [...todayActualList].sort((a, b) => a.date.getTime() - b.date.getTime());
    const ctxLower = (planContext || '').toLowerCase();
    const hasExplicitTodayRequest = ctxLower.includes('today') || ctxLower.includes('add') || ctxLower.includes('change') || ctxLower.includes('extra') || ctxLower.includes('second') || ctxLower.includes('rest');

    sortedTodayActual.forEach(actual => {
      const nameLower = (actual.activityData?.name || '').toLowerCase();
      
      let matchIdx = -1;
      if (nameLower.includes('commute am') || nameLower.includes('morning')) {
        matchIdx = remainingTodaySuggested.findIndex(s => s.dayData?.focus.toLowerCase().includes('commute am'));
      } else if (nameLower.includes('commute pm') || nameLower.includes('afternoon') || nameLower.includes('evening')) {
        matchIdx = remainingTodaySuggested.findIndex(s => s.dayData?.focus.toLowerCase().includes('commute pm'));
      } else if (nameLower.includes('commute')) {
        matchIdx = remainingTodaySuggested.findIndex(s => s.dayData?.focus.toLowerCase().includes('commute'));
      }
      
      // Fallback: match first remaining suggested ride for today ONLY if there is no explicit request to add/change a ride for today
      if (matchIdx === -1 && !hasExplicitTodayRequest && remainingTodaySuggested.length > 0) {
        matchIdx = 0;
      }
      
      if (matchIdx !== -1) {
        remainingTodaySuggested.splice(matchIdx, 1);
      }
    });

    return [
      ...futureSuggestedList,
      ...remainingTodaySuggested,
      ...todayActualList,
      ...pastList
    ];
  }, [activities, weeklyBriefing]);

  const sortedTimelineItems = useMemo(() => {
    return [...timelineItems].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [timelineItems]);

  useEffect(() => {
    if (activeTab !== 'rides') {
      setHidePlanHeader(false);
      return;
    }
    
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const element = todayAndPastContainerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHidePlanHeader(entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: "-20px 0px 0px 0px" // Trigger slightly before it hits the very top edge
      }
    );

    observer.observe(element);
    return () => {
      observer.unobserve(element);
    };
  }, [activeTab, sortedTimelineItems]);

  const nextRideFromPlan = useMemo(() => {
    const upcoming = timelineItems.filter(i => (i.type === 'today_suggested' || i.type === 'future_suggested') && i.dayData);
    const sortedUpcoming = [...upcoming].sort((a, b) => {
      // First by date
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      // If same date, preserve relative index in day
      return (a.absoluteIndex ?? 0) - (b.absoluteIndex ?? 0);
    });
    
    if (sortedUpcoming.length === 0) return null;
    
    return {
      day: sortedUpcoming[0].dayData!,
      date: sortedUpcoming[0].date,
      isRest: false, // We already filtered out rests when creating timelineItems for suggested rides
      absoluteIndex: sortedUpcoming[0].absoluteIndex ?? 0
    };
  }, [timelineItems]);



  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatLoading, activeTab, isKeyboardOpen]);

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
            type="text" 
            placeholder="Athlete ID (e.g. i12345)" 
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white text-base outline-none focus:border-emerald-500/50 transition-colors" 
            value={formId}
            onChange={(e) => {
              setFormId(e.target.value);
              if (syncError) setSyncError(null);
            }}
          />
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
        ref={mainScrollRef}
        className={`flex-1 hide-scrollbar scroll-smooth flex flex-col relative ${activeTab === 'chat' ? 'p-0 overflow-hidden' : 'px-4 pt-4 pb-28 overflow-y-auto'}`}
      >

        {activeTab === 'dashboard' && (
          <div className="flex flex-col space-y-4 animate-in fade-in duration-500 pb-2">
            
            {/* Section 1: WHY - The Goal */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-1">
                <span className="px-2.5 py-0.5 bg-emerald-500 text-slate-950 text-[9.5px] font-black uppercase tracking-[0.15em] rounded-lg shrink-0">
                  Why
                </span>
                <span className="text-[11px] font-black text-slate-200 uppercase tracking-wider">
                  The Goal
                </span>
              </div>
              
              <div className="glass-card px-3 py-2.5 rounded-2xl border border-white/10 flex items-center justify-between gap-2 bg-slate-900/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <Target size={13} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs font-black text-white italic tracking-tight truncate">
                      "{userGoal || 'Define your primary training goal'}"
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => setShowGoalEditor(true)}
                  className="p-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all shrink-0 active:scale-95"
                  title="Edit Goal"
                >
                  <Edit size={11} />
                </button>
              </div>
            </div>

            {/* Section 2: HOW - Next Ride */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center gap-2 px-1">
                <span className="px-2.5 py-0.5 bg-blue-500 text-slate-950 text-[9.5px] font-black uppercase tracking-[0.15em] rounded-lg shrink-0">
                  How
                </span>
                <span className="text-[11px] font-black text-slate-200 uppercase tracking-wider">
                  Next Ride
                </span>
              </div>

              <div className="space-y-2">
                {/* Visual indicator when plan is updating or updated */}
                {isPlanUpdating && (
                  <div className="glass-card p-3 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 animate-pulse flex items-center gap-3 shadow-lg">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <Loader2 size={16} className="animate-spin text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          Updating Plan
                        </span>
                        {lastAppliedTweak && (
                          <span className="text-[8px] font-bold text-slate-400 truncate">
                            "{lastAppliedTweak}"
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-white truncate mt-0.5">
                        Recalibrating workouts to match requested change...
                      </p>
                    </div>
                  </div>
                )}

                {!isPlanUpdating && showTweakSuccessNotice && lastAppliedTweak && (
                  <div className="glass-card p-2.5 px-3 rounded-2xl border border-emerald-500/30 bg-slate-900/80 flex items-center justify-between gap-2 shadow-md animate-in fade-in duration-300">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Check size={12} className="stroke-[3]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 block leading-none">Plan Updated</span>
                        <p className="text-[10.5px] font-extrabold text-white truncate mt-0.5">
                          "{lastAppliedTweak}"
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowTweakSuccessNotice(false)}
                      className="p-1 text-slate-500 hover:text-white shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Next Ride Card */}
                {nextRideFromPlan ? (() => {
                  const isTodayRide = nextRideFromPlan.date.toDateString() === new Date().toDateString();
                  return (
                    <SuggestedWorkoutCard 
                      day={nextRideFromPlan.day}
                      absoluteIndex={nextRideFromPlan.absoluteIndex ?? 0}
                      onClick={(day) => {
                        setSelectedSuggestedDay(day);
                      }}
                      isToday={isTodayRide}
                    />
                  );
                })() : null}
              </div>
            </div>

            {/* Section 3: RESULTS - Last Ride & Stats */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center gap-2 px-1">
                <span className="px-2.5 py-0.5 bg-emerald-500 text-slate-950 text-[9.5px] font-black uppercase tracking-[0.15em] rounded-lg shrink-0">
                  Results
                </span>
                <span className="text-[11px] font-black text-slate-200 uppercase tracking-wider">
                  Last Ride & Stats
                </span>
              </div>

              <div className="space-y-2">
                {/* Last Activity Card */}
                {(() => {
                  const lastActivity = activities && activities.length > 0 
                    ? [...activities].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local))[0] 
                    : null;
                  
                  if (!lastActivity) return null;
                  const isLastActivityToday = new Date(lastActivity.start_date_local).toDateString() === new Date().toDateString();

                  return (
                    <ActivityCard 
                      activity={lastActivity}
                      onClick={(act) => setSelectedActivity(act)}
                      isToday={isLastActivityToday}
                    />
                  );
                })()}

                {/* 5-Metric Stats Grid (2 rows) */}
                <div className="flex flex-col space-y-1.5">
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="glass-card p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center bg-slate-900/40 text-center shadow-sm">
                      <span className="text-[7px] font-black uppercase text-slate-400 tracking-wider">Fitness</span>
                      <span className="text-[13px] font-black italic text-blue-400 font-mono mt-0.5">{stats.ctl}</span>
                    </div>
                    <div className="glass-card p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center bg-slate-900/40 text-center shadow-sm">
                      <span className="text-[7px] font-black uppercase text-slate-400 tracking-wider">Fatigue</span>
                      <span className="text-[13px] font-black italic text-amber-400 font-mono mt-0.5">{stats.atl}</span>
                    </div>
                    <div className="glass-card p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center bg-slate-900/40 text-center shadow-sm">
                      <span className="text-[7px] font-black uppercase text-slate-400 tracking-wider">Form</span>
                      <span className={`text-[13px] font-black italic font-mono mt-0.5 ${stats.form >= 5 ? 'text-emerald-400' : stats.form < -25 ? 'text-rose-400' : stats.form < -10 ? 'text-amber-400' : 'text-slate-200'}`}>
                        {stats.form > 0 ? `+${stats.form}` : stats.form}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="glass-card p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center bg-slate-900/40 text-center shadow-sm">
                      <span className="text-[7px] font-black uppercase text-slate-400 tracking-wider">7D Time</span>
                      <span className="text-[13px] font-black italic text-white font-mono mt-0.5">{stats.total7DayTime}h</span>
                    </div>
                    <div className="glass-card p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center bg-slate-900/40 text-center shadow-sm">
                      <span className="text-[7px] font-black uppercase text-slate-400 tracking-wider">7D Load</span>
                      <span className="text-[13px] font-black italic text-emerald-400 font-mono mt-0.5">{stats.total7DayLoad}</span>
                    </div>
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
                    const rawTodayItems = sortedTimelineItems.filter(i => i.type === 'today_suggested' || i.type === 'today_actual');
                    
                    const compareSameDayForTimeline = (a: any, b: any) => {
                      const fA = (a.dayData?.focus || '').toLowerCase();
                      const fB = (b.dayData?.focus || '').toLowerCase();
                      
                      const isAPM = fA.includes('pm') || fA.includes('afternoon') || fA.includes('evening');
                      const isAAM = fA.includes('am') || fA.includes('morning');
                      const isBPM = fB.includes('pm') || fB.includes('afternoon') || fB.includes('evening');
                      const isBAM = fB.includes('am') || fB.includes('morning');

                      if (isAPM && isBAM) return -1;
                      if (isBPM && isAAM) return 1;

                      return (b.sessionIdx ?? b.absoluteIndex ?? 0) - (a.sessionIdx ?? a.absoluteIndex ?? 0);
                    };

                    const todayItems = [...rawTodayItems].sort((a, b) => {
                      if (a.type === 'today_suggested' && b.type === 'today_actual') return -1;
                      if (a.type === 'today_actual' && b.type === 'today_suggested') return 1;
                      if (a.type === 'today_suggested' && b.type === 'today_suggested') {
                        return compareSameDayForTimeline(a, b);
                      }
                      if (a.type === 'today_actual' && b.type === 'today_actual') {
                        return b.date.getTime() - a.date.getTime();
                      }
                      return 0;
                    });
                    const pastItems = sortedTimelineItems.filter(i => i.type === 'past');
                    
                    // Filter future items for 1 week forward (Week 1)
                    const week1FutureItems = futureItems.filter(item => !item.dayData || getWeekForDayInApp(item.dayData) === 1);
                    const week1TotalTss = week1FutureItems.reduce((acc, i) => acc + (i.dayData?.load_target || 0), 0);
                    const week1RideCount = week1FutureItems.filter(i => i.dayData && !i.dayData.focus.toLowerCase().includes('rest')).length;

                    return (
                      <>
                        {/* Integrated Training Plan Section */}
                        <div className="flex flex-col space-y-3 relative">
                          {/* Planned Upcoming Sessions (1 Week Forward, Above Today) */}
                          {(week1FutureItems.length > 0 || isPlanUpdating) && (() => {
                            const chronFutureItems = [...week1FutureItems].sort((a, b) => a.date.getTime() - b.date.getTime());
                            const todayObj = new Date();
                            todayObj.setHours(0, 0, 0, 0);
                            const tomorrowDate = new Date(todayObj);
                            tomorrowDate.setDate(todayObj.getDate() + 1);
                            const tomorrowDateStr = toLocalDateStr(tomorrowDate);

                            // All items scheduled for tomorrow
                            let tomorrowItems = chronFutureItems.filter(i => toLocalDateStr(i.date) === tomorrowDateStr);

                            // Fallback: If no items strictly on tomorrow, take all items on the earliest upcoming date
                            if (tomorrowItems.length === 0 && chronFutureItems.length > 0) {
                              const nextDateStr = toLocalDateStr(chronFutureItems[0].date);
                              tomorrowItems = chronFutureItems.filter(i => toLocalDateStr(i.date) === nextDateStr);
                            }

                            tomorrowItems.sort((a, b) => {
                              const dDiff = b.date.getTime() - a.date.getTime();
                              if (dDiff !== 0) return dDiff;
                              return compareSameDayForTimeline(a, b);
                            });

                            const tomorrowKeys = new Set(tomorrowItems.map(i => i.key));

                            // Other future items are all future items NOT in tomorrowItems, sorted descending by date
                            const otherFutureItems = chronFutureItems
                              .filter(i => !tomorrowKeys.has(i.key))
                              .sort((a, b) => {
                                const dDiff = b.date.getTime() - a.date.getTime();
                                if (dDiff !== 0) return dDiff;
                                return compareSameDayForTimeline(a, b);
                              });

                            const displayedTomorrowItems = isOtherFutureExpanded
                              ? tomorrowItems
                              : tomorrowItems.slice(-1);

                            return (
                              <div className="flex flex-col space-y-2.5 pt-1">
                                <div className="flex items-center justify-between gap-2 px-1">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => setIsOtherFutureExpanded(!isOtherFutureExpanded)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#12141c] hover:bg-blue-900/20 border border-blue-500/30 text-blue-400 text-[9.5px] font-black uppercase tracking-[0.2em] rounded-lg shrink-0 whitespace-nowrap transition-colors cursor-pointer"
                                    >
                                      PLANNED RIDES
                                      {otherFutureItems.length > 0 && (
                                        isOtherFutureExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />
                                      )}
                                    </button>
                                  </div>

                                  <button
                                    onClick={() => {
                                      setRequestChangeInput('');
                                      setShowRequestChangeModal(true);
                                    }}
                                    className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/30 text-emerald-300 text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                                  >
                                    <Sparkles size={11} className="text-emerald-400" />
                                    <span>Request Change</span>
                                  </button>
                                </div>

                                <div className="space-y-2 pt-0.5">
                                  {/* Loading state indicator when plan is updating */}
                                  {isPlanUpdating && (
                                    <div className="glass-card p-3 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 animate-pulse flex items-center gap-3 shadow-lg my-1">
                                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                                        <Loader2 size={16} className="animate-spin text-emerald-400" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                            Updating Plan
                                          </span>
                                          {lastAppliedTweak && (
                                            <span className="text-[8px] font-bold text-slate-400 truncate">
                                              "{lastAppliedTweak}"
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[11px] font-bold text-white truncate mt-0.5">
                                          Recalibrating workouts to match requested change...
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Success notification banner after plan completes update */}
                                  {!isPlanUpdating && showTweakSuccessNotice && lastAppliedTweak && (
                                    <div className="glass-card p-2.5 px-3 rounded-2xl border border-emerald-500/30 bg-slate-900/80 flex items-center justify-between gap-2 shadow-md animate-in fade-in duration-300 my-1">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                          <Check size={12} className="stroke-[3]" />
                                        </div>
                                        <div className="min-w-0">
                                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 block leading-none">Plan Updated</span>
                                          <p className="text-[10.5px] font-extrabold text-white truncate mt-0.5">
                                            "{lastAppliedTweak}"
                                          </p>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => setShowTweakSuccessNotice(false)}
                                        className="p-1 text-slate-500 hover:text-white shrink-0"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  )}
                                   {/* Other Future Rides (Collapsible - Placed on Top for chronological order down to today) */}
                                  {otherFutureItems.length > 0 && isOtherFutureExpanded && (
                                    <div className="flex flex-col space-y-2">
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-2 overflow-hidden"
                                      >
                                        {otherFutureItems.map((item) => (
                                          <React.Fragment key={item.key}>
                                            {item.dayData && (
                                              <SuggestedWorkoutCard 
                                                day={item.dayData}
                                                absoluteIndex={item.absoluteIndex ?? 0}
                                                onClick={(day) => setSelectedSuggestedDay(day)}
                                                isToday={false}
                                              />
                                            )}
                                          </React.Fragment>
                                        ))}
                                      </motion.div>
                                    </div>
                                  )}

                                  {/* Tomorrow Section (Immediately above Today) */}
                                  {displayedTomorrowItems.length > 0 && (
                                    <div className="flex flex-col space-y-2 pt-1">
                                      <div className="flex items-center gap-2 px-1">
                                        <span className="inline-block px-2.5 py-0.5 bg-[#12141c] border border-blue-500/40 text-blue-400 text-[9.5px] font-black uppercase tracking-[0.2em] rounded-lg shrink-0 whitespace-nowrap shadow-sm">
                                          {toLocalDateStr(displayedTomorrowItems[0].date) === tomorrowDateStr ? "TOMORROW" : "NEXT RIDE"}
                                        </span>
                                        <div className="flex-1 h-px bg-gradient-to-r from-blue-500/30 to-transparent" />
                                      </div>
                                      {displayedTomorrowItems.map((item) => (
                                        <React.Fragment key={item.key}>
                                          {item.dayData && (
                                            <SuggestedWorkoutCard 
                                              day={item.dayData}
                                              absoluteIndex={item.absoluteIndex ?? 0}
                                              onClick={(day) => setSelectedSuggestedDay(day)}
                                              isToday={false}
                                            />
                                          )}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Today Section */}
                          {todayItems.length > 0 && (
                            <div className="flex flex-col space-y-2.5 pt-2">
                              <div 
                                className="flex items-center gap-2.5 px-1 scroll-mt-14"
                                ref={todayElementRef}
                              >
                                <span className="inline-block px-2.5 py-0.5 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse">
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
                                        isToday={true}
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
                        </div>

                        {/* Past Section / Training History */}
                        <div ref={todayAndPastContainerRef} className="flex flex-col space-y-3.5 pt-3">
                          {pastItems.length > 0 && (
                            <div className="flex flex-col space-y-3 pt-2">
                              <div className="flex items-center gap-3 px-1 pb-1">
                                <span className="inline-block px-2.5 py-0.5 bg-[#12141c] border border-white/10 text-slate-400 text-[9.5px] font-black uppercase tracking-[0.2em] rounded-lg">
                                  Training History
                                </span>
                                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
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
                                      <div className="flex items-center gap-3 px-1 pt-3 pb-1">
                                        <span className="inline-block px-2.5 py-0.5 bg-[#12141c] border border-white/10 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] rounded-lg">
                                          {monthLabel}
                                        </span>
                                        <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
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
                        </div>
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

             <div className={`flex-none px-4 pt-2.5 bg-[#05070a]/95 backdrop-blur-xl border-t border-white/10 z-20 flex flex-col gap-2 transition-all duration-300 ${isKeyboardOpen ? 'pb-3' : 'pb-[88px]'}`}>

               {/* Input Field & Send Button */}
               <div className="flex gap-2 items-center">
                 <textarea
                   value={chatInput}
                   onChange={(e) => setChatInput(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && !e.shiftKey) {
                       e.preventDefault();
                       if (chatInput.trim() && !isChatLoading) {
                         handleSendMessage(chatInput);
                         setChatInput("");
                       }
                     }
                   }}
                   onFocus={() => {
                     setIsKeyboardOpen(true);
                     setTimeout(() => {
                       chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                     }, 150);
                   }}
                   placeholder="Ask waTTson anything... (Enter to send)"
                   rows={1}
                   className="flex-1 bg-[#0a0d14] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3.5 py-2 text-[12px] text-white placeholder-slate-500 focus:outline-none font-medium resize-none max-h-24 transition-all"
                 />
                 <button 
                   onClick={() => {
                     if (chatInput.trim() && !isChatLoading) {
                       handleSendMessage(chatInput);
                       setChatInput("");
                     }
                   }}
                   disabled={!chatInput.trim() || isChatLoading}
                   className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all shrink-0 active:scale-95 flex items-center justify-center gap-1 h-[36px]"
                 >
                   <span>Send</span>
                   <Send size={11} className="stroke-[3]" />
                 </button>
               </div>
             </div>
          </div>
        )}

         {activeTab === 'settings' && (
          <div className="flex flex-col animate-in slide-in-from-right-2 duration-400">

             <div className="flex flex-col pb-2 px-1">
               {settingsView === 'main' && (
                 <>
                   <div className="flex flex-col gap-2">
                     <button 
                       onClick={() => setSettingsView('rider_profile')}
                       className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-amber-500/10 shadow-sm"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400"><User size={20} /></div>
                         <div className="text-left">
                           <p className="text-[11px] font-black text-white uppercase tracking-widest">Your Rider Profile</p>
                           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Assessment</p>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-600 group-hover:text-amber-400 transition-colors" />
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
                       onClick={() => {
                         setSettingsView('training_method');
                         if (!threeMonthReview && !isLoadingThreeMonthReview && activities) {
                           handleFetchThreeMonthReview();
                         }
                       }}
                       className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-cyan-500/10 shadow-sm"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0"><Sliders size={20} /></div>
                         <div className="text-left">
                           <p className="text-[11px] font-black text-white uppercase tracking-widest">Training Method & Mode</p>
                           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                             {trainingMethodology.toUpperCase()} • {trainingMode === 'cycling' ? 'CYCLING' : trainingMode === 'triathlon' ? 'TRIATHLON' : 'RUNNING'}
                           </p>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-600 group-hover:text-cyan-400 transition-colors" />
                     </button>
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
                 <div className="glass-card p-5 rounded-[1.8rem] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                   {/* Header with Integrated Back Button */}
                   <div className="flex items-center gap-3.5 pb-4 border-b border-white/5">
                     <button 
                       onClick={() => setSettingsView('main')}
                       className="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-all shrink-0 hover:text-emerald-400 hover:border-emerald-500/20"
                     >
                       <ChevronLeft size={18} />
                     </button>
                     
                     <div className="flex-1 min-w-0">
                       <h3 className="text-lg font-black text-emerald-400 italic uppercase tracking-tight leading-tight">
                         Your Target Goal
                       </h3>
                       <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                         Coaching Target & Ambition
                       </p>
                     </div>
                   </div>
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
                  <div className="glass-card p-5 rounded-[1.8rem] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* Header with Integrated Back Button */}
                    <div className="flex items-center gap-3.5 pb-4 border-b border-white/5">
                      <button 
                        onClick={() => setSettingsView('main')}
                        className="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-all shrink-0 hover:text-orange-400 hover:border-orange-500/20"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-black text-orange-400 italic uppercase tracking-tight leading-tight">
                          Your FTP
                        </h3>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                          Functional Threshold Power (FTP)
                        </p>
                      </div>
                    </div>
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



               {settingsView === 'rider_profile' && (
                 <div className="glass-card p-5 rounded-[1.8rem] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {isLoadingProfile ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="w-10 h-10 rounded-full border-t-2 border-emerald-500 animate-spin mb-4" />
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Generating Profile...</p>
                        <p className="text-[9px] text-slate-500 font-medium mt-1">Analyzing power curve and last 30 activities</p>
                      </div>
                    ) : userProfile ? (
                      <div className="space-y-6">
                        {/* Rider Type Header with Integrated Back Button */}
                        <div className="flex items-center gap-3.5 pb-4 border-b border-white/5">
                          <button 
                            onClick={() => setSettingsView('main')}
                            className="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-all shrink-0 hover:text-emerald-400 hover:border-emerald-500/20"
                          >
                            <ChevronLeft size={18} />
                          </button>
                          
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-black text-emerald-400 italic uppercase tracking-tight leading-tight">
                              {userProfile.athlete_type}
                            </h3>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                              Rider Profile Assessment
                            </p>
                          </div>
                        </div>

                        {/* Power-Duration Graph */}
                        <PowerDurationGraph powerCurves={powerCurves} athleteType={userProfile.athlete_type} ftp={ftp} />

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

               {settingsView === 'training_method' && (
                 <div className="glass-card p-5 rounded-[1.8rem] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* Header with Integrated Back Button */}
                    <div className="flex items-center gap-3.5 pb-4 border-b border-white/5">
                      <button 
                        onClick={() => setSettingsView('main')}
                        className="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-all shrink-0 hover:text-cyan-400 hover:border-cyan-500/20"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-black text-cyan-400 italic uppercase tracking-tight leading-tight">
                          Training Engine
                        </h3>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                          Methodology & Mode Selection
                        </p>
                      </div>
                    </div>

                    {/* View Switcher Header */}
                   <div className="flex bg-slate-950/60 p-1.5 rounded-2xl border border-white/5">
                     <button
                       onClick={() => setMethodologyTab('selection')}
                       className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                         methodologyTab === 'selection' 
                           ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold' 
                           : 'text-slate-400 hover:text-white font-bold'
                       }`}
                     >
                       Setup Engine
                     </button>
                     <button
                       onClick={() => {
                         setMethodologyTab('review');
                         if (!threeMonthReview && !isLoadingThreeMonthReview && activities) {
                           handleFetchThreeMonthReview();
                         }
                       }}
                       className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                         methodologyTab === 'review' 
                           ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold' 
                           : 'text-slate-400 hover:text-white font-bold'
                       }`}
                     >
                       90-Day Review
                     </button>
                   </div>

                   {/* Tab 1: Setup (Methodology & Mode) */}
                    {methodologyTab === 'selection' && (
                      <div className="space-y-6">
                        {/* Training Mode Section */}
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Training Mode</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
                              Target discipline determines your structured session types
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {(['cycling', 'triathlon', 'running'] as TrainingMode[]).map((mode) => {
                              const isSelected = trainingMode === mode;
                              let label = 'Cycling';
                              let sublabel = 'CYC';
                              let IconComponent = Bike;

                              if (mode === 'triathlon') {
                                label = 'Triathlon';
                                sublabel = 'TRI';
                                IconComponent = Trophy;
                              } else if (mode === 'running') {
                                label = 'Running';
                                sublabel = 'RUN';
                                IconComponent = ActivityIcon;
                              }

                              return (
                                <button
                                  key={mode}
                                  onClick={() => {
                                    setTrainingMode(mode);
                                    localStorage.setItem('wattson_training_mode', mode);
                                    setGeneratedWeeks([]);
                                    setWeeklyBriefing(null);
                                    fetchWeeklyBriefingData(undefined, true, undefined, mode, 1);
                                  }}
                                  className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all active:scale-[0.95] ${
                                    isSelected
                                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                                      : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200'
                                  }`}
                                >
                                  <IconComponent size={18} className="mb-1.5" />
                                  <span className="text-[10px] font-black uppercase tracking-wider">{sublabel}</span>
                                  <span className="text-[8px] font-bold opacity-60 uppercase mt-0.5">{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Workout Methodology Section */}
                        <div className="space-y-3 pt-4 border-t border-white/5">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Workout Methodology</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
                              Distribution style used for power zone generation
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {[
                              {
                                id: 'polarized' as TrainingMethodology,
                                title: 'Polarized (80 / 20)',
                                tagline: 'High VO2max & Endurance Focus',
                                description: '80% low intensity (Zone 1/2) and 20% high intensity (Zone 5/6). Avoids mid-intensity threshold fatigue.'
                              },
                              {
                                id: 'pyramidal' as TrainingMethodology,
                                title: 'Pyramidal Distribution',
                                tagline: 'Classic Aerobic tempo & Threshold',
                                description: '70% Zone 1/2, 20% Zone 3/4 Tempo/SweetSpot, 10% Zone 5+ High Intensity. Builds robust aerobic foundation.'
                              },
                              {
                                id: 'norwegian' as TrainingMethodology,
                                title: 'Norwegian Lactate Method',
                                tagline: 'Sub-Threshold Volume & Control',
                                description: 'High volume sub-threshold intervals strictly controlled below LT2/3.8mmol lactate. Maximizes time at high aerobic power.'
                              }
                            ].map((method) => {
                              const isSelected = trainingMethodology === method.id;
                              return (
                                <button
                                  key={method.id}
                                  onClick={() => {
                                    setTrainingMethodology(method.id);
                                    localStorage.setItem('wattson_training_methodology', method.id);
                                    setGeneratedWeeks([]);
                                    setWeeklyBriefing(null);
                                    setSuggestion(null);
                                    fetchWeeklyBriefingData(undefined, true, undefined, undefined, 1);
                                  }}
                                  className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.99] ${
                                    isSelected
                                      ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.12)]'
                                      : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-black text-white uppercase tracking-wider">
                                      {method.title}
                                    </span>
                                    {isSelected && (
                                      <span className="px-2 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[8px] font-extrabold uppercase tracking-widest flex items-center gap-1">
                                        <Check size={9} className="stroke-[3]" /> Active
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest mb-1">{method.tagline}</p>
                                  <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">{method.description}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Recalculation Alert */}
                        <div className="p-3.5 bg-cyan-500/5 border border-cyan-500/10 rounded-2xl text-[9px] text-cyan-400 font-bold leading-relaxed flex items-start gap-2.5">
                          <Info size={14} className="stroke-[3] shrink-0 mt-0.5" />
                          <span>
                            Adjusting either your training mode or workout methodology will trigger waTTson to immediately rebuild your custom daily suggestion and 4-week calendar.
                          </span>
                        </div>
                      </div>
                    )}                   {/* Tab 2: 3-Month Training Review */}
                   {methodologyTab === 'review' && (
                     <div className="space-y-4">
                       {isLoadingThreeMonthReview ? (
                         <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                           <Loader2 size={28} className="text-cyan-400 animate-spin" />
                           <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Analyzing 90-Day Training Data...</p>
                           <p className="text-[9px] text-slate-500 font-medium">Evaluating TSS, volume trends, and goal progression with Gemini</p>
                         </div>
                       ) : threeMonthReview ? (
                         <div className="space-y-4">
                           {/* Status Badge & Title */}
                           <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-3">
                             <div className="flex items-center justify-between">
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">90-Day Progress Evaluation</span>
                               <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                                 threeMonthReview.status === 'on_track' 
                                                                       ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                   : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                               }`}>
                                 {threeMonthReview.status === 'on_track' ? (
                                   <><Check size={12} className="stroke-[3]" /> Contributing to Goal</>
                                 ) : (
                                   <><Info size={12} className="stroke-[3]" /> Needs Adjustment</>
                                 )}
                               </span>
                             </div>

                             {/* Stats Summary Bar */}
                             {threeMonthReview.period_stats && (
                               <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center">
                                 <div className="bg-white/[0.02] p-2 rounded-xl">
                                   <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">90d TSS</p>
                                   <p className="text-[12px] font-black text-white mt-0.5">{threeMonthReview.period_stats.total_tss}</p>
                                 </div>
                                 <div className="bg-white/[0.02] p-2 rounded-xl">
                                   <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Hours</p>
                                   <p className="text-[12px] font-black text-white mt-0.5">{threeMonthReview.period_stats.total_hours}h</p>
                                 </div>
                                 <div className="bg-white/[0.02] p-2 rounded-xl">
                                   <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Weekly Avg</p>
                                   <p className="text-[12px] font-black text-white mt-0.5">{threeMonthReview.period_stats.avg_tss_per_week} tss/wk</p>
                                 </div>
                               </div>
                             )}
                           </div>

                           {/* Conclusion Narrative */}
                           <div className="space-y-2">
                             <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Executive Conclusion</h4>
                             <p className="text-[11px] text-slate-200 leading-relaxed font-medium bg-white/[0.01] border border-white/[0.04] p-3.5 rounded-2xl italic">
                               "{threeMonthReview.headline}"
                             </p>
                           </div>

                           {/* Contributing Factors & Changes */}
                           <div className="space-y-3">
                             <div className="relative pl-3 space-y-1.5">
                               <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500/40 rounded-full"></div>
                               <h4 className="text-[10px] font-black text-white uppercase tracking-widest">What's Contributing</h4>
                               <ul className="text-[10px] text-slate-300 font-medium space-y-1">
                                 {threeMonthReview.contributing_to_goal && [threeMonthReview.contributing_to_goal].map((factor: string, i: number) => (
                                   <li key={i} className="flex items-start gap-1.5">
                                     <span className="text-emerald-400 font-bold">•</span>
                                     <span>{factor}</span>
                                   </li>
                                 ))}
                               </ul>
                             </div>

                             <div className="relative pl-3 space-y-1.5">
                               <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500/40 rounded-full"></div>
                               <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Recommended Changes</h4>
                               <ul className="text-[10px] text-slate-300 font-medium space-y-1">
                                 {threeMonthReview.needed_changes?.map((change: string, i: number) => (
                                   <li key={i} className="flex items-start gap-1.5">
                                     <span className="text-amber-400 font-bold">•</span>
                                     <span>{change}</span>
                                   </li>
                                 ))}
                               </ul>
                             </div>
                           </div>

                           <button
                             onClick={() => handleFetchThreeMonthReview(true)}
                             className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/5 active:scale-95"
                           >
                             <RefreshCw size={12} /> Refresh 90-Day Analysis
                           </button>
                         </div>
                       ) : (
                         <div className="text-center py-8 space-y-3" id="review-empty">
                           <p className="text-[11px] text-slate-400 font-medium" id="p-review">No 3-month review generated yet.</p>
                           <button
                             onClick={() => handleFetchThreeMonthReview(true)}
                             id="btn-first" className="px-4 py-2 bg-cyan-500 text-slate-950 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md hover:bg-cyan-400 transition-all active:scale-95"
                           >
                             Run 3-Month Analysis
                           </button>
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               )}
                           {/*
                           <button
                             onClick={() => handleFetchThreeMonthReview(true)}
                             className="px-4 py-2 bg-cyan-500 text-slate-950 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md hover:bg-cyan-400 transition-all active:scale-95"
                           >
                             Run 3-Month Analysis
                           </button>
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               )}
                      </div>
                    )}
                 </div>
               )}
             </div>
          </div>
        )}
      </div>

       */}
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
              setGeneratedWeeks([]);
              setWeeklyBriefing(null);
              fetchWeeklyBriefingData(undefined, true, undefined, undefined, 1);
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
          const targetDate = new Date(today);
          if (index !== -1) {
            targetDate.setDate(today.getDate() + index);
          }
          const weekday = targetDate.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
          const dayNum = targetDate.getDate();

          const weekIdx = getWeekForDayInApp(selectedSuggestedDay);
          const isReworking = reworkingWeeks.includes(weekIdx) || loadingWeeks[weekIdx];

          const isSimpleRide = (() => {
            const f = (selectedSuggestedDay.focus || '').toLowerCase();
            const i = (selectedSuggestedDay.intensity || '').toLowerCase();
            return f.includes('recovery') || f.includes('endurance') || f.includes('easy') || f.includes('rest') || i === 'easy' || i === 'rest';
          })();

          const simpleTargetWatts = (() => {
            if (selectedSuggestedDay.workout_steps && selectedSuggestedDay.workout_steps.length > 0) {
              const stepWithPower = selectedSuggestedDay.workout_steps.find((s: any) => (s.target_watts && s.target_watts > 0) || (s.target_pct && s.target_pct > 0));
              if (stepWithPower) {
                if (stepWithPower.target_watts && stepWithPower.target_watts > 0) return Math.round(stepWithPower.target_watts);
                if (stepWithPower.target_pct && stepWithPower.target_pct > 0 && (ftp || 250)) return Math.round(stepWithPower.target_pct * (ftp || 250));
              }
            }
            if (selectedSuggestedDay.load_target > 0 && selectedSuggestedDay.duration_target > 0 && (ftp || 250)) {
              const est = Math.round(Math.sqrt((selectedSuggestedDay.load_target * 3600 * Math.pow(ftp || 250, 2)) / (selectedSuggestedDay.duration_target * 60 * 100)));
              if (est > 40 && est < 500) return est;
            }
            return Math.round((ftp || 250) * 0.65);
          })();

          return (
            <div className="fixed inset-0 z-[220] bg-[#05070a]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedSuggestedDay(null)}>
              <div className="bg-slate-950/80 w-full max-w-sm rounded-[2.5rem] p-6 relative border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelectedSuggestedDay(null)} className="absolute top-5 right-5 text-slate-500 hover:text-white transition-colors p-2 z-20 bg-black/40 rounded-full">
                  <X size={18} />
                </button>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-xl bg-slate-900/50 flex flex-col items-center justify-center shrink-0 border border-white/5 shadow-inner mb-4">
                    <span className="text-[7.5px] font-black text-slate-500 uppercase leading-none mb-0.5 tracking-tighter">{weekday}</span>
                    <span className="text-base font-black text-white italic leading-none">{dayNum}</span>
                  </div>
                  
                  <h3 className="text-lg font-black text-white italic tracking-tighter mb-5 uppercase text-center leading-tight px-4">
                    {formatPlannedRideTitle(selectedSuggestedDay.focus)}
                  </h3>
                  
                  {isReworking ? (
                    <div className="w-full py-8 flex flex-col items-center justify-center bg-black/60 rounded-3xl border border-white/5 text-center px-4">
                      <Loader2 size={24} className="animate-spin text-emerald-400 mb-3" />
                      <span className="text-[11px] font-black text-white uppercase tracking-wider mb-1">Calibrating Workout...</span>
                      <span className="text-[9px] font-bold text-slate-500 uppercase font-mono tracking-widest">Applying custom adjustments</span>
                    </div>
                  ) : (
                    <>
                      {isSimpleRide ? (
                        <div className="bg-black/60 p-5 rounded-3xl border border-white/5 w-full text-center space-y-4 relative overflow-hidden">
                          <div className="flex items-center justify-center gap-6 border-b border-white/5 pb-3">
                            <div className="flex items-center gap-2 text-sm font-black text-white tracking-tighter">
                              <Clock size={16} className="text-blue-400" /> {selectedSuggestedDay.duration_target} MIN
                            </div>
                            <div className="flex items-center gap-2 text-sm font-black text-amber-400 italic">
                              <Zap size={16} fill="currentColor" className="text-amber-400" /> {selectedSuggestedDay.load_target} TSS
                            </div>
                          </div>

                          {/* Single Target Power Display for Simple Recovery & Endurance Rides */}
                          <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex flex-col items-center justify-center space-y-1">
                            <span className="text-[8.5px] font-black uppercase tracking-widest text-emerald-400">Target Steady Power</span>
                            <div className="flex items-baseline justify-center gap-1">
                              <span className="text-3xl font-black italic font-mono text-white">{simpleTargetWatts}</span>
                              <span className="text-xs font-black text-emerald-400 uppercase italic">Watts</span>
                            </div>
                            {ftp && simpleTargetWatts > 0 && (
                              <span className="text-[9.5px] font-extrabold text-slate-400 font-mono">
                                ~{Math.round((simpleTargetWatts / (ftp || 250)) * 100)}% FTP
                              </span>
                            )}
                          </div>

                          <p className="text-[12px] text-slate-300 leading-relaxed text-center px-2 font-medium opacity-90 italic">
                            "{selectedSuggestedDay.why || 'Focus on steady cadence and fluid pedaling.'}"
                          </p>
                        </div>
                      ) : (
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
                      )}
                    </>
                  )}

                  {/* Close Action */}
                  <div className="mt-5 flex flex-col gap-2 w-full">
                    <button 
                      onClick={() => setSelectedSuggestedDay(null)}
                      className="w-full py-3 bg-[#1a1c22] rounded-2xl text-[11px] font-black text-slate-300 hover:text-white hover:bg-slate-800 transition-all uppercase tracking-[0.2em] active:scale-95"
                    >
                      CLOSE
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
      })()}

      {/* Request Change Modal */}
      {showRequestChangeModal && (() => {
        if (showDirectivesSubModal) {
          return (
            <div 
              className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
              onClick={() => {
                setShowRequestChangeModal(false);
                setShowDirectivesSubModal(false);
              }}
            >
              <div 
                className="bg-slate-950/95 w-full max-w-sm rounded-3xl sm:rounded-[2.5rem] p-4 sm:p-6 relative border border-white/10 shadow-2xl space-y-3 sm:space-y-4 max-h-[88dvh] flex flex-col overflow-y-auto custom-scrollbar my-auto"
                onClick={e => e.stopPropagation()}
              >
                <button 
                  onClick={() => setShowDirectivesSubModal(false)}
                  className="absolute top-4 left-4 sm:top-5 sm:left-5 text-slate-400 hover:text-white transition-colors p-1.5 sm:p-2 z-20 bg-black/40 rounded-full flex items-center justify-center"
                  title="Back"
                >
                  <ChevronLeft size={16} />
                </button>

                <button 
                  onClick={() => {
                    setShowRequestChangeModal(false);
                    setShowDirectivesSubModal(false);
                  }}
                  className="absolute top-4 right-4 sm:top-5 sm:right-5 text-slate-500 hover:text-white transition-colors p-1.5 sm:p-2 z-20 bg-black/40 rounded-full"
                >
                  <X size={16} />
                </button>

                <div className="text-center space-y-1 pt-1 sm:pt-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9.5px] font-black uppercase tracking-wider mb-0.5">
                    <Sparkles size={11} /> Plan AI Engine
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-white italic tracking-tight uppercase">
                    Active Directives
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Custom directives guiding your AI plan
                  </p>
                </div>

                {(() => {
                  const activeDirectivesList = planContext ? planContext.split(' ; ').map(s => s.trim()).filter(Boolean) : [];
                  
                  if (activeDirectivesList.length > 0) {
                    return (
                      <div className="space-y-3">
                        <div className="space-y-2 max-h-48 sm:max-h-60 overflow-y-auto custom-scrollbar p-1">
                          {activeDirectivesList.map((directive, idx) => (
                            <div 
                              key={`${idx}-${directive}`}
                              className="bg-[#0a0d14] border border-emerald-500/20 hover:border-emerald-500/40 rounded-xl p-2.5 sm:p-3 transition-all shadow-sm flex flex-col gap-2"
                            >
                              {editingDirectiveIdx === idx ? (
                                <div className="w-full flex flex-col gap-2">
                                  <textarea
                                    value={editingDirectiveText}
                                    onChange={(e) => setEditingDirectiveText(e.target.value)}
                                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-lg p-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 min-h-[60px] resize-none"
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => {
                                        setEditingDirectiveIdx(null);
                                      }}
                                      className="px-3 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-700 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (!editingDirectiveText.trim()) return;
                                        const updated = [...activeDirectivesList];
                                        updated[idx] = editingDirectiveText.trim();
                                        const newContext = updated.join(' ; ');
                                        setPlanContext(newContext);
                                        safeSetItem('wattson_plan_context', newContext);
                                        setLastAppliedTweak(`Updated: "${editingDirectiveText.trim()}"`);
                                        setShowTweakSuccessNotice(false);
                                        setGeneratedWeeks([]);
                                        setWeeklyBriefing(null);
                                        fetchWeeklyBriefingData(newContext, true, undefined, undefined, 1);
                                        setEditingDirectiveIdx(null);
                                      }}
                                      className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500/30 transition-colors"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <span className="text-emerald-400 font-black text-[9px] mt-0.5 shrink-0 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                                      #{idx + 1}
                                    </span>
                                    <span className="text-xs text-slate-200 font-medium leading-snug break-words">
                                      {directive}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => {
                                        setEditingDirectiveIdx(idx);
                                        setEditingDirectiveText(directive);
                                      }}
                                      title="Edit directive"
                                      className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all active:scale-90 cursor-pointer"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const updated = activeDirectivesList.filter((_, i) => i !== idx);
                                        if (updated.length === 0) {
                                          setPlanContext(null);
                                          localStorage.removeItem('wattson_plan_context');
                                          setLastAppliedTweak(null);
                                          setShowTweakSuccessNotice(false);
                                          setGeneratedWeeks([]);
                                          setWeeklyBriefing(null);
                                          fetchWeeklyBriefingData(undefined, true, undefined, undefined, 1);
                                          setShowDirectivesSubModal(false);
                                          setShowRequestChangeModal(false);
                                        } else {
                                          const newContext = updated.join(' ; ');
                                          setPlanContext(newContext);
                                          safeSetItem('wattson_plan_context', newContext);
                                          setGeneratedWeeks([]);
                                          setWeeklyBriefing(null);
                                          fetchWeeklyBriefingData(newContext, true, undefined, undefined, 1);
                                        }
                                      }}
                                      title="Delete directive"
                                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all active:scale-90 cursor-pointer"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => {
                            if (planContext) {
                              setLastAppliedTweak("Updated Directives");
                              setShowTweakSuccessNotice(false);
                              setGeneratedWeeks([]);
                              setWeeklyBriefing(null);
                              fetchWeeklyBriefingData(planContext, true, undefined, undefined, 1);
                            }
                            setShowDirectivesSubModal(false);
                            setShowRequestChangeModal(false);
                          }}
                          className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                        >
                          <Sparkles size={13} />
                          <span>Apply Directives & Recalibrate</span>
                        </button>

                        <button
                          onClick={() => {
                            setPlanContext(null);
                            localStorage.removeItem('wattson_plan_context');
                            setLastAppliedTweak("Directives cleared — plan recalibrated to optimize goal progress based on current context");
                            setShowTweakSuccessNotice(false);
                            setGeneratedWeeks([]);
                            setWeeklyBriefing(null);
                            fetchWeeklyBriefingData(undefined, true, undefined, undefined, 1);
                            setShowDirectivesSubModal(false);
                            setShowRequestChangeModal(false);
                          }}
                          className="w-full py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 size={12} />
                          <span>Delete All Directives</span>
                        </button>
                      </div>
                    );
                  } else {
                    return (
                      <div className="bg-[#0a0d14] border border-white/5 rounded-2xl p-5 text-center space-y-1">
                        <p className="text-xs text-slate-400 font-medium">No custom directives active.</p>
                      </div>
                    );
                  }
                })()}

                <button 
                  onClick={() => setShowDirectivesSubModal(false)}
                  className="w-full py-2.5 bg-slate-900/80 rounded-xl text-[10px] font-black text-slate-300 hover:text-white transition-all uppercase tracking-widest flex items-center justify-center gap-1 border border-white/5"
                >
                  <ChevronLeft size={12} />
                  <span>Back to Request Change</span>
                </button>
              </div>
            </div>
          );
        }

        return (
          <div 
            className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
            onClick={() => {
              setShowRequestChangeModal(false);
              setShowDirectivesSubModal(false);
            }}
          >
            <div 
              className="bg-slate-950/95 w-full max-w-sm rounded-3xl sm:rounded-[2.5rem] p-4 sm:p-6 relative border border-white/10 shadow-2xl space-y-3 sm:space-y-4 max-h-[88dvh] flex flex-col overflow-y-auto custom-scrollbar my-auto"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => {
                  setShowRequestChangeModal(false);
                  setShowDirectivesSubModal(false);
                }}
                className="absolute top-4 right-4 sm:top-5 sm:right-5 text-slate-500 hover:text-white transition-colors p-1.5 sm:p-2 z-20 bg-black/40 rounded-full"
              >
                <X size={16} />
              </button>

              <div className="text-center space-y-0.5 sm:space-y-1 pt-0.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9.5px] font-black uppercase tracking-wider mb-0.5">
                  <Sparkles size={11} /> Plan AI Engine
                </div>
                <h3 className="text-base sm:text-lg font-black text-white italic tracking-tight uppercase">
                  Request Change
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Describe how you'd like to adjust your plan
                </p>
              </div>

              {/* Active Directives trigger button (click through to dedicated screen) */}
              {planContext && (
                <button
                  onClick={() => setShowDirectivesSubModal(true)}
                  className="w-full flex items-center justify-between bg-slate-900/80 hover:bg-slate-900 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 px-3.5 transition-all group text-left active:scale-95 shadow-sm cursor-pointer shrink-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Sparkles size={12} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[8.5px] font-black uppercase tracking-wider text-emerald-400 block leading-tight">
                        Active Directives
                      </span>
                      <p className="text-[10.5px] font-bold text-slate-200 truncate mt-0.5">
                        "{planContext}"
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 group-hover:text-emerald-400 text-[10px] font-bold uppercase tracking-wider shrink-0 ml-2">
                    <span>View</span>
                    <ChevronRight size={13} />
                  </div>
                </button>
              )}

              {/* Text Input Area */}
              <div className="space-y-1 pt-0.5">
                <textarea
                  placeholder="e.g. Shorten tomorrow's ride to 45m, add a rest day on Friday, or lower overall intensity..."
                  value={requestChangeInput}
                  onChange={(e) => setRequestChangeInput(e.target.value)}
                  rows={2}
                  className="w-full bg-[#0a0d14] border border-white/10 rounded-xl sm:rounded-2xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 font-medium resize-none shadow-inner min-h-[64px] max-h-[110px]"
                />
              </div>

              {/* Apply Action */}
              <div className="space-y-2 pt-0.5">
                <button
                  onClick={() => {
                    if (requestChangeInput.trim()) {
                      handleAddTweakFromApp(requestChangeInput.trim());
                    } else if (planContext) {
                      setLastAppliedTweak("Applied Directives");
                      setShowTweakSuccessNotice(false);
                      setGeneratedWeeks([]);
                      setWeeklyBriefing(null);
                      fetchWeeklyBriefingData(planContext, true, undefined, undefined, 1);
                    } else {
                      return;
                    }
                    setShowRequestChangeModal(false);
                    setShowDirectivesSubModal(false);
                    setRequestChangeInput('');
                  }}
                  disabled={!requestChangeInput.trim() && !planContext}
                  className="w-full py-2.5 sm:py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl sm:rounded-2xl disabled:opacity-40 transition-all active:scale-95 shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={13} />
                  <span>{requestChangeInput.trim() ? "Apply Change" : "Apply Changes"}</span>
                </button>

                <button 
                  onClick={() => {
                    setShowRequestChangeModal(false);
                    setShowDirectivesSubModal(false);
                  }}
                  className="w-full py-2 bg-slate-900/60 rounded-xl text-[10px] font-black text-slate-400 hover:text-white transition-all uppercase tracking-widest"
                >
                  Cancel
                </button>
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

      <ChangelogModal 
        isOpen={showChangelog}
        onClose={() => setShowChangelog(false)}
        version={APP_VERSION}
        changes={APP_CHANGELOG}
      />

      {/* Floating Modern Navigation Dock */}
      {!isKeyboardOpen && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[360px] bg-slate-950/75 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)] flex items-center justify-between gap-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
            { id: 'rides', icon: Bike, label: 'Rides' },
            { id: 'chat', icon: MessageSquare, label: 'waTTson' },
            { id: 'settings', icon: User, label: 'Profile' }
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className="relative flex-1 py-2 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-300 active:scale-95 group overflow-hidden"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  />
                )}
                <Icon 
                  size={18} 
                  className={`transition-colors duration-200 ${
                    isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-white'
                  }`} 
                />
                <span 
                  className={`text-[9px] uppercase tracking-wider transition-all duration-200 ${
                    isActive ? 'text-emerald-400 font-black' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                >
                  {item.label}
                </span>
                
                {/* Glowing subtle indicator dot for the active tab */}
                {isActive && (
                  <span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default App;
