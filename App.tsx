import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
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
import { getDailySuggestion, sendChatMessage, getWeeklyBriefing, analyzeUserProfile, analyzeThreeMonthReview, normalizeBriefingDays } from './services/geminiService';
import { 
  PlanDirective, 
  parsePlanDirectives, 
  serializePlanDirectives, 
  getDirectivesTextList, 
  pruneExpiredDirectives, 
  getTodayDateString 
} from './services/directiveService';
import { ActivityCard } from './components/ActivityCard';
import { RiderPowerCurve } from './components/RiderPowerCurve';
import { AerobicEfficiencyDecouplingChart } from './components/AerobicEfficiencyDecouplingChart';
import { SuggestedWorkoutCard, formatPlannedRideTitle } from './components/SuggestedWorkoutCard';
import { CoachingModal } from './components/CoachingModal';
import { ChangelogModal } from './components/ChangelogModal';
import { MonthlyReportModal } from './components/MonthlyReportModal';
import { WorkoutLibrary } from './components/WorkoutLibrary';
import { LibraryWorkout } from './services/workoutLibrary';
import { StepLabel, getStepPhaseLabel, GroupedWorkoutStepsList, scaleLabelWatts, isEnduranceWorkout, VisualProfileChart } from './components/StepLabel';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  subscribeAuth, 
  fetchUserCloudProfile, 
  saveUserCloudProfile, 
  subscribeUserCloudProfile,
  logoutUser, 
  UserCloudProfile 
} from './services/firebase';
import { FirebaseAuthCard } from './components/FirebaseAuthCard';
import { CheckCircle, Cloud, CheckCircle2, ShieldCheck } from 'lucide-react';
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
  Sliders,
  Coffee
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

const getCoachingInsight = (day: any, profile: any, goal: string) => {
  const focus = (day.focus || '').toLowerCase();
  const intensity = (day.intensity || '').toLowerCase();
  const athleteType = profile?.athlete_type || 'Kermesse Specialist & Punchy All-Rounder';
  const cleanGoal = goal || 'Improve cycling performance';
  
  if (focus.includes('rest') || intensity === 'rest') {
    return `Complete rest is where the actual physiological adaptation occurs. For a high-torque ${athleteType}, allowing full muscle glycogen replenishment and nervous system recovery is the secret key to successfully meeting your goal: ${cleanGoal}.`;
  }

  if (focus.includes('endurance') || focus.includes('base') || focus.includes('aerobic') || focus.includes('zone 2') || focus.includes('z2')) {
    return `Building a wide aerobic base is the absolute bedrock for holding high speeds and surviving late-race selections. For a ${athleteType}, this Endurance ride optimizes mitochondrial density and fat oxidation, saving your high-powered anaerobic matches for when you need them to execute your goal: ${cleanGoal}.`;
  }

  if (focus.includes('recovery') || focus.includes('recup') || focus.includes('flush') || focus.includes('spin')) {
    return `As a ${athleteType}, your muscular system generates massive anaerobic torque during peak efforts. This Active Recovery Spin is crucial to stimulate blood flow and clear metabolic waste from your fast-twitch fibers, facilitating muscle protein synthesis without adding systemic stress, directly supporting your goal: ${cleanGoal}.`;
  }
  
  if (focus.includes('vo2') || focus.includes('aerobic capacity') || (focus.includes('interval') && intensity.includes('hard'))) {
    return `This high-intensity session targets your natural strengths as a ${athleteType}. Elevating your maximal aerobic capacity allows you to recover quicker from repeated high-power bursts, making this workout highly specific to achieving your goal: ${cleanGoal}.`;
  }

  if (focus.includes('anaerobic') || focus.includes('sprint') || focus.includes('capacity') || focus.includes('neuromuscular')) {
    return `This explosive session targets your peak power and glycolytic capacity. As a ${athleteType}, your punchy nature is a primary race-winning weapon. Sharpening this system is crucial for achieving your goal: ${cleanGoal}.`;
  }
  
  if (focus.includes('sweet') || focus.includes('threshold') || focus.includes('sst') || focus.includes('tempo') || focus.includes('ftp')) {
    return `This sustained session raising your functional threshold power directly expands your steady-state speed. For a ${athleteType}, this helps you sustain longer speeds during breakaways or bridging attempts to deliver on your goal: ${cleanGoal}.`;
  }

  if (intensity.includes('easy')) {
    return `Building aerobic efficiency at controlled intensities develops cardiovascular resilience. For a ${athleteType}, easy endurance mileage builds fatigue resistance to keep you sharp for your goal: ${cleanGoal}.`;
  }

  return `This session is calculated to balance your current cumulative training stress, maintaining fitness progression toward your target: ${cleanGoal}.`;
};

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
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(a => {
            const dur = a.moving_time || a.elapsed_time || (a as any).time || (a as any).duration || (a as any).icu_recording_time || 0;
            const dist = a.distance || (a as any).icu_distance || 0;
            return dur >= 60 || dist >= 100;
          });
        }
      }
    } catch {}
    return null;
  });
  
  const hasRideToday = useMemo(() => {
    if (!activities) return false;
    const todayStr = toLocalDateStr(new Date());
    return activities.some(a => {
      if (!a.start_date_local.startsWith(todayStr)) return false;
      const dur = a.moving_time || a.elapsed_time || (a as any).time || (a as any).duration || (a as any).icu_recording_time || 0;
      const dist = a.distance || (a as any).icu_distance || 0;
      return dur >= 60 || dist >= 100;
    });
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
  const [weeklyBriefing, setWeeklyBriefing] = useState<WeeklyBriefing | null>(() => {
    try {
      const saved = localStorage.getItem('wattson_saved_weekly_briefing');
      if (saved) return normalizeBriefingDays(JSON.parse(saved));
    } catch {}
    return null;
  });
  const [weeklyBriefingError, setWeeklyBriefingError] = useState<string | null>(null);
  const [loadingWeeklyBriefing, setLoadingWeeklyBriefing] = useState(false);
  const [generatedWeeks, setGeneratedWeeks] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('wattson_saved_generated_weeks');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
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
  const [settingsView, setSettingsView] = useState<'main' | 'goal' | 'data' | 'rider_profile' | 'training_method' | 'ftp' | 'workout_library'>('main');
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

  const APP_VERSION = "1.1.0";

  // Startup popups removed per user preference


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

  useEffect(() => {
    if (weeklyBriefing) {
      safeSetItem('wattson_saved_weekly_briefing', JSON.stringify(weeklyBriefing));
    } else {
      localStorage.removeItem('wattson_saved_weekly_briefing');
    }
  }, [weeklyBriefing]);

  useEffect(() => {
    if (generatedWeeks && generatedWeeks.length > 0) {
      safeSetItem('wattson_saved_generated_weeks', JSON.stringify(generatedWeeks));
    } else {
      localStorage.removeItem('wattson_saved_generated_weeks');
    }
  }, [generatedWeeks]);

  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [planContext, setPlanContext] = useState<string | null>(() => {
    const raw = localStorage.getItem('wattson_plan_context');
    if (!raw) return null;
    const parsed = parsePlanDirectives(raw);
    const { active, expired } = pruneExpiredDirectives(parsed);
    const serialized = serializePlanDirectives(active);
    if (expired.length > 0) {
      safeSetItem('wattson_plan_context', serialized);
    }
    return serialized || null;
  });
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
    const parsed = parsePlanDirectives(planContext);
    const today = getTodayDateString();
    const newDir: PlanDirective = {
      id: `dir_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      text: newTweakDirective.trim(),
      requestedAt: today,
    };
    const updated = [...parsed, newDir];
    const { active } = pruneExpiredDirectives(updated, today);
    const newContext = serializePlanDirectives(active);
    
    setLastAppliedTweak(newTweakDirective.trim());
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
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [formKey, setFormKey] = useState(creds?.apiKey || '');
  const [formId, setFormId] = useState(creds?.athleteId || '');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({ 1: true });

  // Firebase Auth & Cloud Sync State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Guards against race conditions and echoing between devices
  const isCloudProfileLoadedRef = useRef(false);
  const isApplyingRemoteSyncRef = useRef(false);

  // Live state refs for avoiding stale closures during cloud operations
  const userGoalRef = useRef(userGoal);
  userGoalRef.current = userGoal;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const planContextRef = useRef(planContext);
  planContextRef.current = planContext;
  const trainingMethodologyRef = useRef(trainingMethodology);
  trainingMethodologyRef.current = trainingMethodology;
  const trainingModeRef = useRef(trainingMode);
  trainingModeRef.current = trainingMode;
  const planModeRef = useRef(planMode);
  planModeRef.current = planMode;
  const ftpRef = useRef(ftp);
  ftpRef.current = ftp;
  const weeklyBriefingRef = useRef(weeklyBriefing);
  weeklyBriefingRef.current = weeklyBriefing;
  const generatedWeeksRef = useRef(generatedWeeks);
  generatedWeeksRef.current = generatedWeeks;
  const credsRef = useRef(creds);
  credsRef.current = creds;

  const syncToCloud = useCallback((updates: Partial<UserCloudProfile>) => {
    if (!currentUser) return;
    setCloudSyncStatus('syncing');
    saveUserCloudProfile(currentUser.uid, updates)
      .then(() => {
        setCloudSyncStatus('synced');
        setLastSyncedAt(new Date());
      })
      .catch((err) => {
        console.error("Failed to sync to Firestore:", err);
        setCloudSyncStatus('error');
      });
  }, [currentUser]);

  // Extract all existing local preferences to push to centrally stored user data
  const extractLocalPreferencesToPush = useCallback((): { updates: Partial<UserCloudProfile>; hasPreferences: boolean } => {
    const updates: Partial<UserCloudProfile> = {};

    // 1. Goal
    const storedGoal = localStorage.getItem('wattson_goal');
    if (storedGoal && storedGoal.trim()) {
      updates.userGoal = storedGoal.trim();
    } else if (userGoalRef.current && userGoalRef.current.trim() && userGoalRef.current !== 'Improve cycling performance') {
      updates.userGoal = userGoalRef.current.trim();
    }

    // 2. Training Methodology
    const storedMethodology = localStorage.getItem('wattson_training_methodology');
    if (storedMethodology && ['polarized', 'pyramidal', 'threshold'].includes(storedMethodology)) {
      updates.trainingMethodology = storedMethodology as TrainingMethodology;
    } else if (trainingMethodologyRef.current && trainingMethodologyRef.current !== 'polarized') {
      updates.trainingMethodology = trainingMethodologyRef.current;
    }

    // 3. Training Mode
    const storedMode = localStorage.getItem('wattson_training_mode');
    if (storedMode && ['cycling', 'triathlon', 'running'].includes(storedMode)) {
      updates.trainingMode = storedMode as TrainingMode;
    } else if (trainingModeRef.current && trainingModeRef.current !== 'cycling') {
      updates.trainingMode = trainingModeRef.current;
    }

    // 4. Plan Mode
    const storedPlanMode = localStorage.getItem('wattson_plan_mode');
    if (storedPlanMode && ['power', 'hr'].includes(storedPlanMode)) {
      updates.planMode = storedPlanMode as ('power' | 'hr');
    } else if (planModeRef.current && planModeRef.current !== 'power') {
      updates.planMode = planModeRef.current;
    }

    // 5. FTP
    const storedFtp = localStorage.getItem('wattson_ftp');
    if (storedFtp) {
      const f = parseInt(storedFtp, 10);
      if (!isNaN(f) && f > 0 && f <= 1000) {
        updates.ftp = f;
      }
    } else if (ftpRef.current && ftpRef.current > 0 && ftpRef.current <= 1000) {
      updates.ftp = ftpRef.current;
    }

    // 6. Plan Context / Directives
    const storedPlanContext = localStorage.getItem('wattson_plan_context');
    if (storedPlanContext !== null) {
      updates.planContext = storedPlanContext;
    } else if (planContextRef.current) {
      updates.planContext = planContextRef.current;
    }

    // 7. Chat History
    const storedChat = localStorage.getItem('wattson_chat_history');
    if (storedChat) {
      try {
        const parsed = JSON.parse(storedChat);
        if (Array.isArray(parsed) && parsed.length > 0) {
          updates.chatHistoryJson = JSON.stringify(parsed.slice(-50));
        }
      } catch {}
    } else if (messagesRef.current.length > 0) {
      updates.chatHistoryJson = JSON.stringify(messagesRef.current.slice(-50));
    }

    // 8. Intervals.icu Credentials
    const activeCreds = credsRef.current;
    if (activeCreds?.apiKey && activeCreds.apiKey !== 'demo') {
      updates.intervalsApiKey = activeCreds.apiKey;
      updates.intervalsAthleteId = activeCreds.athleteId || '0';
    } else {
      const storedCreds = localStorage.getItem('wattson_creds');
      if (storedCreds) {
        try {
          const parsed = JSON.parse(storedCreds);
          if (parsed.apiKey && parsed.apiKey !== 'demo') {
            updates.intervalsApiKey = parsed.apiKey;
            updates.intervalsAthleteId = parsed.athleteId || '0';
          }
        } catch {}
      }
    }

    // 9. Weekly Briefing
    const storedBriefing = localStorage.getItem('wattson_saved_weekly_briefing');
    if (storedBriefing) {
      updates.weeklyBriefingJson = storedBriefing;
    } else if (weeklyBriefingRef.current) {
      updates.weeklyBriefingJson = JSON.stringify(weeklyBriefingRef.current);
    }

    // 10. Generated Weeks
    const storedWeeks = localStorage.getItem('wattson_saved_generated_weeks');
    if (storedWeeks) {
      try {
        const parsedWeeks = JSON.parse(storedWeeks);
        if (Array.isArray(parsedWeeks) && parsedWeeks.length > 0) {
          updates.generatedWeeksJson = storedWeeks;
        }
      } catch {}
    } else if (generatedWeeksRef.current.length > 0) {
      updates.generatedWeeksJson = JSON.stringify(generatedWeeksRef.current);
    }

    const hasPreferences = Object.keys(updates).length > 0;
    return { updates, hasPreferences };
  }, []);

  // Apply cloud data to local state with conflict/loop avoidance
  const applyCloudProfile = useCallback((profile: UserCloudProfile) => {
    isApplyingRemoteSyncRef.current = true;
    try {
      // 1. Goal sync across devices
      if (profile.userGoal && profile.userGoal !== userGoalRef.current) {
        setUserGoal(profile.userGoal);
        safeSetItem('wattson_goal', profile.userGoal);
      }

      // 2. Chat history sync across devices
      if (profile.chatHistoryJson) {
        try {
          const parsedMessages = JSON.parse(profile.chatHistoryJson);
          if (Array.isArray(parsedMessages)) {
            const currentStr = JSON.stringify(messagesRef.current);
            if (currentStr !== profile.chatHistoryJson) {
              setMessages(parsedMessages);
              safeSetItem('wattson_chat_history', profile.chatHistoryJson);
            }
          }
        } catch (e) {
          console.warn("Error parsing cloud chat history:", e);
        }
      }

      // 3. Training preferences & directives sync across devices
      if (profile.trainingMethodology && profile.trainingMethodology !== trainingMethodologyRef.current) {
        setTrainingMethodology(profile.trainingMethodology);
        safeSetItem('wattson_training_methodology', profile.trainingMethodology);
      }
      if (profile.trainingMode && profile.trainingMode !== trainingModeRef.current) {
        setTrainingMode(profile.trainingMode);
        safeSetItem('wattson_training_mode', profile.trainingMode);
      }
      if (profile.planMode && profile.planMode !== planModeRef.current) {
        setPlanMode(profile.planMode);
        safeSetItem('wattson_plan_mode', profile.planMode);
      }
      if (profile.ftp && profile.ftp !== ftpRef.current) {
        setFtp(profile.ftp);
        safeSetItem('wattson_ftp', profile.ftp.toString());
      }
      if (profile.planContext !== undefined && profile.planContext !== planContextRef.current) {
        setPlanContext(profile.planContext || null);
        if (profile.planContext) {
          safeSetItem('wattson_plan_context', profile.planContext);
        } else {
          localStorage.removeItem('wattson_plan_context');
        }
      }

      // 4. Training plan & briefing sync
      if (profile.weeklyBriefingJson) {
        try {
          const parsed = normalizeBriefingDays(JSON.parse(profile.weeklyBriefingJson));
          const currentBriefingStr = weeklyBriefingRef.current ? JSON.stringify(weeklyBriefingRef.current) : '';
          if (currentBriefingStr !== profile.weeklyBriefingJson) {
            setWeeklyBriefing(parsed);
            safeSetItem('wattson_saved_weekly_briefing', profile.weeklyBriefingJson);
          }
        } catch (e) {
          console.error("Error parsing cloud weekly briefing:", e);
        }
      }
      if (profile.generatedWeeksJson) {
        try {
          const parsedWeeks = JSON.parse(profile.generatedWeeksJson);
          const currentWeeksStr = JSON.stringify(generatedWeeksRef.current);
          if (currentWeeksStr !== profile.generatedWeeksJson) {
            setGeneratedWeeks(parsedWeeks);
            safeSetItem('wattson_saved_generated_weeks', profile.generatedWeeksJson);
          }
        } catch (e) {
          console.error("Error parsing cloud generated weeks:", e);
        }
      }

      // 5. Intervals credentials
      const currentLocalCreds = credsRef.current;
      if (profile.intervalsApiKey && (!currentLocalCreds || !currentLocalCreds.apiKey || currentLocalCreds.apiKey === 'demo')) {
        const restoredCreds = {
          apiKey: profile.intervalsApiKey,
          athleteId: profile.intervalsAthleteId || '0'
        };
        setCreds(restoredCreds);
        safeSetItem('wattson_creds', JSON.stringify(restoredCreds));
      }
    } finally {
      setTimeout(() => {
        isApplyingRemoteSyncRef.current = false;
      }, 300);
    }
  }, []);

  // Subscribe to Firebase Auth and attach real-time multi-device cloud listener
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuthHandler = subscribeAuth(async (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (user) {
        try {
          setCloudSyncStatus('syncing');

          // Detect whether user is logging in (explicit button click, account change, or from logged-out)
          const isExplicitLogin = typeof window !== 'undefined' && sessionStorage.getItem('wattson_explicit_login') === 'true';
          if (isExplicitLogin && typeof window !== 'undefined') {
            sessionStorage.removeItem('wattson_explicit_login');
          }
          const lastAuthUserId = typeof window !== 'undefined' ? localStorage.getItem('wattson_auth_user_id') : null;
          const isUserLoggingIn = isExplicitLogin || !lastAuthUserId || lastAuthUserId !== user.uid;

          const { updates: localUpdates, hasPreferences } = extractLocalPreferencesToPush();
          const profile = await fetchUserCloudProfile(user.uid);

          if (profile) {
            if (isUserLoggingIn && hasPreferences) {
              // When local preferences exist and a user logs in, push local preferences towards centrally stored user data in Firebase
              console.log("[Firebase] User logged in with local preferences. Pushing to centrally stored cloud profile:", Object.keys(localUpdates));
              await saveUserCloudProfile(user.uid, localUpdates);

              // Merge: Local preferences overwrite cloud values, while preserving any cloud fields not defined locally
              const mergedProfile: UserCloudProfile = {
                ...profile,
                ...localUpdates,
                displayName: user.displayName || profile.displayName || '',
                photoURL: user.photoURL || profile.photoURL || ''
              };
              applyCloudProfile(mergedProfile);
            } else {
              // Standard session resumption or device without local preferences: apply central cloud data
              applyCloudProfile(profile);
            }
            safeSetItem('wattson_auth_user_id', user.uid);
            isCloudProfileLoadedRef.current = true;
            setCloudSyncStatus('synced');
            setLastSyncedAt(new Date());
          } else {
            // First time user: initialize cloud profile with local preferences
            isCloudProfileLoadedRef.current = true;
            const initialProfile: Partial<UserCloudProfile> = {
              displayName: user.displayName || '',
              photoURL: user.photoURL || '',
              userGoal: localUpdates.userGoal || userGoalRef.current,
              chatHistoryJson: localUpdates.chatHistoryJson ?? (messagesRef.current.length > 0 ? JSON.stringify(messagesRef.current.slice(-50)) : undefined),
              trainingMethodology: localUpdates.trainingMethodology || trainingMethodologyRef.current,
              trainingMode: localUpdates.trainingMode || trainingModeRef.current,
              planMode: localUpdates.planMode || planModeRef.current,
              ftp: localUpdates.ftp ?? (ftpRef.current || undefined),
              planContext: localUpdates.planContext ?? (planContextRef.current || undefined),
              intervalsApiKey: localUpdates.intervalsApiKey ?? (credsRef.current?.apiKey && credsRef.current.apiKey !== 'demo' ? credsRef.current.apiKey : undefined),
              intervalsAthleteId: localUpdates.intervalsAthleteId ?? credsRef.current?.athleteId,
              weeklyBriefingJson: localUpdates.weeklyBriefingJson ?? (weeklyBriefingRef.current ? JSON.stringify(weeklyBriefingRef.current) : undefined),
              generatedWeeksJson: localUpdates.generatedWeeksJson ?? (generatedWeeksRef.current.length > 0 ? JSON.stringify(generatedWeeksRef.current) : undefined),
              createdAt: new Date().toISOString()
            };
            await saveUserCloudProfile(user.uid, initialProfile);
            safeSetItem('wattson_auth_user_id', user.uid);
            setCloudSyncStatus('synced');
            setLastSyncedAt(new Date());
          }

          // Real-time listener: sync changes across open devices instantly
          unsubscribeSnapshot = subscribeUserCloudProfile(user.uid, (remoteProfile) => {
            if (remoteProfile && isCloudProfileLoadedRef.current) {
              applyCloudProfile(remoteProfile);
              setCloudSyncStatus('synced');
              setLastSyncedAt(new Date());
            }
          });
        } catch (err) {
          console.error("Error syncing profile with cloud:", err);
          setCloudSyncStatus('error');
        }
      } else {
        isCloudProfileLoadedRef.current = false;
        if (typeof window !== 'undefined') {
          localStorage.removeItem('wattson_auth_user_id');
        }
        setCloudSyncStatus('idle');
      }
    });

    return () => {
      unsubscribeAuthHandler();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [applyCloudProfile, extractLocalPreferencesToPush]);

  // Sync Goal & Training Preferences to Firestore (debounced)
  useEffect(() => {
    if (!currentUser || !isCloudProfileLoadedRef.current || isApplyingRemoteSyncRef.current) return;
    const timeout = setTimeout(() => {
      syncToCloud({
        userGoal,
        trainingMethodology,
        trainingMode,
        planMode,
        ftp: ftp || undefined,
        planContext: planContext || ''
      });
    }, 1200);
    return () => clearTimeout(timeout);
  }, [userGoal, trainingMethodology, trainingMode, planMode, ftp, planContext, currentUser, syncToCloud]);

  // Sync Chat History to Firestore (debounced)
  useEffect(() => {
    if (!currentUser || !isCloudProfileLoadedRef.current || isApplyingRemoteSyncRef.current) return;
    const timeout = setTimeout(() => {
      syncToCloud({
        chatHistoryJson: JSON.stringify(messages.slice(-50))
      });
    }, 1200);
    return () => clearTimeout(timeout);
  }, [messages, currentUser, syncToCloud]);

  // Sync training plan changes to Firestore
  useEffect(() => {
    if (!currentUser || !isCloudProfileLoadedRef.current || isApplyingRemoteSyncRef.current) return;
    if (weeklyBriefing) {
      syncToCloud({
        weeklyBriefingJson: JSON.stringify(weeklyBriefing),
        generatedWeeksJson: JSON.stringify(generatedWeeks)
      });
    }
  }, [weeklyBriefing, generatedWeeks, currentUser, syncToCloud]);

  // Startup changelog popup removed per user preference


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
    
    // Retain weekly briefing across syncs so plans stay consistent

    try {
      let activeCreds = { ...credentials };
      
      // If athleteId is '0' or missing, try to fetch it
      if (activeCreds.apiKey !== 'demo' && (!activeCreds.athleteId || activeCreds.athleteId === '0')) {
        const realId = await fetchAthleteId(activeCreds.apiKey);
        activeCreds.athleteId = realId;
      }

      // 1. Fetch Profile (validates API key and retrieves FTP)
      let profile: any = null;
      if (activeCreds.apiKey === 'demo') {
        profile = { id: '0', icu_ftp: 250 };
      } else {
        try {
          profile = await fetchAthleteProfile(activeCreds);
        } catch (e: any) {
          console.warn("Could not fetch athlete profile:", e);
        }
      }

      if (profile?.icu_ftp) {
        setFtp(profile.icu_ftp);
        safeSetItem('wattson_ftp', profile.icu_ftp.toString());
      }

      // 2. Fetch Activities (recent 3 years, with graceful cache fallback)
      let fetchedActivities: Activity[] = [];
      try {
        fetchedActivities = await fetchActivities(activeCreds, 1095);
      } catch (e: any) {
        console.warn("Activities sync incomplete or failed, checking cache:", e);
        if (activities && activities.length > 0) {
          fetchedActivities = activities;
        } else {
          throw e; // rethrow if we have no activities to display
        }
      }

      // 3. Fetch Wellness (recent 3 years)
      let fetchedWellness: Wellness[] = [];
      try {
        fetchedWellness = await fetchWellness(activeCreds, 1095);
      } catch (e: any) {
        console.warn("Wellness fetch failed, using cache:", e);
        fetchedWellness = wellnessData || [];
      }

      // 4. Fetch Power Curves (non-blocking enrichment)
      let curves: any[] = [];
      try {
        curves = await getAnnualPowerCurves(activeCreds, 3);
      } catch (e: any) {
        console.warn("Power curve fetch failed, using cache:", e);
        curves = powerCurves || [];
      }
      
      console.log("Fetched activities sample:", fetchedActivities?.length > 0 ? fetchedActivities[0] : "empty");
      setActivities(fetchedActivities || []);
      setWellnessData(fetchedWellness || []);
      setPowerCurves(curves || []);
      
      // Limit cache to avoid QuotaExceededError (5MB limit)
      // Save compact representation of recent activities to disk while keeping full history in memory
      const activitiesToCache = (fetchedActivities || []).slice(0, 100).map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        start_date_local: a.start_date_local,
        distance: a.distance,
        moving_time: a.moving_time,
        elapsed_time: a.elapsed_time,
        total_elevation_gain: a.total_elevation_gain,
        icu_training_load: a.icu_training_load,
        icu_tss: a.icu_tss,
        average_watts: a.average_watts,
        icu_average_watts: a.icu_average_watts,
        weighted_average_watts: a.weighted_average_watts,
        icu_weighted_average_watts: a.icu_weighted_average_watts,
        average_heartrate: a.average_heartrate,
        max_heartrate: a.max_heartrate,
        icu_intensity: a.icu_intensity,
        icu_variability_index: a.icu_variability_index,
        icu_eftp: a.icu_eftp,
        icu_zone_times: a.icu_zone_times,
        icu_hr_zone_times: a.icu_hr_zone_times,
        icu_intervals: a.icu_intervals,
        icu_groups: a.icu_groups
      }));
      const wellnessToCache = (fetchedWellness || []).slice(-365);

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

      if (currentUser && activeCreds.apiKey && activeCreds.apiKey !== 'demo') {
        syncToCloud({
          intervalsApiKey: activeCreds.apiKey,
          intervalsAthleteId: activeCreds.athleteId
        });
      }

      // If initial load and we have history, greet the user
      if (isInitial && fetchedActivities && fetchedActivities.length > 0 && messages.length === 0) {
        const sorted = [...fetchedActivities].sort((a,b) => a.start_date_local.localeCompare(b.start_date_local));
        const oldestRide = sorted[0];
        const oldestDateStr = new Date(oldestRide.start_date_local).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        
        let introMsg = `Connection established. I've analyzed your full history of **${fetchedActivities.length} activities** extending back to **${oldestDateStr}**.\n\nI'm ready to provide coaching based on your long-term evolution. What's on your mind today?`;
        
        if (planContext) {
          const textList = getDirectivesTextList(parsePlanDirectives(planContext));
          if (textList.length > 0) {
            introMsg += `\n\n*Applied context: ${textList.join(' ; ')}*`;
          }
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
          const week1Length = 7;

          const weekRanges = [
            { start: 0, end: week1Length },
            { start: week1Length, end: week1Length + 7 },
            { start: week1Length + 7, end: week1Length + 14 },
            { start: week1Length + 14, end: week1Length + 21 }
          ];

          const range = weekRanges[weekIndex - 1];
          
          // Compute precise session-to-day offsets using chronological assignment to avoid slicing issues due to double sessions/commutes
          const prevDayOffsets: number[] = [];
          let currentOffset = 0;
          let prevDayStr = '';
          prev.days.forEach((day, i) => {
            if (i > 0) {
              const curDayNormalized = (day.day || '').trim().toLowerCase();
              const prevDayNormalized = prevDayStr.trim().toLowerCase();
              if (curDayNormalized !== prevDayNormalized) {
                currentOffset += 1;
              }
            }
            prevDayOffsets.push(currentOffset);
            prevDayStr = day.day || '';
          });

          // Partition the previous days array by whether they fall before, within, or after the target week range
          const daysBefore = prev.days.filter((_, i) => prevDayOffsets[i] < range.start);
          const daysAfter = prev.days.filter((_, i) => prevDayOffsets[i] >= range.end);
          
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

  const hasInitiallyCheckedPlan = useRef(false);
  useEffect(() => {
    if (activities && activities.length > 0 && !hasInitiallyCheckedPlan.current) {
      hasInitiallyCheckedPlan.current = true;
      // Do not regenerate if a saved briefing already exists from cache/storage
      if (!weeklyBriefing) {
        fetchWeeklyBriefingData(undefined, false, undefined, undefined, 1);
      }
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

  const handleLogout = async () => {
    const keys = [
      'wattson_creds', 
      'wattson_activities_cache', 
      'wattson_wellness_cache', 
      'wattson_ftp', 
      'wattson_daily_cache', 
      'wattson_chat_history',
      'wattson_goal',
      'wattson_seen_version',
      'wattson_plan_context',
      'wattson_saved_weekly_briefing',
      'wattson_saved_generated_weeks'
    ];
    keys.forEach(k => localStorage.removeItem(k));
    try {
      await logoutUser();
    } catch {}
    window.location.reload();
  };

  const handleApplyLibraryWorkout = (workout: LibraryWorkout) => {
    const todayStr = toLocalDateStr(new Date());
    const newSuggestion: DailySuggestion = {
      date: todayStr,
      readiness_score: stats.readiness || 8,
      readiness_analysis: "Custom workout applied from the Workout Library.",
      reasoning: `You hand-selected the curated "${workout.title}" workout from your Workout Library.`,
      primary: {
        title: workout.title,
        description: workout.description,
        intensity: workout.intensity === 'Rest' ? 'Rest' : (workout.intensity === 'Easy' ? 'Low' : workout.intensity === 'Medium' ? 'Moderate' : 'High'),
        duration_minutes: workout.duration_minutes,
        type: workout.category.toLowerCase().includes('interval') || workout.workout_steps.length > 3 ? 'intervals' : 'endurance',
        tss: workout.tss,
        workout_steps: workout.workout_steps.map(step => ({
          duration: step.duration,
          target_watts: Math.round(step.target_pct * (ftp || 250)),
          label: `${step.duration}m ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
        }))
      },
      alternative: {
        title: "Active Recovery Spin",
        description: "An easy, steady recovery spin to facilitate blood flow and recovery.",
        intensity: "Low",
        duration_minutes: 30,
        type: "endurance",
        tss: 15,
        workout_steps: [
          { duration: 5, target_watts: Math.round(0.45 * (ftp || 250)), label: "5m Spin up warmup" },
          { duration: 20, target_watts: Math.round(0.52 * (ftp || 250)), label: "20m Steady recovery spin" },
          { duration: 5, target_watts: Math.round(0.40 * (ftp || 250)), label: "5m Easy cooldown" }
        ]
      }
    };
    setSuggestion(newSuggestion);
    safeSetItem('wattson_daily_cache', JSON.stringify(newSuggestion));
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
            handleAddTweakFromApp(directive);
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
      // Calculate consecutive day offsets to prevent multi-week collision
      const dayOffsets: number[] = [];
      let currentOffset = 0;
      let prevDayStr = '';
      
      weeklyBriefing.days.forEach((day, idx) => {
        if (idx > 0) {
          const curDayNormalized = (day.day || '').trim().toLowerCase();
          const prevDayNormalized = prevDayStr.trim().toLowerCase();
          if (curDayNormalized !== prevDayNormalized) {
            currentOffset += 1;
          }
        }
        dayOffsets.push(currentOffset);
        prevDayStr = day.day || '';
      });

      weeklyBriefing.days.forEach((day, idx) => {
        const dayOffset = dayOffsets[idx];
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
    const filtered = safeActivities.filter(a => {
      const dur = a.moving_time || a.elapsed_time || (a as any).time || (a as any).duration || (a as any).icu_recording_time || 0;
      const dist = a.distance || (a as any).icu_distance || 0;
      if (dur < 60 && dist < 100) return false;
      return !a.type || recognizedTypes.includes(a.type);
    });

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
    const ctxLower = getDirectivesTextList(parsePlanDirectives(planContext)).join(' ').toLowerCase();
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

  const ridesSections = useMemo(() => {
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(todayDate.getDate() + 1);
    const sevenDaysFromNow = new Date(todayDate);
    sevenDaysFromNow.setDate(todayDate.getDate() + 7);
    
    const toDateStr = (d: Date) => d.toISOString().split('T')[0];
    const todayDateStr = toDateStr(todayDate);
    const tomorrowDateStr = toDateStr(tomorrowDate);

    // Filters
    const isToday = (i: any) => (i.type === 'today_suggested' || i.type === 'today_actual') || (i.type === 'future_suggested' && toDateStr(i.date) === todayDateStr);
    const isTomorrow = (i: any) => i.type === 'future_suggested' && toDateStr(i.date) === tomorrowDateStr;
    const isFuture = (i: any) => i.type === 'future_suggested' && i.date > tomorrowDate && i.date <= sevenDaysFromNow;

    const todayItems = sortedTimelineItems.filter(isToday);
    const tomorrowItems = sortedTimelineItems.filter(isTomorrow);
    const futureItems = sortedTimelineItems.filter(isFuture);

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

    const sortedTodayItems = [...todayItems].sort((a, b) => {
      if (a.type === 'today_suggested' && b.type === 'today_actual') return -1;
      if (a.type === 'today_actual' && b.type === 'today_suggested') return 1;
      if (a.type === 'today_suggested' && b.type === 'today_suggested') return compareSameDayForTimeline(a, b);
      if (a.type === 'today_actual' && b.type === 'today_actual') return b.date.getTime() - a.date.getTime();
      return 0;
    });
    const sortedTomorrowItems = [...tomorrowItems].sort((a, b) => compareSameDayForTimeline(a, b));
    const sortedFutureItems = [...futureItems].sort((a, b) => b.date.getTime() - a.date.getTime());
    const sortedPastItems = sortedTimelineItems.filter(i => i.type === 'past').sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      sortedTodayItems,
      sortedTomorrowItems,
      sortedFutureItems,
      sortedPastItems
    };
  }, [sortedTimelineItems]);

  const lastActivity = useMemo(() => {
    if (!activities || activities.length === 0) return null;
    const valid = activities.filter(a => {
      const dur = a.moving_time || a.elapsed_time || (a as any).time || (a as any).duration || (a as any).icu_recording_time || 0;
      const dist = a.distance || (a as any).icu_distance || 0;
      return dur >= 60 || dist >= 100;
    });
    if (valid.length === 0) return null;
    return [...valid].sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))[0];
  }, [activities]);

  useEffect(() => {
    if (activeTab !== 'rides') {
      setHidePlanHeader(false);
      return;
    }
    
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const element = document.getElementById('timeline-top-sentinel');
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setHidePlanHeader(!entry.isIntersecting);
    });

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

  const hasData = Boolean(activities && activities.length > 0);

  if (!creds || (!hasData && syncError)) return (
    <div className="fixed inset-0 flex flex-col p-6 justify-center items-center overflow-y-auto">
      <div className="premium-bg"></div>
      <div className="glass-card w-full max-w-sm p-6 rounded-[2rem] text-center my-auto">
        <div className="w-12 h-12 bg-emerald-500/5 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/5 shadow-inner">
          <CyclistIcon size={24} className="text-emerald-400" />
        </div>
        <h1 className="text-3xl font-black text-white italic mb-1 tracking-tight">
          wa<span className="text-emerald-400">TT</span>son
        </h1>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-5">
          Intelligent Cycling Architecture
        </p>

        <div className="space-y-3.5">
          {/* Cloud User Profile & Cross-Device Sync */}
          <FirebaseAuthCard 
            currentUser={currentUser} 
            cloudSyncStatus={cloudSyncStatus} 
            lastSyncedAt={lastSyncedAt} 
            compact={true}
          />

          <div className="flex items-center gap-2 pt-1 pb-0.5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              Intervals.icu Connection
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

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
            className="w-full bg-white/5 text-slate-400 font-bold py-3 rounded-xl text-[10px] uppercase tracking-widest active:scale-95 transition-all border border-white/5"
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
      <header className="flex-none flex items-center justify-between pb-3 px-5 bg-transparent border-b border-white/[0.06] z-30" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/[0.03] border border-white/10 flex flex-shrink-0 items-center justify-center relative overflow-hidden shadow-sm">
             {isSyncing && <div className="absolute inset-0 bg-emerald-500/20 animate-pulse" />}
             {activeTab === 'chat' ? <Bot size={16} className="text-emerald-400" /> : <CyclistIcon size={18} className="text-emerald-400" />}
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-white italic tracking-tight leading-none">
              wa<span className="text-emerald-400">TT</span>son
            </h2>
            {isSyncing ? (
              <RotateCcw size={11} className="animate-spin text-emerald-400" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            )}
          </div>
        </div>
        
        <div className="flex justify-end gap-2 items-center">
          {activeTab === 'chat' && (
            <button 
              onClick={() => { 
                if (confirmClear) {
                  setMessages([]);
                  safeSetItem('wattson_chat_history', '[]');
                  if (currentUser) {
                    syncToCloud({ chatHistoryJson: '[]' });
                  }
                  setConfirmClear(false);
                } else {
                  setConfirmClear(true);
                  setTimeout(() => setConfirmClear(false), 3000);
                }
              }}
              className={`px-3 py-1.5 rounded-xl border text-[9.5px] font-black uppercase tracking-wider transition-all active:scale-95 ${
                confirmClear 
                ? 'bg-rose-500/20 border-rose-500 text-rose-300' 
                : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/30'
              }`}
            >
              {confirmClear ? 'Confirm Clear' : 'Clear'}
            </button>
          )}

          {activeTab !== 'chat' && (
            <>
              <button 
                onClick={() => {
                  setActiveTab('settings');
                  setSettingsView('workout_library');
                }}
                className="w-8 h-8 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all"
                title="Workout Library"
              >
                <BookOpen size={14} />
              </button>
              <button 
                onClick={() => { setSuggestion(null); loadData(creds!); }}
                disabled={isSyncing}
                className="w-8 h-8 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-slate-300 hover:text-emerald-400 active:scale-95 transition-all"
                title="Refresh Intervals Data"
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin text-emerald-400' : ''} />
              </button>
              <button 
                onClick={() => {
                  setActiveTab('settings');
                  setSettingsView('main');
                }}
                className="h-8 px-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 flex items-center gap-1.5 text-slate-300 hover:text-white active:scale-95 transition-all"
                title={currentUser ? `Cloud Sync: ${currentUser.displayName || currentUser.email}` : "Cloud Profile (Sign In)"}
              >
                {currentUser?.photoURL ? (
                  <img 
                    src={currentUser.photoURL} 
                    alt="User" 
                    className="w-4 h-4 rounded-full object-cover border border-emerald-400/40"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Cloud size={13} className={currentUser ? "text-emerald-400" : "text-slate-400"} />
                )}
                {currentUser && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {syncError && hasData && (
        <div className="mx-4 mt-2 p-2.5 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-center justify-between text-xs text-rose-300 backdrop-blur-md">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0 animate-pulse" />
            <span className="text-[11px] truncate">{syncError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              onClick={() => { setSyncError(null); if (creds) loadData(creds); }}
              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-[10px] font-bold rounded-lg uppercase tracking-wider text-rose-200 active:scale-95 transition-all"
            >
              Retry
            </button>
            <button
              onClick={() => setSyncError(null)}
              className="text-rose-400 hover:text-rose-200 p-1 text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* View Container with persistent mounting & instantaneous tab switching */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">

        {/* Dashboard Tab */}
        <div 
          className={`flex-1 hide-scrollbar scroll-smooth overflow-y-auto px-4 pt-3.5 pb-28 ${activeTab === 'dashboard' ? 'flex flex-col space-y-3.5' : 'hidden'}`}
        >
            
            {/* Section 1: Target Goal */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9.5px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Target Goal
                </span>
                <button
                  onClick={() => setShowGoalEditor(true)}
                  className="text-[9.5px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-wider flex items-center gap-1"
                >
                  <Edit size={10} />
                  <span>Edit</span>
                </button>
              </div>
              
              <div 
                onClick={() => setShowGoalEditor(true)}
                className="glass-card px-3.5 py-2.5 rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3 bg-slate-900/30 hover:border-emerald-500/30 cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <Target size={13} />
                  </div>
                  <h2 className="text-xs font-bold text-slate-200 italic tracking-tight truncate">
                    "{userGoal || 'Define your primary training goal'}"
                  </h2>
                </div>
                <ChevronRight size={13} className="text-slate-600 shrink-0" />
              </div>
            </div>

            {/* Section 2: Next Up */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9.5px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Next Workout
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  Auto-Calibrated
                </span>
              </div>

              <div className="space-y-2">
                {/* Visual indicator when plan is updating or updated */}
                {isPlanUpdating && (
                  <div className="glass-card p-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 animate-pulse flex items-center gap-3 shadow-md">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <Loader2 size={14} className="animate-spin text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">
                          Updating Plan
                        </span>
                        {lastAppliedTweak && (
                          <span className="text-[8px] font-bold text-slate-400 truncate">
                            "{lastAppliedTweak}"
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-slate-200 truncate mt-0.5">
                        Recalibrating workouts to match requested change...
                      </p>
                    </div>
                  </div>
                )}

                {!isPlanUpdating && showTweakSuccessNotice && lastAppliedTweak && (
                  <div className="glass-card p-2.5 px-3 rounded-2xl border border-emerald-500/20 bg-slate-900/60 flex items-center justify-between gap-2 shadow-sm animate-in fade-in duration-300">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Check size={11} className="stroke-[3]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 block leading-none">Plan Updated</span>
                        <p className="text-[10px] font-bold text-slate-200 truncate mt-0.5">
                          "{lastAppliedTweak}"
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowTweakSuccessNotice(false)}
                      className="p-1 text-slate-500 hover:text-white shrink-0"
                    >
                      <X size={11} />
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

            {/* Section 3: Performance Metrics */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9.5px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Performance Metrics
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  Intervals.icu
                </span>
              </div>

              {/* Unified 5-Metric Strip */}
              <div className="glass-card p-3 rounded-2xl border border-white/[0.06] bg-slate-900/30">
                <div className="grid grid-cols-5 gap-1 divide-x divide-white/[0.06]">
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">Fitness</span>
                    <span className="text-sm font-black italic text-cyan-400 font-mono mt-0.5">{stats.ctl}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">Fatigue</span>
                    <span className="text-sm font-black italic text-amber-400 font-mono mt-0.5">{stats.atl}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">Form</span>
                    <span className={`text-sm font-black italic font-mono mt-0.5 ${stats.form >= 5 ? 'text-emerald-400' : stats.form < -25 ? 'text-rose-400' : stats.form < -10 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {stats.form > 0 ? `+${stats.form}` : stats.form}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">7D Time</span>
                    <span className="text-sm font-black italic text-slate-100 font-mono mt-0.5">{stats.total7DayTime}h</span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">7D Load</span>
                    <span className="text-sm font-black italic text-emerald-400 font-mono mt-0.5">{stats.total7DayLoad}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Monthly Report */}
            <div className="space-y-1.5 pt-0.5">
              <div 
                onClick={() => setShowMonthlyReport(true)}
                className="glass-card px-3.5 py-2.5 rounded-2xl border border-blue-500/20 flex items-center justify-between gap-3 bg-blue-500/5 hover:border-blue-500/40 hover:bg-blue-500/10 cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                    <TrendingUp size={13} />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-200 tracking-tight">
                      Monthly Report
                    </h2>
                    <p className="text-[9px] text-slate-400 font-medium">Review your last 30 days of training</p>
                  </div>
                </div>
                <ChevronRight size={13} className="text-slate-600 shrink-0" />
              </div>
            </div>

            {/* Section 4: Latest Ride */}
            {lastActivity && (
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[9.5px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Latest Activity
                  </span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    {new Date(lastActivity.start_date_local).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <ActivityCard 
                  activity={lastActivity}
                  onClick={(act) => setSelectedActivity(act)}
                  isToday={new Date(lastActivity.start_date_local).toDateString() === new Date().toDateString()}
                />
              </div>
            )}

        </div>

        {/* Rides Tab */}
        <div 
          className={`flex-1 hide-scrollbar scroll-smooth overflow-y-auto px-4 pt-3.5 pb-28 ${activeTab === 'rides' ? 'flex flex-col' : 'hidden'}`}
        >
          <div className="flex flex-col pt-1 pb-2 space-y-3">
            {/* Integrated Training Plan Section */}
            <div className="flex flex-col space-y-3 relative">
              {/* Planned Upcoming Sessions */}
              {(ridesSections.sortedFutureItems.length > 0 || ridesSections.sortedTomorrowItems.length > 0 || ridesSections.sortedTodayItems.length > 0 || isPlanUpdating) && (
                <div className="flex flex-col space-y-2.5 pt-0.5">
                  {/* Header & Request Change */}
                  <div className="flex items-center justify-between gap-2 px-1">
                    <button
                      onClick={() => setIsOtherFutureExpanded(!isOtherFutureExpanded)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 text-slate-300 hover:text-white text-[9.5px] font-black uppercase tracking-[0.18em] rounded-xl shrink-0 whitespace-nowrap transition-all cursor-pointer active:scale-95"
                    >
                      <span>Upcoming Plan</span>
                      {ridesSections.sortedFutureItems.length > 0 && (
                        <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 rounded text-[8px] font-mono">
                          +{ridesSections.sortedFutureItems.length}
                        </span>
                      )}
                      {ridesSections.sortedFutureItems.length > 0 && (
                        isOtherFutureExpanded ? <ChevronDown size={11} className="text-slate-400" /> : <ChevronRight size={11} className="text-slate-400" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setRequestChangeInput('');
                        setShowRequestChangeModal(true);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-300 text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                    >
                      <Sparkles size={10} className="text-emerald-400" />
                      <span>Request Change</span>
                    </button>
                  </div>

                  <div className="space-y-2 pt-0.5">
                    {/* Plan Updating Indicator */}
                    {isPlanUpdating && (
                      <div className="glass-card p-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 animate-pulse flex items-center gap-3 shadow-md my-1">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <Loader2 size={14} className="animate-spin text-emerald-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">
                              Updating Plan
                            </span>
                            {lastAppliedTweak && (
                              <span className="text-[8px] font-bold text-slate-400 truncate">
                                "{lastAppliedTweak}"
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-bold text-slate-200 truncate mt-0.5">
                            Recalibrating workouts to match requested change...
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Far Future Rides (Expanded) */}
                    {isOtherFutureExpanded && ridesSections.sortedFutureItems.length > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                        {ridesSections.sortedFutureItems.map((item) => (
                          <SuggestedWorkoutCard key={item.key} day={item.dayData!} absoluteIndex={item.absoluteIndex ?? 0} onClick={(day) => setSelectedSuggestedDay(day)} isToday={false} />
                        ))}
                      </motion.div>
                    )}

                    {/* Tomorrow Rides */}
                    {ridesSections.sortedTomorrowItems.length > 0 && (
                      <div className="flex flex-col space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[9.5px] font-black uppercase tracking-[0.2em] text-blue-400">
                            Tomorrow
                          </span>
                        </div>
                        {ridesSections.sortedTomorrowItems.map((item) => (
                          <SuggestedWorkoutCard key={item.key} day={item.dayData!} absoluteIndex={item.absoluteIndex ?? 0} onClick={(day) => setSelectedSuggestedDay(day)} isToday={false} />
                        ))}
                      </div>
                    )}

                    {/* Today Rides */}
                    {ridesSections.sortedTodayItems.length > 0 && (
                      <div className="flex flex-col space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[9.5px] font-black uppercase tracking-[0.2em] text-emerald-400">
                            Today
                          </span>
                        </div>
                        {ridesSections.sortedTodayItems.map((item) => {
                          if (item.type === 'today_actual' && item.activityData) {
                            return (
                              <ActivityCard 
                                key={item.key}
                                activity={item.activityData} 
                                onClick={setSelectedActivity} 
                                isToday={true}
                              />
                            );
                          }
                          return (
                            <SuggestedWorkoutCard 
                              key={item.key} 
                              day={item.dayData!} 
                              absoluteIndex={item.absoluteIndex ?? 0} 
                              onClick={(day) => setSelectedSuggestedDay(day)} 
                              isToday={true} 
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Past Section / Training History */}
            <div ref={todayAndPastContainerRef} className="flex flex-col space-y-2.5 pt-2">
              {ridesSections.sortedPastItems.length > 0 && (
                <div className="flex flex-col space-y-2.5">
                  <div className="flex items-center justify-between px-1 pb-0.5">
                    <span className="text-[9.5px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Training History
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      {ridesSections.sortedPastItems.length} Sessions
                    </span>
                  </div>

                  {ridesSections.sortedPastItems.map((item, idx, arr) => {
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
                          <div className="flex items-center gap-3 px-1 pt-3 pb-0.5">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                              {monthLabel}
                            </span>
                            <div className="flex-1 h-px bg-white/[0.06]" />
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
          </div>
        </div>

        {/* Chat Tab */}
        <div 
          className={`flex-1 min-h-0 bg-transparent overflow-hidden relative ${activeTab === 'chat' ? 'flex flex-col' : 'hidden'}`}
        >
             <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-4 py-4 custom-scrollbar">
               {messages.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-center px-6 pb-12 animate-in fade-in duration-500">
                    <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5 shadow-inner animate-pulse relative">
                       <div className="absolute inset-2 border border-emerald-500/20 rounded-2xl animate-ping [animation-duration:4s]" />
                       <Bot size={28} className="text-emerald-400" />
                    </div>
                    <p className="text-sm font-black text-white italic uppercase tracking-wider mb-2">waTTson Coach</p>
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

        {/* Settings Tab */}
        <div 
          className={`flex-1 hide-scrollbar scroll-smooth overflow-y-auto px-4 pt-4 pb-28 ${activeTab === 'settings' ? 'flex flex-col' : 'hidden'}`}
        >
              {settingsView === "main" ? null : (
                <div className="flex items-center gap-3 pb-4 px-1 pt-1 mb-4 border-b border-white/5">
                  <button 
                    onClick={() => setSettingsView("main")}
                    className="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-all"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <h2 className="text-[14px] font-black text-white italic uppercase tracking-tight">
                    {settingsView === "rider_profile" ? "Rider Assessment" : 
                     settingsView === "ftp" ? "Engine Benchmark" : 
                     settingsView === "goal" ? "Goal & Ambition" : 
                     settingsView === "training_method" ? "Training Setup" : 
                     settingsView === "workout_library" ? "Workout Library" : ""}
                  </h2>
                </div>
              )}

              <div className="flex flex-col pb-2 px-1">
                {settingsView === "main" && (
                  <div className="flex flex-col gap-2.5">
                    {/* Firebase Cloud Sync & User Profile */}
                    <FirebaseAuthCard 
                      currentUser={currentUser} 
                      cloudSyncStatus={cloudSyncStatus} 
                      lastSyncedAt={lastSyncedAt} 
                    />

                    <button 
                      onClick={() => setSettingsView("rider_profile")}
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
                      onClick={() => setSettingsView("goal")}
                      className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-emerald-500/10 shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"><Target size={20} /></div>
                        <div className="text-left">
                          <p className="text-[11px] font-black text-white uppercase tracking-widest">Your Goal</p>
                          <p className="text-[10px] text-slate-500 font-bold italic truncate max-w-[180px]">\"{userGoal}\"</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
                    </button>

                    <button 
                      onClick={() => setSettingsView("ftp")}
                      className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-orange-500/10 shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400"><Zap size={20} /></div>
                        <div className="text-left">
                          <p className="text-[11px] font-black text-white uppercase tracking-widest">Engine Benchmark</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{ftp ? `${ftp}W FTP` : "Click to set"}</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-600 group-hover:text-orange-400 transition-colors" />
                    </button>

                    <button 
                      onClick={() => setSettingsView("training_method")}
                      className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-cyan-500/10 shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400"><Settings size={20} /></div>
                        <div className="text-left">
                          <p className="text-[11px] font-black text-white uppercase tracking-widest">Training Setup</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{trainingMethodology.replace("_", " ")} • {trainingMode}</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-600 group-hover:text-cyan-400 transition-colors" />
                    </button>

                    <button 
                      onClick={() => setSettingsView("workout_library")}
                      className="glass-card p-4 rounded-[1.3rem] flex items-center justify-between group active:scale-[0.98] transition-all border border-blue-500/10 shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400"><BookOpen size={20} /></div>
                        <div className="text-left">
                          <p className="text-[11px] font-black text-white uppercase tracking-widest">Workout Library</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Curated Training Catalog</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                    </button>
                    
                    <div className="mt-8 pt-4 border-t border-white/5">
                      <button 
                        onClick={handleLogout}
                        className="w-full glass-card p-4 rounded-2xl flex items-center justify-center gap-3 text-rose-500 hover:bg-rose-500/10 transition-all active:scale-[0.98] border border-rose-500/10 group"
                      >
                        <LogOut size={16} className="group-hover:translate-x-1 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Disconnect Account</span>
                      </button>
                    </div>
                  </div>
                )}

                {settingsView === "goal" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <p className="text-[11px] text-slate-400 leading-relaxed font-medium px-1">
                        waTTson adapts his coaching intensity, interval style, and recovery focus based on your current ambition.
                      </p>
                      <div className="space-y-3">
                        <label className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] ml-1">Current Ambition</label>
                        <textarea 
                          value={userGoal} 
                          onChange={(e) => setUserGoal(e.target.value)} 
                          className="w-full bg-slate-950/50 border border-white/10 rounded-[1.8rem] p-6 text-lg font-bold text-white outline-none focus:border-emerald-500/30 italic min-h-[140px] resize-none"
                          placeholder="Ex: Improve hill climb efficiency..."
                        />
                        <button 
                          onClick={() => { 
                            safeSetItem("wattson_goal", userGoal); 
                            if (currentUser) syncToCloud({ userGoal });
                            setSuggestion(null); 
                            setGeneratedWeeks([]);
                            setWeeklyBriefing(null);
                            fetchWeeklyBriefingData(undefined, true, undefined, undefined, 1);
                            setSettingsView("main");
                          }}
                          className="w-full py-5 bg-emerald-500 text-slate-950 font-black text-[10px] uppercase tracking-[0.2em] rounded-[1.5rem] shadow-xl active:scale-95 transition-all"
                        >
                          Update Engine Target
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {settingsView === "ftp" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <p className="text-[11px] text-slate-400 leading-relaxed font-medium px-1">
                        Your FTP (Functional Threshold Power) is the engine's core benchmark. While we sync this from Intervals.icu, you can override it here.
                      </p>
                      
                      <div className="bg-slate-950/50 p-8 rounded-[2rem] border border-white/5 flex flex-col items-center">
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-[0.2em] mb-4">Engine Value</span>
                        <div className="flex items-center gap-6">
                          <button 
                            onClick={() => {
                              const newVal = Math.max(0, (ftp || 200) - 5);
                              setFtp(newVal);
                              safeSetItem("wattson_ftp", newVal.toString());
                            }}
                            className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:bg-white/10 border border-white/5"
                          >
                            <ChevronLeft size={24} />
                          </button>
                          <div className="flex flex-col items-center min-w-[100px]">
                            <span className="text-5xl font-black italic text-white tracking-tighter">{ftp || "---"}</span>
                            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mt-1">Watts</span>
                          </div>
                          <button 
                            onClick={() => {
                              const newVal = (ftp || 200) + 5;
                              setFtp(newVal);
                              safeSetItem("wattson_ftp", newVal.toString());
                            }}
                            className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:bg-white/10 border border-white/5"
                          >
                            <ChevronRight size={24} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settingsView === "rider_profile" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 px-1">
                    {isLoadingProfile ? (
                      <div className="glass-card p-12 rounded-[2rem] flex flex-col items-center justify-center text-center">
                        <div className="w-10 h-10 rounded-full border-t-2 border-emerald-500 animate-spin mb-4" />
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Generating Profile...</p>
                        <p className="text-[9px] text-slate-500 font-medium mt-1">Analyzing performance trends</p>
                      </div>
                    ) : userProfile ? (
                      <div className="space-y-6">
                        {/* Compact Cyclist Archetype Hero */}
                        <div className="bg-gradient-to-r from-emerald-500/10 to-slate-950/40 p-4 rounded-2xl border border-emerald-500/15 flex items-center justify-between gap-4 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6" />
                          <div className="min-w-0 flex-1">
                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.2em] block mb-0.5">CYCLIST ARCHETYPE</span>
                            <h3 className="text-sm sm:text-base font-black text-white italic uppercase tracking-tight leading-tight">
                              {userProfile.athlete_type}
                            </h3>
                          </div>
                        </div>

                        {/* Power Curve Analysis */}
                        <RiderPowerCurve 
                          powerCurves={powerCurves || []} 
                          athleteType={userProfile.athlete_type} 
                          ftp={ftp || undefined} 
                        />

                        {/* Visual Aerobic Efficiency & Decoupling Chart (EF & Pw:HR) */}
                        <AerobicEfficiencyDecouplingChart 
                          activities={activities || []} 
                          ftp={ftp || undefined} 
                        />

                        {/* Comments on Rider Type & Training Strategy */}
                        <div className="glass-card p-5 rounded-[1.8rem] border border-white/5 space-y-4">
                          <div>
                            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Sparkles size={12} className="text-emerald-400" />
                              Coaching Insights & Training Blueprint
                            </h4>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                              Expert analysis of your physiological engine and training stimulus adaptation
                            </p>
                          </div>

                          <div className="space-y-4 pt-1">
                            {/* Comment on Rider Type */}
                            <div className="space-y-1.5">
                              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Rider Type Analysis
                              </span>
                              <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                                {userProfile.rider_story ? (
                                  userProfile.rider_story.trim().replace(/^["|\\']+|["|\\']+$/g, '')
                                ) : (
                                  `As a ${userProfile.athlete_type}, you possess a distinctive physiological footprint. Your training adaptation response indicates high capacity for development with structured training.`
                                )}
                              </p>
                            </div>

                            {/* Split Divider */}
                            <div className="h-px bg-white/5" />

                            {/* How to Train to Become Better */}
                            <div className="space-y-2">
                              <span className="text-[8px] font-black text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                How to Train to Become Better
                              </span>
                              
                              {userProfile.recommended_focus && (
                                <p className="text-[11px] text-slate-300 leading-relaxed font-semibold italic bg-slate-950/30 p-3 rounded-xl border border-white/5">
                                  {userProfile.recommended_focus}
                                </p>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                {userProfile.effective_methods && userProfile.effective_methods.length > 0 && (
                                  <div className="space-y-1">
                                    <span className="text-[8px] font-black text-emerald-500 uppercase tracking-wider block mb-1">✓ Recommended Stimuli</span>
                                    <ul className="text-[10.5px] text-slate-400 font-semibold space-y-1">
                                      {userProfile.effective_methods.slice(0, 3).map((m, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                          <span className="text-emerald-500 select-none shrink-0">•</span>
                                          <span>{m}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {userProfile.areas_for_improvement && userProfile.areas_for_improvement.length > 0 && (
                                  <div className="space-y-1">
                                    <span className="text-[8px] font-black text-rose-400 uppercase tracking-wider block mb-1">⚠ Focus Areas</span>
                                    <ul className="text-[10.5px] text-slate-400 font-semibold space-y-1">
                                      {userProfile.areas_for_improvement.slice(0, 3).map((a, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                          <span className="text-rose-400 select-none shrink-0">•</span>
                                          <span>{a}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="glass-card p-10 rounded-[2rem] text-center border border-white/5">
                        <p className="text-[11px] text-slate-400 font-medium">Not enough data to form an assessment yet.</p>
                      </div>
                    )}
                  </div>
                )}

                {settingsView === "training_method" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 px-1">
                    <div className="flex bg-slate-950/60 p-1.5 rounded-2xl border border-white/5">
                      <button
                        onClick={() => setMethodologyTab("selection")}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          methodologyTab === "selection" 
                            ? "bg-cyan-500 text-slate-950 shadow-md" 
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Setup
                      </button>
                      <button
                        onClick={() => {
                          setMethodologyTab("review");
                          if (!threeMonthReview && !isLoadingThreeMonthReview && activities) {
                            handleFetchThreeMonthReview();
                          }
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          methodologyTab === "review" 
                            ? "bg-cyan-500 text-slate-950 shadow-md" 
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Review
                      </button>
                    </div>

                    {methodologyTab === "selection" && (
                      <div className="space-y-6">
                        <div className="bg-slate-950/40 p-5 rounded-[1.8rem] border border-white/5 space-y-4">
                          <div className="flex flex-col gap-1 px-1">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Training Mode</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Session distribution target</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {(["cycling", "triathlon", "running"]).map((mode) => {
                              const isSelected = trainingMode === mode;
                              return (
                                <button
                                  key={mode}
                                  onClick={() => {
                                    setTrainingMode(mode as TrainingMode);
                                    localStorage.setItem("wattson_training_mode", mode);
                                    setGeneratedWeeks([]);
                                    setWeeklyBriefing(null);
                                    fetchWeeklyBriefingData(undefined, true, undefined, mode as TrainingMode, 1);
                                  }}
                                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                                    isSelected
                                      ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                                      : "bg-white/[0.02] border-white/5 text-slate-500 hover:text-slate-300"
                                  }`}
                                >
                                  <span className="text-[10px] font-black uppercase tracking-widest">{mode === "triathlon" ? "TRI" : mode === "running" ? "RUN" : "CYC"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="bg-slate-950/40 p-5 rounded-[1.8rem] border border-white/5 space-y-4">
                          <div className="flex flex-col gap-1 px-1">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Methodology</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Interval style preference</span>
                          </div>
                          <div className="space-y-2">
                            {["polarized", "pyramidal", "norwegian"].map((m) => {
                              const isSelected = trainingMethodology === m;
                              return (
                                <button
                                  key={m}
                                  onClick={() => {
                                    setTrainingMethodology(m as TrainingMethodology);
                                    localStorage.setItem("wattson_training_methodology", m);
                                    setGeneratedWeeks([]);
                                    setWeeklyBriefing(null);
                                    fetchWeeklyBriefingData(undefined, true, undefined, undefined, 1);
                                  }}
                                  className={`w-full p-4 rounded-2xl border text-left transition-all active:scale-[0.98] flex items-center justify-between ${
                                    isSelected
                                      ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                                      : "bg-white/[0.02] border-white/5 text-slate-500 hover:text-slate-300"
                                  }`}
                                >
                                  <span className="text-[11px] font-black uppercase tracking-widest">{m.replace("_", " ")}</span>
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"></div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {methodologyTab === "review" && (
                      <div className="space-y-4">
                        {isLoadingThreeMonthReview ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                            <Loader2 size={28} className="text-cyan-400 animate-spin" />
                            <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Analyzing 90-Day Training Data...</p>
                            <p className="text-[9px] text-slate-500 font-medium">Evaluating TSS, volume trends, and goal progression</p>
                          </div>
                        ) : threeMonthReview ? (
                          <div className="space-y-4">
                            <div className="p-5 rounded-3xl bg-slate-950/60 border border-white/5 space-y-5">
                              {/* Header & Status */}
                              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">90-Day Progress</span>
                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                                  threeMonthReview.status === "on_track" 
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                }`}>
                                  {threeMonthReview.status === "on_track" ? "On Track" : "Needs Adjustment"}
                                </span>
                              </div>

                              {/* Headline */}
                              <div className="space-y-1">
                                <p className="text-[12px] text-slate-200 leading-relaxed font-black italic">
                                  "{threeMonthReview.headline}"
                                </p>
                              </div>

                              {/* Period Stats Row */}
                              {threeMonthReview.period_stats && (
                                <div className="grid grid-cols-3 gap-2 bg-slate-900/40 p-3 rounded-2xl border border-white/5 text-center">
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Volume</span>
                                    <span className="text-[12px] font-black text-white italic font-mono">{threeMonthReview.period_stats.total_hours}h</span>
                                  </div>
                                  <div className="flex flex-col border-x border-white/5">
                                    <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Total TSS</span>
                                    <span className="text-[12px] font-black text-white italic font-mono">{threeMonthReview.period_stats.total_tss}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Avg/Wk</span>
                                    <span className="text-[12px] font-black text-white italic font-mono">{threeMonthReview.period_stats.avg_tss_per_week}</span>
                                  </div>
                                </div>
                              )}

                              {/* What's Going Well (Good things based on data) */}
                              <div className="space-y-2 bg-emerald-950/10 border border-emerald-500/10 rounded-2xl p-4">
                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                  👍 WHAT'S GOING WELL
                                </span>
                                {threeMonthReview.good_things_achieved && threeMonthReview.good_things_achieved.length > 0 ? (
                                  <ul className="space-y-1.5 text-left">
                                    {threeMonthReview.good_things_achieved.map((good, idx) => (
                                      <li key={idx} className="flex items-start gap-2 text-[10.5px] text-slate-300 font-medium leading-relaxed">
                                        <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
                                        <span>{good}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[10.5px] text-slate-400 font-medium">
                                    Your consistent weekly ride frequency demonstrates superb dedication and provides a robust foundation for building high-level aerobic efficiency.
                                  </p>
                                )}
                              </div>

                              {/* Goal Contribution */}
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                                  🎯 Goal Compatibility
                                </span>
                                <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                                  {threeMonthReview.contributing_to_goal}
                                </p>
                              </div>

                              {/* Intensity Distribution */}
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                                  📊 Intensity Analysis
                                </span>
                                <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                                  {threeMonthReview.intensity_distribution_summary}
                                </p>
                              </div>

                              {/* Needed Changes (Recommended Adjustments) */}
                              <div className="space-y-2.5 pt-1 border-t border-white/5">
                                <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider block">
                                  🛠️ Recommended Adjustments
                                </span>
                                <div className="space-y-2 text-left">
                                  {threeMonthReview.needed_changes.map((change, idx) => (
                                    <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                      <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                                        {idx + 1}
                                      </span>
                                      <div className="flex-1 text-[10.5px] text-slate-300 font-medium leading-relaxed">
                                        {change}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            
                            <button
                              onClick={() => handleFetchThreeMonthReview(true)}
                              className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/5 active:scale-95"
                            >
                              <RefreshCw size={12} /> Refresh Analysis
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-8 space-y-3">
                            <p className="text-[11px] text-slate-400 font-medium">No 3-month review generated yet.</p>
                            <button
                              onClick={() => handleFetchThreeMonthReview(true)}
                              className="px-4 py-2 bg-cyan-500 text-slate-950 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md hover:bg-cyan-400 transition-all active:scale-95"
                            >
                              Run Analysis
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {settingsView === "workout_library" && (
                  <WorkoutLibrary
                    ftp={ftp || 250}
                    creds={creds!}
                    onApplyAsSuggestion={handleApplyLibraryWorkout}
                    onClose={() => setSettingsView("main")}
                  />
                )}
              </div>
        </div>

      </div>

    {showGoalEditor && (
        <div className="fixed inset-0 z-[210] bg-slate-950/98 backdrop-blur-3xl flex flex-col p-8 animate-in slide-in-from-bottom-4 duration-400" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-between mb-8 mt-2">
            <h2 className="text-2xl text-header italic uppercase leading-none">DNA Focus</h2>
            <button onClick={() => setShowGoalEditor(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-500"><Settings size={20} /></button>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Define your primary ambition for the coaching engine.</p>
          <textarea 
            value={userGoal} 
            onChange={(e) => setUserGoal(e.target.value)} 
            className="w-full bg-slate-900/50 border border-white/10 rounded-[2rem] p-6 text-lg font-bold text-white outline-none focus:border-emerald-500/30 flex-1 mb-8 italic"
            placeholder="Ex: Improve hill climb efficiency..."
          />
          <button 
            onClick={() => { 
              safeSetItem('wattson_goal', userGoal); 
              if (currentUser) syncToCloud({ userGoal });
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
                     isEnduranceWorkout(currentWorkout) ? (
                       <VisualProfileChart 
                         steps={currentWorkout.workout_steps} 
                         currentFtp={ftp || undefined}
                         originalFtp={weeklyBriefing?.ftp}
                       />
                     ) : (
                       <GroupedWorkoutStepsList 
                         steps={currentWorkout.workout_steps}
                         currentFtp={ftp || undefined}
                         originalFtp={weeklyBriefing?.ftp}
                         fontSize="base"
                       />
                     )
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

          const currentFtp = ftp || 250;
          const isRest = (() => {
            const f = (selectedSuggestedDay.focus || '').toLowerCase();
            const i = (selectedSuggestedDay.intensity || '').toLowerCase();
            return f.includes('rest') || i === 'rest' || selectedSuggestedDay.load_target === 0;
          })();

          const targetWattsDisplay = (() => {
            if (isRest) return 'Rest';
            
            // Check if there are structured workout steps
            if (selectedSuggestedDay.workout_steps && selectedSuggestedDay.workout_steps.length > 0) {
              const steps = selectedSuggestedDay.workout_steps;
              // Filter steps that have power target or percent
              const validSteps = steps.filter((s: any) => (s.target_pct && s.target_pct > 0) || (s.target_watts && s.target_watts > 0));
              if (validSteps.length > 0) {
                // Find main work step (highest duration, or if equal, highest target)
                const sorted = [...validSteps].sort((a, b) => (b.duration - a.duration) || ((b.target_pct || 0) - (a.target_pct || 0)));
                const mainStep = sorted[0];
                if (mainStep.target_pct && mainStep.target_pct > 0) {
                  return `${Math.round(mainStep.target_pct * currentFtp)}W`;
                }
                if (mainStep.target_watts && mainStep.target_watts > 0) {
                  const baseFtp = weeklyBriefing?.ftp || 250;
                  const ratio = currentFtp / baseFtp;
                  return `${Math.round(mainStep.target_watts * ratio)}W`;
                }
              }
            }

            // Fallback by zone and user's FTP
            const f = (selectedSuggestedDay.focus || '').toLowerCase();
            if (f.includes('endurance') || f.includes('base') || f.includes('aerobic') || f.includes('zone 2') || f.includes('z2')) {
              return `${Math.round(currentFtp * 0.67)}W`; // ~201W for 300W FTP
            }
            if (f.includes('recovery') || f.includes('recup') || f.includes('spin') || f.includes('flush')) {
              return `${Math.round(currentFtp * 0.52)}W`; // ~156W for 300W FTP
            }
            if (f.includes('tempo')) {
              return `${Math.round(currentFtp * 0.82)}W`; // ~246W for 300W FTP
            }
            if (f.includes('sweet spot') || f.includes('sst')) {
              return `${Math.round(currentFtp * 0.90)}W`; // ~270W for 300W FTP
            }
            if (f.includes('threshold') || f.includes('ftp')) {
              return `${Math.round(currentFtp * 1.00)}W`; // ~300W for 300W FTP
            }
            if (f.includes('vo2')) {
              return `${Math.round(currentFtp * 1.15)}W`; // ~345W for 300W FTP
            }
            if (f.includes('anaerobic') || f.includes('sprint')) {
              return `${Math.round(currentFtp * 1.30)}W`; // ~390W for 300W FTP
            }
            return `${Math.round(currentFtp * 0.67)}W`;
          })();

          // Calibrated load target for display
          const displayLoadTarget = (() => {
            if (isRest) return 0;
            if (selectedSuggestedDay.load_target && selectedSuggestedDay.load_target > 0) {
              return selectedSuggestedDay.load_target;
            }
            const dur = selectedSuggestedDay.duration_target || 60;
            const f = (selectedSuggestedDay.focus || '').toLowerCase();
            if (f.includes('endurance') || f.includes('base') || f.includes('aerobic')) {
              return Math.round(dur * (60 / 90)); // ~60 TSS for 90m
            }
            if (f.includes('recovery')) return Math.round(dur * 0.35);
            return Math.round(dur * 0.75);
          })();

          return (
            <div className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={() => setSelectedSuggestedDay(null)}>
              <div className="bg-[#0c0e15] border-t sm:border border-white/10 w-full sm:max-w-md h-[100dvh] sm:h-auto sm:max-h-[88dvh] rounded-none sm:rounded-[2.2rem] p-5 sm:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] sm:shadow-2xl flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
                
                {/* Mobile drag handle */}
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 shrink-0 sm:hidden" />

                {/* Header */}
                <div className="flex items-center justify-between shrink-0 mb-3 pb-3 border-b border-white/5">
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px] tracking-wider uppercase shrink-0">
                      {weekday} {dayNum}
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-white italic tracking-tight uppercase truncate">
                      {formatPlannedRideTitle(selectedSuggestedDay.focus)}
                    </h3>
                  </div>
                  <button onClick={() => setSelectedSuggestedDay(null)} className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors shrink-0">
                    <X size={18} />
                  </button>
                </div>

                {/* Scrollable body content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 space-y-3.5">
                  {isReworking ? (
                    <div className="w-full py-8 flex flex-col items-center justify-center bg-white/[0.02] rounded-2xl border border-white/5 text-center px-4">
                      <Loader2 size={22} className="animate-spin text-emerald-400 mb-2.5" />
                      <span className="text-[11px] font-black text-white uppercase tracking-wider mb-1">Calibrating Workout...</span>
                      <span className="text-[9px] font-medium text-slate-400">Applying custom adjustments</span>
                    </div>
                  ) : (
                    <>
                      {/* Compact Metrics Strip */}
                      <div className="grid grid-cols-3 gap-2 p-3 bg-white/[0.03] border border-white/5 rounded-2xl">
                        <div className="flex flex-col items-center justify-center text-center">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Clock size={11} className="text-blue-400" /> Duration
                          </span>
                          <span className="text-xs sm:text-sm font-black text-white mt-0.5">
                            {isRest || selectedSuggestedDay.duration_target <= 0 ? '—' : `${selectedSuggestedDay.duration_target} MIN`}
                          </span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center border-x border-white/5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Zap size={11} fill="currentColor" className="text-amber-400" /> Load
                          </span>
                          <span className="text-xs sm:text-sm font-black text-amber-400 mt-0.5">
                            {isRest || displayLoadTarget <= 0 ? '—' : `${displayLoadTarget} TSS`}
                          </span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <ActivityIcon size={11} className="text-emerald-400" /> Target
                          </span>
                          <span className="text-xs sm:text-sm font-black text-emerald-400 mt-0.5 uppercase">
                            {targetWattsDisplay}
                          </span>
                        </div>
                      </div>

                      {isRest ? (
                        <div className="space-y-3">
                          <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shrink-0">
                              <Coffee size={20} className="animate-pulse text-emerald-400" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Recovery Day</span>
                              <p className="text-[11px] text-slate-300 font-medium leading-tight mt-0.5">
                                No power targets today. Allow muscle fibers to adapt and rebuild.
                              </p>
                            </div>
                          </div>

                          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3.5 space-y-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block border-b border-white/5 pb-1.5">Recovery Focus</span>
                            <div className="grid grid-cols-1 gap-2 text-left">
                              <div className="flex items-start gap-2">
                                <span className="text-emerald-400 text-xs mt-0.5">🧘</span>
                                <div className="flex flex-col">
                                   <span className="text-[11px] font-bold text-slate-200">Muscle Repair</span>
                                  <span className="text-[10px] text-slate-400 font-normal">Elevate legs, practice dynamic stretching or light foam rolling.</span>
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-emerald-400 text-xs mt-0.5">💧</span>
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-bold text-slate-200">Nutrition & Hydration</span>
                                  <span className="text-[10px] text-slate-400 font-normal">Prioritize clean protein and electrolytes to rebuild glycogen stores.</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {selectedSuggestedDay.why && (
                            <p className="text-xs text-slate-300 leading-relaxed italic text-center px-2 font-medium opacity-90">
                              "{selectedSuggestedDay.why}"
                            </p>
                          )}

                          <div className="bg-purple-500/5 border-l-2 border-purple-400/80 rounded-r-2xl p-3.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-purple-400">
                              <Sparkles size={12} className="animate-pulse" />
                              <span className="text-[9.5px] font-black uppercase tracking-widest">waTTson Coach Insight</span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                              {getCoachingInsight(selectedSuggestedDay, userProfile, userGoal)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedSuggestedDay.why && (
                            <p className="text-xs text-slate-300 leading-relaxed text-center px-2 font-medium italic">
                              "{selectedSuggestedDay.why}"
                            </p>
                          )}

                          <div className="space-y-3 py-1 max-h-[240px] overflow-y-auto custom-scrollbar">
                            {selectedSuggestedDay.workout_steps && selectedSuggestedDay.workout_steps.length > 0 ? (
                              isEnduranceWorkout(selectedSuggestedDay) ? (
                                <VisualProfileChart 
                                  steps={selectedSuggestedDay.workout_steps}
                                  currentFtp={ftp || undefined}
                                  originalFtp={weeklyBriefing?.ftp}
                                />
                              ) : (
                                <GroupedWorkoutStepsList 
                                  steps={selectedSuggestedDay.workout_steps}
                                  currentFtp={ftp || undefined}
                                  originalFtp={weeklyBriefing?.ftp}
                                  fontSize="sm"
                                />
                              )
                            ) : null}
                          </div>

                          <div className="bg-purple-500/5 border-l-2 border-purple-400/80 rounded-r-2xl p-3.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-purple-400">
                              <Sparkles size={12} className="animate-pulse" />
                              <span className="text-[9.5px] font-black uppercase tracking-widest">waTTson Coach Insight</span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                              {getCoachingInsight(selectedSuggestedDay, userProfile, userGoal)}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer close button */}
                <div className="pt-3 shrink-0 border-t border-white/5 mt-auto">
                  <button 
                    onClick={() => setSelectedSuggestedDay(null)}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
      })()}

      {/* Past Ride Detail Modal */}
      {selectedActivity && creds && (
        <CoachingModal 
          activity={selectedActivity} 
          creds={creds} 
          onClose={() => setSelectedActivity(null)} 
          userGoal={userGoal} 
          ftp={ftp || undefined}
          allActivities={activities || undefined}
        />
      )}

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
                    <Sparkles size={11} /> Plan Engine
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-white italic tracking-tight uppercase">
                    Active Directives
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Custom directives guiding your plan
                  </p>
                </div>

                {(() => {
                  const activeDirectivesList = parsePlanDirectives(planContext);
                  
                  if (activeDirectivesList.length > 0) {
                    return (
                      <div className="space-y-3">
                        <div className="space-y-2 max-h-48 sm:max-h-60 overflow-y-auto custom-scrollbar p-1">
                          {activeDirectivesList.map((dirObj, idx) => {
                            const isToday = dirObj.requestedAt === getTodayDateString();
                            const dateDisplay = isToday ? 'Today' : dirObj.requestedAt;
                            return (
                              <div 
                                key={dirObj.id || `${idx}-${dirObj.text}`}
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
                                          updated[idx] = { ...updated[idx], text: editingDirectiveText.trim() };
                                          const { active } = pruneExpiredDirectives(updated);
                                          const newContext = serializePlanDirectives(active);
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
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-xs text-slate-200 font-medium leading-snug break-words">
                                          {dirObj.text}
                                        </span>
                                        <span className="text-[9px] font-semibold text-emerald-400/80 mt-1 flex items-center gap-1">
                                          Requested: {dateDisplay}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() => {
                                          setEditingDirectiveIdx(idx);
                                          setEditingDirectiveText(dirObj.text);
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
                                            const { active } = pruneExpiredDirectives(updated);
                                            const newContext = serializePlanDirectives(active);
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
                            );
                          })}
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
                        "{getDirectivesTextList(parsePlanDirectives(planContext)).join(' ; ')}"
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
                     isEnduranceWorkout(currentWorkout) ? (
                       <VisualProfileChart 
                         steps={currentWorkout.workout_steps} 
                         currentFtp={ftp || undefined}
                         originalFtp={weeklyBriefing?.ftp}
                       />
                     ) : (
                       <GroupedWorkoutStepsList 
                         steps={currentWorkout.workout_steps}
                         currentFtp={ftp || undefined}
                         originalFtp={weeklyBriefing?.ftp}
                         fontSize="sm"
                       />
                     )
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
      <MonthlyReportModal
        isOpen={showMonthlyReport}
        onClose={() => setShowMonthlyReport(false)}
        activities={activities || []}
        ftp={ftp}
      />

      {/* Floating Modern Navigation Dock */}
      {!isKeyboardOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[340px] bg-slate-950/80 backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-1 shadow-[0_8px_32px_rgba(0,0,0,0.7)] flex items-center justify-between gap-1">
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
                className="relative flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-200 active:scale-95 group overflow-hidden"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-emerald-500/10 border border-emerald-500/25 rounded-xl"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon 
                  size={16} 
                  className={`transition-colors duration-200 ${
                    isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-white'
                  }`} 
                />
                <span 
                  className={`text-[8.5px] uppercase tracking-wider transition-all duration-200 ${
                    isActive ? 'text-emerald-400 font-black' : 'text-slate-500 group-hover:text-slate-300 font-medium'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default App;
