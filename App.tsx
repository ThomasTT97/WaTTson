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
  ThreeMonthReview,
  formatDuration
} from './types';
import { fetchActivities, fetchWellness, fetchAthleteId, fetchAthleteProfile, getAnnualPowerCurves, uploadWorkout } from './services/intervalsService';
import { getDailySuggestion, sendChatMessage, getWeeklyBriefing, analyzeUserProfile, analyzeThreeMonthReview, normalizeBriefingDays } from './services/geminiService';
import { 
  PlanDirective, 
  parsePlanDirectives, 
  serializePlanDirectives, 
  getDirectivesTextList, 
  pruneExpiredDirectives, 
  getTodayDateString,
  normalizeWeekdayToken,
  harmonizeBriefingWithAvailability
} from './services/directiveService';
import { ActivityCard } from './components/ActivityCard';
import { RiderPowerCurve } from './components/RiderPowerCurve';
import { AerobicEfficiencyDecouplingChart } from './components/AerobicEfficiencyDecouplingChart';
import { SuggestedWorkoutCard, formatPlannedRideTitle } from './components/SuggestedWorkoutCard';
import { CoachingModal } from './components/CoachingModal';
import { ChangelogModal } from './components/ChangelogModal';
import { ChatWindow } from './components/ChatWindow';
import { WorkoutLibrary } from './components/WorkoutLibrary';
import { MethodologyInfo } from './components/MethodologyInfo';
import { 
  PlanAndChangeModal, 
  DayDurationItem, 
  formatDurationDisplay, 
  parseScheduleDirective, 
  AVAILABILITY_STORAGE_KEY 
} from './components/PlanAndChangeModal';
import { LibraryWorkout } from './services/workoutLibrary';
import { generateDataDrivenRestRationale } from './services/restRationaleService';
import { StepLabel, getStepPhaseLabel, GroupedWorkoutStepsList, scaleLabelWatts, isEnduranceWorkout, VisualProfileChart, calculateWorkoutAverageWatts } from './components/StepLabel';
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

export const getISOWeekNumber = (date: Date): { week: number; year: number } => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
};

export const getWeekRange = (calendarOffset: number) => {
  const now = new Date();
  const currentDay = now.getDay();
  const daysSinceMonday = (currentDay + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday + (calendarOffset * 7), 0, 0, 0, 0);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
  return { start: monday, end: sunday };
};

export const getMonthRange = (calendarOffset: number) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + calendarOffset, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + calendarOffset + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const CHAT_SUGGESTIONS: string[] = [
  "What's planned for coming days?",
  "What should I do today?",
  "Review yesterday & past days",
  "Current readiness & load",
  "Efficiency trend"
];

export const getChatStorageKey = (uid?: string | null): string => {
  if (uid) return `wattson_chat_history_${uid}`;
  return 'wattson_chat_history_guest';
};

export const getChatClearedKey = (uid?: string | null): string => {
  if (uid) return `wattson_chat_cleared_${uid}`;
  return 'wattson_chat_cleared_guest';
};

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
      const savedCtx = localStorage.getItem('wattson_plan_context');
      const userFtp = Number(localStorage.getItem('wattson_ftp')) || 250;
      if (saved) {
        const parsed = JSON.parse(saved);
        return harmonizeBriefingWithAvailability(normalizeBriefingDays(parsed, savedCtx), savedCtx, userFtp);
      } else {
        const storedAvail = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
        if (storedAvail) {
          return harmonizeBriefingWithAvailability(null, savedCtx, userFtp);
        }
      }
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
  const [visiblePastCount, setVisiblePastCount] = useState<number>(25);

  useEffect(() => {
    if (!window.visualViewport) return;
    const handleResize = () => {
      if (window.visualViewport) {
        setIsKeyboardOpen(window.visualViewport.height < window.innerHeight - 100);
      }
    };
    window.visualViewport.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

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
  const [insightsPeriod, setInsightsPeriod] = useState<'week' | 'month' | '6months' | 'year' | 'season'>('month');
  const [selectedSeasonYear, setSelectedSeasonYear] = useState(new Date().getFullYear());
  const [selectedWeekOffset, setSelectedWeekOffset] = useState<number>(0);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<number>(0);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const lastWheelTimeRef = useRef<number>(0);

  const navigatePeriod = useCallback((dir: -1 | 1) => {
    if (insightsPeriod === 'week') {
      setSelectedWeekOffset(prev => (dir > 0 ? Math.min(0, prev + 1) : prev - 1));
    } else if (insightsPeriod === 'month') {
      setSelectedMonthOffset(prev => (dir > 0 ? Math.min(0, prev + 1) : prev - 1));
    } else if (insightsPeriod === 'season') {
      const currentYear = new Date().getFullYear();
      setSelectedSeasonYear(prev => (dir > 0 ? Math.min(currentYear, prev + 1) : prev - 1));
    }
  }, [insightsPeriod]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (deltaX > 0) {
        navigatePeriod(-1);
      } else {
        navigatePeriod(1);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 220) return;
    if (Math.abs(e.deltaX) > 20 || Math.abs(e.deltaY) > 25) {
      const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const val = isHorizontal ? e.deltaX : e.deltaY;
      const dir: -1 | 1 = val > 0 ? 1 : -1;
      navigatePeriod(dir);
      lastWheelTimeRef.current = now;
    }
  };
  
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
  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    if (showInsights) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [showInsights]);

  useEffect(() => {
    if (!showInsights) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowInsights(false);
      } else if (e.key === 'ArrowLeft') {
        navigatePeriod(-1);
      } else if (e.key === 'ArrowRight') {
        navigatePeriod(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showInsights, navigatePeriod]);
  const [showAdditionalStats, setShowAdditionalStats] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<'main' | 'goal' | 'data' | 'rider_profile' | 'training_method' | 'ftp' | 'workout_library'>('main');
  const [riderProfileTab, setRiderProfileTab] = useState<'dna' | 'power' | 'aerobic'>('dna');
  const [userProfile, setUserProfile] = useState<UserProfileAnalysis | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Text condensing helpers to prevent text walls and keep UI clean & minimalistic
  const condenseText = (text: string | undefined | null, maxSentences: number = 2): string => {
    if (!text) return '';
    const clean = text.trim().replace(/^["']+|["']+$/g, '');
    const sentences = clean.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > maxSentences) {
      return sentences.slice(0, maxSentences).join(' ').trim();
    }
    return clean;
  };

  const condenseBullet = (text: string | undefined | null, maxWords: number = 16): string => {
    if (!text) return '';
    const clean = text.trim().replace(/^["'•\-*✓\d.]+\s*/g, '');
    const words = clean.split(/\s+/);
    if (words.length <= maxWords) return clean;
    return words.slice(0, maxWords).join(' ') + '...';
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
      const lastUid = typeof window !== 'undefined' ? localStorage.getItem('wattson_auth_user_id') : null;
      const targetKey = getChatStorageKey(lastUid);
      const saved = localStorage.getItem(targetKey) || localStorage.getItem('wattson_chat_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [confirmClear, setConfirmClear] = useState(false);
  const hasGreetedRef = useRef(false);

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

  const adaptBriefingWithSchedule = (
    currentBriefing: WeeklyBriefing | null | undefined,
    updatedDays: DayDurationItem[],
    userFtp: number = 250,
    currentStats?: any,
    recentActs?: Activity[] | null,
    wellnessList?: Wellness[] | null
  ): WeeklyBriefing => {
    const base: WeeklyBriefing = currentBriefing ? { ...currentBriefing } : {
      phase: 'Build / Aerobic Base',
      focus: 'Custom Training Schedule',
      outlook_summary: 'Personalized training week aligned with your custom availability schedule.',
      ftp: userFtp,
      days: []
    };

    const existingDays = base.days || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Compute day offsets for existing days
    const dayOffsets: number[] = [];
    let currentOffset = 0;
    let prevDayStr = '';
    existingDays.forEach((day, idx) => {
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

    const adaptedDays: WeeklyBriefing['days'] = [];

    // For week 1 (offsets 0 to 6), map directly from updatedDays
    updatedDays.forEach((dayItem, i) => {
      // Force 1-29 min to 0 min (Rest)
      const requestedMins = (dayItem.durationMins > 0 && dayItem.durationMins < 30) ? 0 : dayItem.durationMins;
      const isRest = requestedMins <= 0;

      // Deterministic calendar day label from today + i e.g. "Wed (Nov 11)"
      const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const weekday = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayName = `${weekday} (${monthDay})`;

      // Find any existing day matching this weekday token or offset i
      const token = dayItem.dayShort.toLowerCase();
      const existingDay = existingDays.find(d => normalizeWeekdayToken(d.day) === token) || 
                          (dayOffsets.findIndex(offset => offset === i) !== -1 ? existingDays[dayOffsets.findIndex(offset => offset === i)] : undefined);

      if (isRest) {
        const restRationale = generateDataDrivenRestRationale({
          dayName,
          dayIndex: i,
          stats: currentStats,
          allDays: updatedDays.map(u => ({
            day: u.dayName || u.dayShort,
            focus: u.durationMins <= 0 ? 'Rest Day' : 'Workout',
            duration_target: u.durationMins,
            load_target: Math.round(u.durationMins * 0.7),
            intensity: u.durationMins <= 0 ? 'Rest' : 'Medium'
          })),
          recentActivities: recentActs,
          wellness: wellnessList
        });

        adaptedDays.push({
          day: dayName,
          focus: 'Rest Day',
          intensity: 'Rest',
          duration_target: 0,
          load_target: 0,
          why: restRationale.summaryQuote,
          workout_steps: []
        });
      } else {
        // If we have an existing workout on this day that wasn't Rest, preserve its focus and theme
        const hadExistingWorkout = existingDay && 
          existingDay.intensity !== 'Rest' && 
          !existingDay.focus.toLowerCase().includes('rest') &&
          (existingDay.duration_target || 0) > 0;

        if (hadExistingWorkout && existingDay) {
          const oldDur = existingDay.duration_target || 60;
          
          // Intelligent scaling: Adjust Easy steps, preserve Work steps
          const isWorkStep = (s: any) => {
            const pct = s.target_pct || (s.target_watts && userFtp ? s.target_watts / userFtp : 0);
            if (pct > 0.75) return true;
            const label = (s.label || '').toLowerCase();
            return /interval|rep|set|threshold|vo2|sweet|tempo|under|over/i.test(label) && !/recovery|rest|spin|easy/i.test(label);
          };

          const fillerSteps = (existingDay.workout_steps || []).filter(s => !isWorkStep(s));
          const fillerDuration = fillerSteps.reduce((sum, s) => sum + (s.duration || 0), 0);
          const diff = requestedMins - oldDur;

          let scaledSteps;
          if (existingDay.workout_steps && existingDay.workout_steps.length > 0) {
            if (fillerDuration > 0 && (diff > 0 || fillerDuration > Math.abs(diff))) {
              const fillerScale = (fillerDuration + diff) / fillerDuration;
              scaledSteps = existingDay.workout_steps.map(step => {
                if (isWorkStep(step)) return { ...step };
                const newDur = Math.max(1, Math.round(step.duration * fillerScale));
                return {
                  ...step,
                  duration: newDur,
                  label: step.label ? step.label.replace(/^\d+m\s*/, `${newDur}m `) : `${newDur}m Step`
                };
              });
            } else {
              const scale = requestedMins / oldDur;
              scaledSteps = existingDay.workout_steps.map(step => {
                const newDur = Math.max(1, Math.round(step.duration * scale));
                return {
                  ...step,
                  duration: newDur,
                  label: step.label ? step.label.replace(/^\d+m\s*/, `${newDur}m `) : `${newDur}m Step`
                };
              });
            }
          } else {
            scaledSteps = [
                { duration: Math.max(5, Math.round(requestedMins * 0.15)), target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: `${Math.max(5, Math.round(requestedMins * 0.15))}m Warm-up (55% FTP)` },
                { duration: Math.max(10, Math.round(requestedMins * 0.7)), target_pct: 0.68, target_watts: Math.round(userFtp * 0.68), label: `${Math.max(10, Math.round(requestedMins * 0.7))}m Aerobic Pace (68% FTP)` },
                { duration: Math.max(5, Math.round(requestedMins * 0.15)), target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: `${Math.max(5, Math.round(requestedMins * 0.15))}m Cool-down (55% FTP)` }
            ];
          }

          const sumStepDur = scaledSteps.reduce((sum, s) => sum + s.duration, 0);
          if (sumStepDur !== requestedMins && scaledSteps.length > 0) {
            const lastFillerIdx = [...scaledSteps].reverse().findIndex(s => !isWorkStep(s));
            const idx = lastFillerIdx !== -1 ? scaledSteps.length - 1 - lastFillerIdx : scaledSteps.length - 1;
            scaledSteps[idx].duration += (requestedMins - sumStepDur);
            scaledSteps[idx].label = scaledSteps[idx].label.replace(/^\d+m/, `${scaledSteps[idx].duration}m`);
          }

          adaptedDays.push({
            ...existingDay,
            day: dayName,
            focus: existingDay.focus,
            duration_target: requestedMins,
            load_target: Math.round((existingDay.load_target || Math.round(oldDur * 0.7)) * (requestedMins / oldDur)),
            workout_steps: scaledSteps,
            why: existingDay.why || 'Targeted aerobic development and progression.'
          });
        } else {
          let defaultFocus = `Endurance Ride (${formatDuration(requestedMins)})`;
          if (requestedMins >= 180) defaultFocus = `Endurance Ride (${formatDuration(requestedMins)})`;
          else if (requestedMins >= 120) defaultFocus = `Endurance Ride (${formatDuration(requestedMins)})`;
          else if (requestedMins >= 90) defaultFocus = `Endurance Ride (${formatDuration(requestedMins)})`;
          else if (requestedMins >= 60) defaultFocus = `Endurance Ride (${formatDuration(requestedMins)})`;
          else defaultFocus = `Recovery Spin (${formatDuration(requestedMins)})`;

          const defaultIntensity = requestedMins >= 75 ? 'Medium' : 'Easy';
          const warmMins = Math.max(5, Math.round(requestedMins * 0.15));
          const coolMins = Math.max(5, Math.round(requestedMins * 0.12));
          const mainMins = requestedMins - warmMins - coolMins;

          adaptedDays.push({
            day: dayName,
            focus: defaultFocus,
            intensity: defaultIntensity as any,
            duration_target: requestedMins,
            load_target: Math.round(requestedMins * (defaultIntensity === 'Medium' ? 0.72 : 0.62)),
            why: 'Aerobic base development and cardiovascular adaptation.',
            workout_steps: [
              { duration: warmMins, target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: `${warmMins}m Progressive Warm-up (55% FTP)` },
              { duration: mainMins, target_pct: 0.68, target_watts: Math.round(userFtp * 0.68), label: `${mainMins}m Steady Zone 2 (${Math.round(userFtp * 0.68)}W)` },
              { duration: coolMins, target_pct: 0.50, target_watts: Math.round(userFtp * 0.50), label: `${coolMins}m Easy Spin Cool-down (${Math.round(userFtp * 0.50)}W)` }
            ]
          });
        }
      }
    });

    const remainingDays = existingDays.filter((_, idx) => dayOffsets[idx] >= 7);

    return {
      ...base,
      ftp: userFtp,
      days: [...adaptedDays, ...remainingDays]
    };
  };

  const handleOAuthConnect = async (provider: 'strava' | 'intervals') => {
    try {
      const response = await fetch(`/api/auth/${provider}/url`);
      if (!response.ok) throw new Error(`Failed to initiate ${provider} auth`);
      const { url } = await response.json();
      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) alert('Please allow popups to connect your account.');
    } catch (error) {
      console.error('OAuth error:', error);
      setSyncError(`Failed to connect ${provider}`);
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        // Exchange code for tokens (would require a server endpoint)
        // For now, simulate success with demo credentials
        console.log('OAuth Success:', event.data);
        const { code, provider } = event.data;
        // In a real app, send code to server to exchange for tokens
        // For this task, we treat successful connection as triggering a reload or data fetch
        setSyncError(`Connected to ${provider}. Tokens would be exchanged here.`);
        // loadData(...) // Would need server-side token exchange implementation
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleApplyScheduleChange = (
    newTweakDirective: string,
    updatedDays?: DayDurationItem[],
    weekIndex?: number,
    switchTab = true
  ) => {
    const today = getTodayDateString();
    const parsed = parsePlanDirectives(planContext);
    
    const newDir: PlanDirective = {
      id: `dir_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      text: newTweakDirective.trim(),
      requestedAt: today,
    };

    // Filter out previous weekly schedule directives to avoid conflicting schedule rules
    const filteredParsed = parsed.filter(d => !d.text.toLowerCase().includes('weekly schedule'));
    const updatedDirectives = [...filteredParsed, newDir];
    const { active } = pruneExpiredDirectives(updatedDirectives, today);
    const newContext = serializePlanDirectives(active);

    setLastAppliedTweak(newTweakDirective.trim());
    setShowTweakSuccessNotice(false);
    setPlanContext(newContext);
    safeSetItem('wattson_plan_context', newContext);

    if (switchTab) {
      setActiveTab('rides');
    }

    // 1. Immediately adapt and harmonize weeklyBriefing to reflect user's requested durations and rest days!
    if (updatedDays && updatedDays.length > 0) {
      const adapted = adaptBriefingWithSchedule(weeklyBriefing, updatedDays, ftp || 250, stats, activities, wellnessData);
      const harmonized = harmonizeBriefingWithAvailability(adapted, newContext, ftp || 250);
      setWeeklyBriefing(harmonized);
      safeSetItem('wattson_saved_weekly_briefing', JSON.stringify(harmonized));
      if (currentUserRef.current) {
        syncToCloud({ weeklyBriefingJson: JSON.stringify(harmonized) });
      }

      // Persist last saved availability so when the screen is opened again, previous settings are remembered
      try {
        const totalMinutes = updatedDays.reduce((acc, d) => acc + d.durationMins, 0);
        const totalHours = (totalMinutes / 60).toFixed(1).replace('.0', '');
        const trainingDaysCount = updatedDays.filter(d => d.durationMins > 0).length;
        const restDaysCount = updatedDays.length - trainingDaysCount;
        const now = new Date();
        const record = {
          savedAt: now.toISOString(),
          formattedTime: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          totalMinutes,
          totalHours,
          trainingDaysCount,
          restDaysCount,
          directiveText: newTweakDirective.trim(),
          days: updatedDays.map(d => ({
            dayShort: d.dayShort,
            dayName: d.dayName,
            dateStr: d.dateStr,
            durationMins: d.durationMins,
            formattedDuration: formatDurationDisplay(d.durationMins)
          }))
        };
        safeSetItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(record));
      } catch (err) {
        console.warn('Failed to save availability record in App.tsx', err);
      }
    } else if (newTweakDirective.toLowerCase().includes('weekly schedule')) {
      const parsedRecord = parseScheduleDirective(newTweakDirective, today);
      if (parsedRecord) {
        safeSetItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(parsedRecord));
      }
    }

    // 2. Recalibrate in background while preserving weeklyBriefing continuity
    fetchWeeklyBriefingData(newContext, true, undefined, undefined, weekIndex || 1);
  };

  const handleAddTweakFromApp = (newTweakDirective: string, weekIndex?: number, switchTab = true) => {
    handleApplyScheduleChange(newTweakDirective, undefined, weekIndex, switchTab);
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
  const todayElementRef = useRef<HTMLDivElement>(null);
  const todayAndPastContainerRef = useRef<HTMLDivElement>(null);
  const [hidePlanHeader, setHidePlanHeader] = useState(false);
  
  const [userGoal, setUserGoal] = useState<string>(() => localStorage.getItem('wattson_goal') || 'Improve cycling performance');
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [methodologyInfo, setMethodologyInfo] = useState<TrainingMethodology | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
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
  const currentUserRef = useRef<FirebaseUser | null>(null);
  currentUserRef.current = currentUser;
  const userGoalRef = useRef(userGoal);
  userGoalRef.current = userGoal;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    const key = getChatStorageKey(currentUser?.uid);
    safeSetItem(key, JSON.stringify(messages));
    if (!currentUser) {
      safeSetItem('wattson_chat_history', JSON.stringify(messages));
    }
    if (messages.length > 0) {
      hasGreetedRef.current = true;
    }
  }, [messages, currentUser]);
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
  const extractLocalPreferencesToPush = useCallback((targetUserId?: string): { updates: Partial<UserCloudProfile>; hasPreferences: boolean } => {
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
    if (storedMethodology && ['polarized', 'pyramidal', 'norwegian'].includes(storedMethodology)) {
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

    // 7. Chat History - scoped per user
    const userChatKey = getChatStorageKey(targetUserId);
    const storedChat = localStorage.getItem(userChatKey) || (targetUserId ? null : localStorage.getItem('wattson_chat_history'));
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
      if (profile.chatHistoryJson !== undefined) {
        try {
          const parsedMessages = JSON.parse(profile.chatHistoryJson);
          if (Array.isArray(parsedMessages)) {
            const currentStr = JSON.stringify(messagesRef.current);
            if (currentStr !== profile.chatHistoryJson) {
              setMessages(parsedMessages);
              const activeUid = currentUserRef.current?.uid || profile.id;
              safeSetItem(getChatStorageKey(activeUid), profile.chatHistoryJson);
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
          const parsed = JSON.parse(profile.weeklyBriefingJson);
          const effectivePlanContext = profile.planContext || planContextRef.current;
          const harmonized = harmonizeBriefingWithAvailability(
            normalizeBriefingDays(parsed, effectivePlanContext),
            effectivePlanContext,
            profile.ftp || ftpRef.current || 250
          );
          const currentBriefingStr = weeklyBriefingRef.current ? JSON.stringify(weeklyBriefingRef.current) : '';
          const harmonizedStr = JSON.stringify(harmonized);
          if (currentBriefingStr !== harmonizedStr) {
            setWeeklyBriefing(harmonized);
            safeSetItem('wattson_saved_weekly_briefing', harmonizedStr);
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
      currentUserRef.current = user;
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

          const { updates: localUpdates, hasPreferences } = extractLocalPreferencesToPush(user.uid);
          const profile = await fetchUserCloudProfile(user.uid);

          if (profile) {
            // If the user already has a saved chat history in Firestore (even '[]' if cleared!),
            // preserve the cloud chat history so guest or another user's chat does not overwrite it!
            if (profile.chatHistoryJson !== undefined) {
              delete localUpdates.chatHistoryJson;
            }

            if (isUserLoggingIn && Object.keys(localUpdates).length > 0) {
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
        // When logged out, load the guest chat history (preserving the user's history in user storage & cloud!)
        try {
          const guestChat = localStorage.getItem('wattson_chat_history_guest') || localStorage.getItem('wattson_chat_history');
          if (guestChat) {
            const parsed = JSON.parse(guestChat);
            if (Array.isArray(parsed)) {
              setMessages(parsed);
            } else {
              setMessages([]);
            }
          } else {
            setMessages([]);
          }
        } catch {
          setMessages([]);
        }
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

      // 2. Fetch Activities (all training history, with graceful cache fallback)
      let fetchedActivities: Activity[] = [];
      try {
        fetchedActivities = await fetchActivities(activeCreds, 3650);
      } catch (e: any) {
        console.warn("Activities sync incomplete or failed, checking cache:", e);
        if (activities && activities.length > 0) {
          fetchedActivities = activities;
        } else {
          throw e; // rethrow if we have no activities to display
        }
      }

      // 3. Fetch Wellness (all training history up to 10 years)
      let fetchedWellness: Wellness[] = [];
      try {
        fetchedWellness = await fetchWellness(activeCreds, 3650);
      } catch (e: any) {
        console.warn("Wellness fetch failed, using cache:", e);
        fetchedWellness = wellnessData || [];
      }

      // 4. Fetch Power Curves (6-year power curve coverage including 2026, 2025, 2024, 2023, 2022, 2021)
      let curves: any[] = [];
      try {
        curves = await getAnnualPowerCurves(activeCreds, 6);
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
        weighted_average_watts: a.weighted_average_watts ?? a.icu_weighted_avg_watts ?? a.icu_weighted_average_watts,
        icu_weighted_average_watts: a.icu_weighted_average_watts ?? a.icu_weighted_avg_watts ?? a.weighted_average_watts,
        icu_weighted_avg_watts: a.icu_weighted_avg_watts ?? a.icu_weighted_average_watts ?? a.weighted_average_watts,
        average_heartrate: a.average_heartrate,
        max_heartrate: a.max_heartrate,
        icu_intensity: a.icu_intensity,
        icu_variability_index: a.icu_variability_index,
        icu_efficiency_factor: a.icu_efficiency_factor,
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

      // If initial load and we have history, greet the user ONLY if not previously cleared
      const activeUid = currentUserRef.current?.uid;
      const wasCleared = typeof window !== 'undefined' && localStorage.getItem(getChatClearedKey(activeUid));

      if (!isAuthLoading && !hasGreetedRef.current && !wasCleared && isInitial && fetchedActivities && fetchedActivities.length > 0 && messages.length === 0) {
        hasGreetedRef.current = true;
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
        
        const initialMsgs: ChatMessage[] = [{ role: 'model', text: introMsg }];
        setMessages(initialMsgs);
        safeSetItem(getChatStorageKey(activeUid), JSON.stringify(initialMsgs));
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
          const data = await getDailySuggestion(activities!, userGoal, hasRideToday, ftp || undefined, trainingMethodology, trainingMode);
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

      const data = await getWeeklyBriefing(activities, wellnessData, userGoal, startContext, ftp || undefined, powerCurves, ctxToUse || undefined, force, activeMode, activeTrainingMode, weekIndex, trainingMethodology, weeklyBriefing);
      const harmonizedData = harmonizeBriefingWithAvailability(data, ctxToUse, ftp || 250);
      setWeeklyBriefing(prev => {
        if (!prev) return harmonizedData;
        
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
          
          const newDays = [...daysBefore, ...harmonizedData.days, ...daysAfter];
          
          return harmonizeBriefingWithAvailability({ ...prev, days: newDays }, ctxToUse, ftp || 250);
        }
        return harmonizedData;
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

  // Immediate consistency check on startup: harmonize weeklyBriefing with saved availability
  useEffect(() => {
    const storedAvail = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
    const savedCtx = localStorage.getItem('wattson_plan_context');
    if (storedAvail || savedCtx || planContext) {
      setWeeklyBriefing(prev => {
        const harmonized = harmonizeBriefingWithAvailability(prev, savedCtx || planContext, ftp || 250);
        const prevStr = prev ? JSON.stringify(prev) : '';
        const harmonizedStr = JSON.stringify(harmonized);
        if (prevStr !== harmonizedStr) {
          safeSetItem('wattson_saved_weekly_briefing', harmonizedStr);
          if (currentUserRef.current) {
            syncToCloud({ weeklyBriefingJson: harmonizedStr });
          }
          return harmonized;
        }
        return prev;
      });
    }
  }, []);

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
      // Do NOT remove chat history keys here; chat history is saved per user until the clear button is clicked!
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
          label: `${formatDuration(step.duration)} ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
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
      isRestDay?: boolean;
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

    // Populate Rest Days in past training history (for the last 90 days)
    const activityDatesSet = new Set<string>();
    filtered.forEach(a => {
      if (a.start_date_local) {
        const dStr = a.start_date_local.split('T')[0];
        if (dStr) activityDatesSet.add(dStr);
      }
    });

    // Scan backwards from yesterday for 90 days to identify days without registered workouts
    for (let i = 1; i <= 90; i++) {
      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - i);
      pastDate.setHours(12, 0, 0, 0);
      const pastDateStr = toLocalDateStr(pastDate);

      if (!activityDatesSet.has(pastDateStr)) {
        pastList.push({
          type: 'past',
          key: `rest-day-${pastDateStr}`,
          date: pastDate,
          label: 'Rest Day',
          isRestDay: true,
          dayData: {
            day: pastDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            focus: 'Rest Day',
            load_target: 0,
            duration_target: 0,
            intensity: 'Rest',
            why: 'Dedicated rest day for muscular recovery, glycogen replenishment, and cardiovascular adaptation.',
            workout_steps: []
          }
        });
      }
    }

    // Match actual activities today against suggested workouts today so completed rides replace corresponding suggested sessions (e.g. morning commute)
    let remainingTodaySuggested = [...todaySuggestedList];
    const sortedTodayActual = [...todayActualList].sort((a, b) => a.date.getTime() - b.date.getTime());

    if (sortedTodayActual.length > 0) {
      // 1. Any planned "Rest" day for today is discarded because the user already rode today
      remainingTodaySuggested = remainingTodaySuggested.filter(s => {
        const isRest = s.dayData?.intensity === 'Rest' || 
                       (s.dayData?.focus || '').toLowerCase().includes('rest') || 
                       (s.dayData?.duration_target || 0) <= 0;
        return !isRest;
      });

      // 2. Match each completed ride against suggested sessions
      sortedTodayActual.forEach(actual => {
        const nameLower = (actual.activityData?.name || '').toLowerCase();
        
        let matchIdx = -1;
        if (nameLower.includes('commute am') || nameLower.includes('morning')) {
          matchIdx = remainingTodaySuggested.findIndex(s => (s.dayData?.focus || '').toLowerCase().includes('commute am'));
        } else if (nameLower.includes('commute pm') || nameLower.includes('afternoon') || nameLower.includes('evening')) {
          matchIdx = remainingTodaySuggested.findIndex(s => (s.dayData?.focus || '').toLowerCase().includes('commute pm'));
        } else if (nameLower.includes('commute')) {
          matchIdx = remainingTodaySuggested.findIndex(s => (s.dayData?.focus || '').toLowerCase().includes('commute'));
        }
        
        // Default fallback: match first remaining suggested ride for today
        if (matchIdx === -1 && remainingTodaySuggested.length > 0) {
          matchIdx = 0;
        }
        
        if (matchIdx !== -1) {
          remainingTodaySuggested.splice(matchIdx, 1);
        }
      });
    }

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
    const upcoming = timelineItems.filter(i => {
      if (!i.dayData) return false;
      if (i.type === 'future_suggested') return true;
      if (i.type === 'today_suggested') {
        const isRest = i.dayData.intensity === 'Rest' || 
                       (i.dayData.focus || '').toLowerCase().includes('rest') || 
                       (i.dayData.duration_target || 0) <= 0;
        if (hasRideToday) {
          // If a ride is already completed today, today's workout is done
          return false;
        }
        return true;
      }
      return false;
    });

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
      isRest: sortedUpcoming[0].dayData!.intensity === 'Rest' || (sortedUpcoming[0].dayData!.focus || '').toLowerCase().includes('rest'),
      absoluteIndex: sortedUpcoming[0].absoluteIndex ?? 0
    };
  }, [timelineItems, hasRideToday]);

  const chatContextSummary = useMemo(() => {
    const now = new Date();
    const todayStr = toLocalDateStr(now);
    const dayLabel = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const todayActuals = (activities || []).filter(a => {
      if (!a.start_date_local || !a.start_date_local.startsWith(todayStr)) return false;
      const dur = a.moving_time || a.elapsed_time || (a as any).time || 0;
      const dist = a.distance || 0;
      return dur >= 60 || dist >= 100;
    });

    const todayPlannedItem = ridesSections.sortedTodayItems.find(i => i.type === 'today_suggested')?.dayData;
    const tomorrowItem = ridesSections.sortedTomorrowItems[0]?.dayData;

    let todayText = "0 rides logged today";
    if (todayActuals.length > 0) {
      const totTss = Math.round(todayActuals.reduce((sum, a) => sum + (a.icu_training_load || a.icu_tss || 0), 0));
      todayText = `✓ ${todayActuals.length} done (${totTss > 0 ? `${totTss} TSS` : `${Math.round(todayActuals.reduce((s, a) => s + (a.moving_time || 0), 0)/60)}m`})`;
    } else if (todayPlannedItem) {
      const isRest = todayPlannedItem.intensity === 'Rest' || (todayPlannedItem.focus || '').toLowerCase().includes('rest') || (todayPlannedItem.duration_target || 0) <= 0;
      todayText = isRest ? 'Planned: Rest Day' : `Planned: ${todayPlannedItem.duration_target}m ${todayPlannedItem.focus}`;
    }

    let tomorrowText = "";
    if (tomorrowItem) {
      const isRest = tomorrowItem.intensity === 'Rest' || (tomorrowItem.focus || '').toLowerCase().includes('rest') || (tomorrowItem.duration_target || 0) <= 0;
      tomorrowText = isRest ? 'Rest' : `${tomorrowItem.duration_target}m ${tomorrowItem.focus}`;
    }

    return {
      dayLabel,
      todayText,
      tomorrowText
    };
  }, [activities, ridesSections]);


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
           <div className="space-y-2">
            <button
              onClick={() => handleOAuthConnect('strava')}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-xl"
            >
              Connect Strava
            </button>
            <button
              onClick={() => handleOAuthConnect('intervals')}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-xl"
            >
              Connect Intervals.icu
            </button>
          </div>
          <button 
            onClick={() => loadData({ apiKey: 'demo', athleteId: '0', provider: 'intervals' }, true)}
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
      <header className="flex-none flex items-center justify-between pb-3 px-5 bg-transparent border-b border-white/[0.05] z-30" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/[0.08] flex flex-shrink-0 items-center justify-center relative overflow-hidden">
             {isSyncing && <div className="absolute inset-0 bg-emerald-500/20 animate-pulse" />}
             {activeTab === 'chat' ? <Bot size={15} className="text-emerald-400" /> : <CyclistIcon size={16} className="text-emerald-400" />}
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight leading-none">
              wa<span className="text-emerald-400">TT</span>son
            </h2>
            {isSyncing ? (
              <RotateCcw size={10} className="animate-spin text-emerald-400" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
            )}
          </div>
        </div>
        
        <div className="flex justify-end gap-1.5 items-center">
          {activeTab === 'chat' && (
            <button 
              onClick={() => { 
                if (confirmClear) {
                  const uid = currentUser?.uid;
                  const key = getChatStorageKey(uid);
                  const clearedKey = getChatClearedKey(uid);

                  setMessages([]);
                  safeSetItem(key, '[]');
                  safeSetItem(clearedKey, Date.now().toString());

                  if (!uid) {
                    safeSetItem('wattson_chat_history', '[]');
                  }

                  if (currentUser) {
                    syncToCloud({ chatHistoryJson: '[]' });
                    saveUserCloudProfile(currentUser.uid, { chatHistoryJson: '[]' }).catch(console.error);
                  }
                  setConfirmClear(false);
                } else {
                  setConfirmClear(true);
                  setTimeout(() => setConfirmClear(false), 3000);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg border text-[9px] font-semibold uppercase tracking-wider transition-all active:scale-95 ${
                confirmClear 
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' 
                : 'bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-rose-300 hover:border-rose-500/30'
              }`}
              title="Clear chat conversation"
            >
              {confirmClear ? 'Confirm' : 'Clear'}
            </button>
          )}

          {activeTab !== 'chat' && (
            <>
              <button 
                onClick={() => {
                  setActiveTab('settings');
                  setSettingsView('workout_library');
                }}
                className="w-7 h-7 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white active:scale-95 transition-all"
                title="Workout Library"
              >
                <BookOpen size={13} />
              </button>
              <button 
                onClick={() => { setSuggestion(null); loadData(creds!); }}
                disabled={isSyncing}
                className="w-7 h-7 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-emerald-400 active:scale-95 transition-all"
                title="Refresh Intervals Data"
              >
                <RefreshCw size={13} className={isSyncing ? 'animate-spin text-emerald-400' : ''} />
              </button>
              <button 
                onClick={() => {
                  setActiveTab('settings');
                  setSettingsView('main');
                }}
                className="h-7 px-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.08] flex items-center gap-1.5 text-slate-400 hover:text-white active:scale-95 transition-all"
                title={currentUser ? `Cloud Sync: ${currentUser.displayName || currentUser.email}` : "Cloud Profile (Sign In)"}
              >
                {currentUser?.photoURL ? (
                  <img 
                    src={currentUser.photoURL} 
                    alt="User" 
                    className="w-3.5 h-3.5 rounded-full object-cover border border-emerald-400/40"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Cloud size={12} className={currentUser ? "text-emerald-400" : "text-slate-400"} />
                )}
                {currentUser && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {syncError && hasData && (
        <div className="mx-4 mt-2 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
            <span className="text-[11px] truncate">{syncError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              onClick={() => { setSyncError(null); if (creds) loadData(creds); }}
              className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-[9px] font-semibold rounded-md uppercase tracking-wider text-rose-200 active:scale-95 transition-all"
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
                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                  Target Goal
                </span>
              </div>
              
              <div 
                onClick={() => { setActiveTab('settings'); setSettingsView('goal'); }}
                className="px-3.5 py-2.5 rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05] cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-slate-300 shrink-0">
                    <Target size={12} />
                  </div>
                  <h2 className="text-xs font-medium text-slate-200 tracking-tight truncate">
                    "{userGoal || 'Define your primary training goal'}"
                  </h2>
                </div>
                <ChevronRight size={13} className="text-slate-600 shrink-0" />
              </div>
            </div>

            {/* Section 2: Performance Metrics */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                  Performance Metrics
                </span>
              </div>

              {/* Unified 5-Metric Strip */}
              <div className="p-3 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <div className="grid grid-cols-5 gap-1 divide-x divide-white/[0.06]">
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-medium uppercase text-slate-400 tracking-wider">Fitness</span>
                    <span className="text-sm font-semibold text-cyan-400 font-mono mt-0.5">{stats.ctl}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-medium uppercase text-slate-400 tracking-wider">Fatigue</span>
                    <span className="text-sm font-semibold text-amber-400 font-mono mt-0.5">{stats.atl}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-medium uppercase text-slate-400 tracking-wider">Form</span>
                    <span className={`text-sm font-semibold font-mono mt-0.5 ${stats.form >= 5 ? 'text-emerald-400' : stats.form < -25 ? 'text-rose-400' : stats.form < -10 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {stats.form > 0 ? `+${stats.form}` : stats.form}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-medium uppercase text-slate-400 tracking-wider">7D Time</span>
                    <span className="text-sm font-semibold text-slate-100 font-mono mt-0.5">{stats.total7DayTime}h</span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center px-1">
                    <span className="text-[8px] font-medium uppercase text-slate-400 tracking-wider">7D Load</span>
                    <span className="text-sm font-semibold text-emerald-400 font-mono mt-0.5">{stats.total7DayLoad}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Insights */}
            <div className="space-y-1.5 pt-0.5">
              <div 
                onClick={() => setShowInsights(true)}
                className="px-3.5 py-2.5 rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05] cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-slate-300 shrink-0">
                    <TrendingUp size={12} />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold text-slate-200 tracking-tight">
                      Insights
                    </h2>
                  </div>
                </div>
                <ChevronRight size={13} className="text-slate-600 shrink-0" />
              </div>
            </div>

            {/* Section 3: Next Workout */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                  Next Workout
                </span>
              </div>

              <div className="space-y-2">
                {/* Visual indicator when plan is updating or updated */}
                {isPlanUpdating && (
                  <div className="p-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 animate-pulse flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <Loader2 size={13} className="animate-spin text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-semibold uppercase tracking-wider text-emerald-400">
                          Updating Plan
                        </span>
                        {lastAppliedTweak && (
                          <span className="text-[8px] font-medium text-slate-400 truncate">
                            "{lastAppliedTweak}"
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-200 truncate mt-0.5">
                        Recalibrating workouts to match requested change...
                      </p>
                    </div>
                  </div>
                )}

                {!isPlanUpdating && showTweakSuccessNotice && lastAppliedTweak && (
                  <div className="p-2.5 px-3 rounded-2xl border border-emerald-500/20 bg-[#0b0e14]/90 flex items-center justify-between gap-2 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Check size={11} className="stroke-[3]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[8px] font-semibold uppercase tracking-wider text-emerald-400 block leading-none">Plan Updated</span>
                        <p className="text-[10px] font-medium text-slate-200 truncate mt-0.5">
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
                      date={nextRideFromPlan.date}
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

            {/* Section 4: Latest Ride */}
            {lastActivity && (
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                    Latest Activity
                  </span>
                </div>

                <ActivityCard 
                  activity={lastActivity}
                  onClick={(act) => setSelectedActivity(act)}
                  isToday={new Date(lastActivity.start_date_local).toDateString() === new Date().toDateString()}
                  highlightGreen={true}
                />
              </div>
            )}

        </div>

        {/* Rides Tab */}
        {/* Rides Tab */}
        <div 
          className={`flex-1 hide-scrollbar scroll-smooth overflow-y-auto px-4 pt-3.5 pb-28 ${activeTab === 'rides' ? 'flex flex-col' : 'hidden'}`}
        >
          <div className="flex flex-col pt-1 pb-2 space-y-3">
            {/* Integrated Training Plan Section */}
            <div className="flex flex-col space-y-3 relative">
              {/* Planned Upcoming Sessions */}
              {(ridesSections.sortedFutureItems.length > 0 || ridesSections.sortedTomorrowItems.length > 0 || ridesSections.sortedTodayItems.length > 0 || isPlanUpdating) ? (
                <div className="flex flex-col space-y-2.5 pt-0.5">
                  {/* Header & Request Change */}
                  <div className="flex flex-wrap items-center justify-center gap-2 px-1">
                    <button
                      onClick={() => setIsOtherFutureExpanded(!isOtherFutureExpanded)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:text-white text-[9.5px] font-semibold uppercase tracking-wider rounded-lg shrink-0 whitespace-nowrap transition-all cursor-pointer active:scale-95"
                    >
                      <span>Upcoming Plan</span>
                      {ridesSections.sortedFutureItems.length > 0 && (
                        <span className="px-1.5 py-0.2 bg-blue-500/15 text-blue-300 rounded text-[8px] font-mono">
                          +{ridesSections.sortedFutureItems.length}
                        </span>
                      )}
                      {ridesSections.sortedFutureItems.length > 0 && (
                        isOtherFutureExpanded ? <ChevronDown size={11} className="text-slate-400" /> : <ChevronRight size={11} className="text-slate-400" />
                      )}
                    </button>

                    <div className="flex items-center gap-1.5">


                      <button
                        onClick={() => {
                          setShowRequestChangeModal(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 text-[9.5px] font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shrink-0 cursor-pointer"
                      >
                        <Sparkles size={10} className="text-emerald-400" />
                        <span>Plan & Change</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-0.5">
                    {/* Plan Updating Indicator */}
                    {isPlanUpdating && (
                      <div className="p-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 animate-pulse flex items-center gap-3 my-1">
                        <div className="flex flex-col gap-2 w-full">
                          <div className="w-full bg-emerald-500/20 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-400 h-full w-[70%] animate-pulse rounded-full" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-semibold uppercase tracking-wider text-emerald-400">
                              Updating Plan
                            </span>
                            {lastAppliedTweak && (
                              <span className="text-[8px] font-medium text-slate-400 truncate">
                                "{lastAppliedTweak}"
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-medium text-slate-200 truncate mt-0.5">
                            Recalibrating workouts to match requested change...
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Far Future Rides (Expanded) */}
                    {isOtherFutureExpanded && ridesSections.sortedFutureItems.length > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                        {ridesSections.sortedFutureItems.map((item) => (
                          <SuggestedWorkoutCard key={item.key} day={item.dayData!} absoluteIndex={item.absoluteIndex ?? 0} date={item.date} onClick={(day) => setSelectedSuggestedDay(day)} isToday={false} />
                        ))}
                      </motion.div>
                    )}



                    {ridesSections.sortedTomorrowItems.length > 0 && (
                      <div className="space-y-2 pt-0.5">
                        {ridesSections.sortedTomorrowItems.map((item) => (
                          <SuggestedWorkoutCard key={item.key} day={item.dayData!} absoluteIndex={item.absoluteIndex ?? 0} date={item.date} onClick={(day) => setSelectedSuggestedDay(day)} isToday={false} />
                        ))}
                      </div>
                    )}

                    {/* Today Rides */}
                    {ridesSections.sortedTodayItems.length > 0 && (
                      <div className="flex flex-col space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[9.5px] font-semibold uppercase tracking-wider text-emerald-400">
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
                              date={item.date}
                              onClick={(day) => setSelectedSuggestedDay(day)} 
                              isToday={true} 
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex flex-col items-center text-center space-y-2.5 my-1">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white">No 7-Day Plan Active</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Generate a fast personalized training plan for the coming 7 days.</p>
                  </div>
                

                </div>
              )}
            </div>
            
            {/* Past Section / Training History */}
            <div ref={todayAndPastContainerRef} className="flex flex-col space-y-2.5 pt-2">
              {ridesSections.sortedPastItems.length > 0 && (
                <div className="flex flex-col space-y-2.5">
                  <div className="flex items-center justify-between px-1 pb-0.5">
                    <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                      Training History
                    </span>
                    <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                      {visiblePastCount < ridesSections.sortedPastItems.filter(i => !i.isRestDay).length 
                        ? `Showing ${Math.min(visiblePastCount, ridesSections.sortedPastItems.filter(i => !i.isRestDay).length)} of ${ridesSections.sortedPastItems.filter(i => !i.isRestDay).length} Sessions`
                        : `${ridesSections.sortedPastItems.filter(i => !i.isRestDay).length} Sessions`}
                    </span>
                  </div>

                  {ridesSections.sortedPastItems.slice(0, visiblePastCount).map((item, idx, arr) => {
                    const prevItem = idx > 0 ? arr[idx - 1] : null;
                    let showMonthHeader = false;
                    let monthLabel = '';
                    const itemMonth = item.date.toLocaleString('default', { month: 'long', year: 'numeric' });
                    const prevMonth = prevItem ? prevItem.date.toLocaleString('default', { month: 'long', year: 'numeric' }) : '';
                    if (itemMonth !== prevMonth && idx > 0) { 
                      showMonthHeader = true;
                      monthLabel = itemMonth.toUpperCase();
                    }
                    
                    return (
                      <React.Fragment key={item.key}>
                        {showMonthHeader && (
                          <div className="flex items-center gap-3 px-1 pt-3 pb-0.5">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                              {monthLabel}
                            </span>
                            <div className="flex-1 h-px bg-white/[0.05]" />
                          </div>
                        )}
                        {item.activityData && (
                          <ActivityCard 
                            activity={item.activityData} 
                            onClick={setSelectedActivity} 
                          />
                        )}
                        {item.isRestDay && item.dayData && (
                          <SuggestedWorkoutCard 
                            key={item.key}
                            day={item.dayData}
                            date={item.date}
                            onClick={(day) => setSelectedSuggestedDay(day)}
                            isToday={false}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Load More Rides Button */}
                  {ridesSections.sortedPastItems.length > visiblePastCount && (
                    <div className="pt-2 pb-6 flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVisiblePastCount(prev => prev + 25)}
                        className="w-full py-2.5 px-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] active:scale-[0.99] border border-white/[0.08] hover:border-emerald-500/40 text-[11px] font-semibold text-slate-200 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm group"
                      >
                        <ChevronDown size={14} className="text-emerald-400 group-hover:translate-y-0.5 transition-transform" />
                        <span>Load More Rides (+25)</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          (Showing {Math.min(visiblePastCount, ridesSections.sortedPastItems.length)} of {ridesSections.sortedPastItems.length})
                        </span>
                      </button>
                      {ridesSections.sortedPastItems.length - visiblePastCount > 50 && (
                        <button
                          type="button"
                          onClick={() => setVisiblePastCount(ridesSections.sortedPastItems.length)}
                          className="text-[10px] text-slate-500 hover:text-emerald-400 transition-colors py-0.5"
                        >
                          Load all {ridesSections.sortedPastItems.length} rides
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Tab */}
        <div 
          className={`flex-1 min-h-0 bg-transparent overflow-x-hidden max-w-full relative ${activeTab === 'chat' ? 'flex flex-col' : 'hidden'}`}
        >
          <ChatWindow
            messages={messages}
            setMessages={setMessages}
            isChatLoading={isChatLoading}
            setIsChatLoading={setIsChatLoading}
            chatContextSummary={chatContextSummary}
            userGoal={userGoal}
            stats={stats}
            suggestion={suggestion}
            activities={activities}
            wellnessData={wellnessData}
            powerCurves={powerCurves}
            weeklyBriefing={weeklyBriefing}
            planContext={planContext}
            ftp={ftp}
            currentUser={currentUser}
            handleAddTweakFromApp={handleAddTweakFromApp}
            safeSetItem={safeSetItem}
            syncToCloud={syncToCloud}
            saveUserCloudProfile={saveUserCloudProfile}
            getChatStorageKey={getChatStorageKey}
            getChatClearedKey={getChatClearedKey}
            isActive={activeTab === 'chat'}
          />
        </div>

        {/* Settings Tab */}
        <div 
          className={`flex-1 hide-scrollbar scroll-smooth overflow-y-auto px-4 pt-4 pb-28 ${activeTab === 'settings' ? 'flex flex-col' : 'hidden'}`}
        >
              {settingsView === "main" ? null : (
                <div className="flex items-center gap-2.5 pb-3 px-1 border-b border-white/[0.06] mb-3">
                  <button 
                    onClick={() => setSettingsView("main")}
                    className="w-8 h-8 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-slate-300 border border-white/[0.08] active:scale-95 transition-all cursor-pointer"
                    aria-label="Back to settings"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                    {settingsView === "rider_profile" ? "Rider Assessment" : 
                     settingsView === "ftp" ? "Engine Benchmark" : 
                     settingsView === "goal" ? "Goal & Ambition" : 
                     settingsView === "training_method" ? "Training Setup" : 
                     settingsView === "workout_library" ? "Workout Library" : ""}
                  </h2>
                </div>
              )}

              <div className="flex flex-col pb-1 px-1">
                {settingsView === "main" && (
                  <div className="flex flex-col gap-3.5">
                    {/* Firebase Cloud Sync & User Profile */}
                    <FirebaseAuthCard 
                      currentUser={currentUser} 
                      cloudSyncStatus={cloudSyncStatus} 
                      lastSyncedAt={lastSyncedAt}
                      compact={true}
                    />

                    {/* Section 1: Performance Benchmarks */}
                    <div className="space-y-1.5">
                      <div className="px-1 flex items-center justify-between">
                        <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                          Performance Benchmarks
                        </span>
                      </div>

                      <div className="bg-white/[0.02] border border-white/[0.07] rounded-2xl overflow-hidden divide-y divide-white/[0.04] shadow-sm">
                        {/* Rider Profile */}
                        <button 
                          onClick={() => setSettingsView("rider_profile")}
                          className="w-full p-3.5 flex items-center justify-between group hover:bg-white/[0.03] transition-colors text-left cursor-pointer active:bg-white/[0.05]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                              <User size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white tracking-tight">Rider Profile</p>
                              <p className="text-[10.5px] text-slate-400 font-medium truncate">Comprehensive Assessment & Phenotype</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-[9.5px] font-semibold text-violet-300/90 px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20">
                              Assessment
                            </span>
                            <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </button>

                        {/* Your Goal */}
                        <button 
                          onClick={() => setSettingsView("goal")}
                          className="w-full p-3.5 flex items-center justify-between group hover:bg-white/[0.03] transition-colors text-left cursor-pointer active:bg-white/[0.05]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                              <Target size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white tracking-tight">Primary Ambition</p>
                              <p className="text-[10.5px] text-slate-400 font-medium italic truncate max-w-[210px]">
                                "{userGoal.replace(/^[\s"'|\\]+|[\s"'|\\]+$/g, '').replace(/\\"/g, '"').trim() || 'Improve cycling performance'}"
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-[9.5px] font-semibold text-slate-400 px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
                              Edit
                            </span>
                            <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </button>

                        {/* Engine Benchmark / FTP */}
                        <button 
                          onClick={() => setSettingsView("ftp")}
                          className="w-full p-3.5 flex items-center justify-between group hover:bg-white/[0.03] transition-colors text-left cursor-pointer active:bg-white/[0.05]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                              <Zap size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white tracking-tight">Engine Benchmark</p>
                              <p className="text-[10.5px] text-slate-400 font-medium">Functional Threshold Power</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="font-mono font-bold text-xs text-emerald-400 px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-sm">
                              {ftp ? `${ftp}W FTP` : "Set FTP"}
                            </span>
                            <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Section 2: Training Engine & Catalog */}
                    <div className="space-y-1.5">
                      <div className="px-1 flex items-center justify-between">
                        <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                          Training Engine & Library
                        </span>
                      </div>

                      <div className="bg-white/[0.02] border border-white/[0.07] rounded-2xl overflow-hidden divide-y divide-white/[0.04] shadow-sm">
                        {/* Training Setup */}
                        <button 
                          onClick={() => setSettingsView("training_method")}
                          className="w-full p-3.5 flex items-center justify-between group hover:bg-white/[0.03] transition-colors text-left cursor-pointer active:bg-white/[0.05]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                              <Settings size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white tracking-tight">Training Setup</p>
                              <p className="text-[10.5px] text-slate-400 font-medium capitalize">
                                {trainingMethodology.replace("_", " ")} · {trainingMode}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-[9.5px] font-semibold text-slate-300 capitalize px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
                              Configure
                            </span>
                            <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </button>

                        {/* Workout Library */}
                        <button 
                          onClick={() => setSettingsView("workout_library")}
                          className="w-full p-3.5 flex items-center justify-between group hover:bg-white/[0.03] transition-colors text-left cursor-pointer active:bg-white/[0.05]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                              <BookOpen size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white tracking-tight">Workout Library</p>
                              <p className="text-[10.5px] text-slate-400 font-medium">Curated Intervals & Catalog</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-[9.5px] font-semibold text-slate-400 px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
                              Browse
                            </span>
                            <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Connection & Footer Card */}
                    <div className="mt-1 p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <div>
                          <p className="text-[11px] font-bold text-white leading-tight">Intervals.icu Connected</p>
                          <p className="text-[9.5px] text-slate-500 font-mono">Real-time telemetry link</p>
                        </div>
                      </div>
                      <button 
                        onClick={handleLogout}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                        title="Disconnect Intervals.icu account"
                      >
                        <LogOut size={12} />
                        <span>Disconnect</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between px-2 pt-0.5 text-[9.5px] text-slate-500 font-mono">
                      <span>waTTson AI Coach</span>
                      <span>v1.0.0</span>
                    </div>
                  </div>
                )}

                {settingsView === "goal" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="space-y-2">
                      <label className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider px-1">Primary Ambition</label>
                      <textarea 
                        value={userGoal} 
                        onChange={(e) => setUserGoal(e.target.value)} 
                        className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl p-3.5 text-xs text-slate-100 outline-none focus:border-white/20 min-h-[90px] resize-none font-medium placeholder:text-slate-600 transition-colors"
                        placeholder="Ex: Improve hill climb efficiency..."
                      />
                    </div>
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
                      className="w-full py-2.5 bg-white hover:bg-slate-200 text-slate-950 font-semibold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.99] cursor-pointer"
                    >
                      Save Ambition
                    </button>
                  </div>
                )}

                {settingsView === "ftp" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/[0.06] flex flex-col items-center">
                      <span className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Functional Threshold Power</span>
                      <div className="flex items-center gap-5">
                        <button 
                          onClick={() => {
                            const newVal = Math.max(0, (ftp || 200) - 5);
                            setFtp(newVal);
                            safeSetItem("wattson_ftp", newVal.toString());
                          }}
                          className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-slate-300 active:scale-95 transition-all hover:bg-white/[0.06] cursor-pointer"
                          aria-label="Decrease FTP"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <div className="flex flex-col items-center min-w-[90px]">
                          <span className="text-4xl font-bold text-white tracking-tight font-mono">{ftp || "---"}</span>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Watts</span>
                        </div>
                        <button 
                          onClick={() => {
                            const newVal = (ftp || 200) + 5;
                            setFtp(newVal);
                            safeSetItem("wattson_ftp", newVal.toString());
                          }}
                          className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-slate-300 active:scale-95 transition-all hover:bg-white/[0.06] cursor-pointer"
                          aria-label="Increase FTP"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {settingsView === "rider_profile" && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 px-1">
                    {isLoadingProfile ? (
                      <div className="glass-card p-12 rounded-[2rem] flex flex-col items-center justify-center text-center">
                        <div className="w-10 h-10 rounded-full border-t-2 border-emerald-500 animate-spin mb-4" />
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Generating Profile...</p>
                        <p className="text-[9px] text-slate-500 font-medium mt-1">Analyzing performance trends</p>
                      </div>
                    ) : userProfile ? (
                      <div className="space-y-4">
                        {/* Navigation Tabs: DNA / Power Curve / Aerobic Decoupling */}
                        <div className="flex bg-white/[0.02] p-1 rounded-xl border border-white/[0.06] gap-1">
                          <button
                            onClick={() => setRiderProfileTab("dna")}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              riderProfileTab === "dna"
                                ? "bg-white/10 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            DNA Profile
                          </button>
                          <button
                            onClick={() => setRiderProfileTab("power")}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              riderProfileTab === "power"
                                ? "bg-white/10 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            Power Curve
                          </button>
                          <button
                            onClick={() => setRiderProfileTab("aerobic")}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              riderProfileTab === "aerobic"
                                ? "bg-white/10 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            Aerobic
                          </button>
                        </div>

                        {/* Tab 1: DNA Profile */}
                        {riderProfileTab === "dna" && (
                          <div className="space-y-2.5 animate-in fade-in duration-200">
                            {/* Archetype Hero Card */}
                            <div className="bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.06] space-y-1">
                              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">
                                Cyclist Archetype
                              </span>
                              <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                                {userProfile.athlete_type}
                              </h3>
                              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                                {condenseText(userProfile.rider_story, 2) ||
                                  `You possess a strong physiological footprint with high aerobic endurance potential.`}
                              </p>
                            </div>

                            {/* Strengths & Limiters in compact pills */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {/* Strengths */}
                              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                  Core Strengths
                                </span>
                                <div className="space-y-1">
                                  {(userProfile.strengths || ["High aerobic volume capacity", "Steady sub-threshold endurance", "Consistent weekly training"]).slice(0, 3).map((s, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-[10.5px] text-slate-300">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                      <span className="truncate">{condenseBullet(s, 8)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Limiters */}
                              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                  Focus Areas
                                </span>
                                <div className="space-y-1">
                                  {(userProfile.areas_for_improvement || ["VO2 max peak power", "Anaerobic repeatability", "High-intensity bursts"]).slice(0, 3).map((a, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-[10.5px] text-slate-300">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                      <span className="truncate">{condenseBullet(a, 8)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Recommended Training Focus */}
                            {userProfile.recommended_focus && (
                              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                                <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Training Focus
                                </span>
                                <p className="text-xs text-slate-200 font-medium leading-relaxed">
                                  {condenseText(userProfile.recommended_focus, 1)}
                                </p>
                              </div>
                            )}

                            {/* Effective Stimuli & Avoid */}
                            {(userProfile.effective_methods || userProfile.ineffective_methods) && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {userProfile.effective_methods && userProfile.effective_methods.length > 0 && (
                                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">
                                      What Works
                                    </span>
                                    <ul className="space-y-1 text-[10px] text-slate-300">
                                      {userProfile.effective_methods.slice(0, 2).map((m, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                          <span className="text-emerald-400 shrink-0">•</span>
                                          <span>{condenseBullet(m, 10)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {userProfile.ineffective_methods && userProfile.ineffective_methods.length > 0 && (
                                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">
                                      To Avoid
                                    </span>
                                    <ul className="space-y-1 text-[10px] text-slate-300">
                                      {userProfile.ineffective_methods.slice(0, 2).map((m, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                          <span className="text-rose-400 shrink-0">•</span>
                                          <span>{condenseBullet(m, 10)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tab 2: Power Curve */}
                        {riderProfileTab === "power" && (
                          <div className="animate-in fade-in duration-200">
                            <RiderPowerCurve 
                              powerCurves={powerCurves || []} 
                              athleteType={userProfile.athlete_type} 
                              ftp={ftp || undefined} 
                            />
                          </div>
                        )}

                        {/* Tab 3: Aerobic Efficiency */}
                        {riderProfileTab === "aerobic" && (
                          <div className="animate-in fade-in duration-200">
                            <AerobicEfficiencyDecouplingChart 
                              activities={activities || []} 
                              ftp={ftp || undefined} 
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="glass-card p-10 rounded-[2rem] text-center border border-white/5">
                        <p className="text-[11px] text-slate-400 font-medium">Not enough data to form an assessment yet.</p>
                      </div>
                    )}
                  </div>
                )}

                {settingsView === "training_method" && (
                  <div className="space-y-4 animate-in fade-in duration-200 px-1">
                    <div className="space-y-3">
                      <div className="bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] space-y-2.5">
                        <div className="flex items-center justify-between px-0.5">
                          <span className="text-[10px] font-bold text-white uppercase tracking-wider">Discipline Mode</span>
                          <span className="text-[9px] text-slate-400 font-medium">Activity focus</span>
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
                                className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border transition-all active:scale-95 cursor-pointer ${
                                  isSelected
                                    ? "bg-white/10 border-white/20 text-white font-bold"
                                    : "bg-white/[0.01] border-white/5 text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                <span className="text-[10px] uppercase tracking-wider">{mode === "triathlon" ? "Triathlon" : mode === "running" ? "Running" : "Cycling"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] space-y-2.5">
                        <div className="flex items-center justify-between px-0.5">
                          <span className="text-[10px] font-bold text-white uppercase tracking-wider">Methodology</span>
                          <span className="text-[9px] text-slate-400 font-medium">Distribution model</span>
                        </div>
                        <div className="space-y-1.5">
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
                                className={`w-full py-2.5 px-3.5 rounded-xl border text-left transition-all active:scale-[0.99] flex items-center justify-between cursor-pointer ${
                                  isSelected
                                    ? "bg-white/10 border-white/20 text-white font-semibold"
                                    : "bg-white/[0.01] border-white/5 text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                <span className="text-[11px] uppercase tracking-wider">{m.replace("_", " ")}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMethodologyInfo(m as TrainingMethodology);
                                    }}
                                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
                                  >
                                    <Info size={12} />
                                  </button>
                                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <MethodologyInfo />
                    </div>
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
      <div 
        className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" 
        onClick={() => setShowGoalEditor(false)}
      >
        <div 
          className="bg-[#0c0e15] border-t sm:border border-white/10 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl flex flex-col gap-3.5" 
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Target Goal</h2>
            <button 
              onClick={() => setShowGoalEditor(false)} 
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider">Primary Ambition</label>
            <textarea 
              value={userGoal} 
              onChange={(e) => setUserGoal(e.target.value)} 
              className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl p-3 text-xs text-slate-100 outline-none focus:border-white/20 min-h-[90px] resize-none font-medium placeholder:text-slate-600 transition-colors"
              placeholder="Ex: Improve hill climb efficiency..."
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setShowGoalEditor(false)}
              className="flex-1 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-slate-300 hover:text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center"
            >
              Cancel
            </button>
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
              className="flex-1 py-2.5 bg-white hover:bg-slate-200 text-slate-950 font-semibold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] cursor-pointer text-center"
            >
              Save Goal
            </button>
          </div>
        </div>
      </div>
    )}
    
    <AnimatePresence>
      {methodologyInfo && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[230] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" 
          onClick={() => setMethodologyInfo(null)}
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-[#0c0e15] border border-white/10 w-full max-w-sm rounded-2xl p-6 shadow-2xl flex flex-col gap-4" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Info size={16} className="text-emerald-400" />
                </div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">{methodologyInfo}</h2>
              </div>
              <button 
                onClick={() => setMethodologyInfo(null)} 
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                {methodologyInfo === 'polarized' && "The 80/20 rule. Focuses on 80% low-intensity (Zone 1/2) volume and 20% high-intensity intervals (Zone 5+). It strictly avoids the middle 'gray zone' (Zones 3/4) to maximize physiological adaptations while minimizing metabolic fatigue."}
                {methodologyInfo === 'pyramidal' && "A distribution where most time is spent in Zone 1/2, a significant amount in Zone 3/4 (Threshold), and the least amount in Zone 5+. This is ideal for base building and preparing for steady-state endurance events like time trials or long climbs."}
                {methodologyInfo === 'norwegian' && "Characterized by massive volume at low intensity combined with controlled, high-frequency threshold training (often 4x4 or double-threshold sessions). It emphasizes strict intensity control to accumulate maximum threshold volume without crossing the anaerobic limit."}
              </p>
              
              <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Characteristic</h4>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-slate-200 font-medium">
                    {methodologyInfo === 'polarized' && "Strict intensity discipline"}
                    {methodologyInfo === 'pyramidal' && "Balanced threshold progression"}
                    {methodologyInfo === 'norwegian' && "High-volume threshold accumulation"}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setMethodologyInfo(null)}
              className="w-full py-3 bg-white text-slate-950 font-bold text-xs uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] cursor-pointer"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
      {showWorkoutDetail && currentWorkout && (
        <div className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={() => setShowWorkoutDetail(false)}>
          <div className="bg-[#0c0e15] border-t sm:border border-white/10 w-full sm:max-w-md h-[100dvh] sm:h-auto sm:max-h-[88dvh] rounded-none sm:rounded-[2.2rem] p-5 sm:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] sm:shadow-2xl flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
            
            {/* Mobile drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 shrink-0 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-3 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px] tracking-wider uppercase shrink-0">
                  WORKOUT
                </div>
                <h3 className="text-sm sm:text-base font-black text-white italic tracking-tight uppercase truncate">
                  {currentWorkout.title}
                </h3>
              </div>
              <button onClick={() => setShowWorkoutDetail(false)} className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 space-y-3.5">
              {/* Compact Metrics Strip */}
              {(() => {
                const workoutAvgWatts = calculateWorkoutAverageWatts(
                  currentWorkout.workout_steps,
                  ftp || 250,
                  weeklyBriefing?.ftp,
                  {
                    duration: currentWorkout.duration_minutes,
                    focus: currentWorkout.title,
                    intensity: currentWorkout.intensity,
                    tss: currentWorkout.tss
                  }
                );

                return (
                  <div className="grid grid-cols-3 gap-2 p-3 bg-white/[0.03] border border-white/5 rounded-2xl">
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={11} className="text-blue-400" /> Duration
                      </span>
                      <span className="text-xs sm:text-sm font-black text-white mt-0.5">
                        {currentWorkout.type === 'endurance' || currentWorkout.title.toLowerCase().includes('endurance')
                          ? (currentWorkout.duration_minutes % 60 === 0
                              ? `${currentWorkout.duration_minutes / 60}H`
                              : `${Math.floor(currentWorkout.duration_minutes / 60)}H${currentWorkout.duration_minutes % 60 > 0 ? (currentWorkout.duration_minutes % 60 < 10 ? `0${currentWorkout.duration_minutes % 60}` : currentWorkout.duration_minutes % 60) : ''}`)
                          : `${currentWorkout.duration_minutes} MIN`}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center border-x border-white/5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Zap size={11} fill="currentColor" className="text-amber-400" /> Load
                      </span>
                      <span className="text-xs sm:text-sm font-black text-amber-400 mt-0.5">
                        {currentWorkout.tss || '--'} TSS
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <ActivityIcon size={11} className="text-emerald-400" /> Target
                      </span>
                      <span className="text-xs sm:text-sm font-black text-emerald-400 mt-0.5 uppercase">
                        {workoutAvgWatts ? `${workoutAvgWatts}W` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {currentWorkout.description && (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 text-center">
                  <p className="text-xs text-slate-300 leading-relaxed font-medium italic">
                    "{currentWorkout.description}"
                  </p>
                </div>
              )}

              {currentWorkout.workout_steps && currentWorkout.workout_steps.length > 0 && (
                <div className="space-y-2.5">
                  <VisualProfileChart 
                    steps={currentWorkout.workout_steps} 
                    currentFtp={ftp || undefined}
                    originalFtp={weeklyBriefing?.ftp}
                  />
                  <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3.5 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block border-b border-white/5 pb-1.5">
                      main interval(s)
                    </span>
                    <GroupedWorkoutStepsList 
                      steps={currentWorkout.workout_steps}
                      currentFtp={ftp || undefined}
                      originalFtp={weeklyBriefing?.ftp}
                      fontSize="sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer close button */}
            <div className="pt-3 shrink-0 border-t border-white/5 mt-auto">
              <button 
                onClick={() => setShowWorkoutDetail(false)}
                className="w-full py-3 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all cursor-pointer"
              >
                Close
              </button>
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
            
            const avgWatts = calculateWorkoutAverageWatts(
              selectedSuggestedDay.workout_steps,
              currentFtp,
              weeklyBriefing?.ftp,
              {
                duration: selectedSuggestedDay.duration_target,
                focus: selectedSuggestedDay.focus,
                intensity: selectedSuggestedDay.intensity,
                load_target: selectedSuggestedDay.load_target
              }
            );

            return avgWatts ? `${avgWatts}W` : '—';
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

          const restRationale = isRest ? generateDataDrivenRestRationale({
            dayName: selectedSuggestedDay.day,
            stats,
            allDays: weeklyBriefing?.days,
            recentActivities: activities,
            wellness: wellnessData
          }) : null;

          return (
            <div className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={() => setSelectedSuggestedDay(null)}>
              <div className="bg-[#0c0e15] border-t sm:border border-white/10 w-full sm:max-w-md h-auto max-h-[92dvh] sm:max-h-[88dvh] rounded-t-[2rem] sm:rounded-[2.2rem] p-4 sm:p-5 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] sm:shadow-2xl flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
                
                {/* Mobile drag handle */}
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-2.5 shrink-0 sm:hidden" />

                {/* Header */}
                <div className="flex items-center justify-between shrink-0 mb-2.5 pb-2.5 border-b border-white/5">
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px] tracking-wider uppercase shrink-0">
                      {weekday} {dayNum}
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-white italic tracking-tight uppercase truncate">
                      {formatPlannedRideTitle(selectedSuggestedDay.focus)}
                    </h3>
                  </div>
                  <button onClick={() => setSelectedSuggestedDay(null)} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors shrink-0">
                    <X size={18} />
                  </button>
                </div>

                {/* Scrollable body content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5 min-h-0 space-y-2.5">
                  {isReworking ? (
                    <div className="w-full py-8 flex flex-col items-center justify-center bg-white/[0.02] rounded-2xl border border-white/5 text-center px-4">
                      <Loader2 size={22} className="animate-spin text-emerald-400 mb-2.5" />
                      <span className="text-[11px] font-black text-white uppercase tracking-wider mb-1">Calibrating Workout...</span>
                      <span className="text-[9px] font-medium text-slate-400">Applying custom adjustments</span>
                    </div>
                  ) : (
                    <>
                      {/* Compact Metrics Strip (For Active Workouts) */}
                      {!isRest && (
                        <div className="grid grid-cols-3 gap-2 p-2.5 bg-white/[0.03] border border-white/5 rounded-2xl">
                          <div className="flex flex-col items-center justify-center text-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Clock size={11} className="text-blue-400" /> Duration
                            </span>
                            <span className="text-xs sm:text-sm font-black text-white mt-0.5">
                              {selectedSuggestedDay.duration_target <= 0 
                                ? '—' 
                                : ((selectedSuggestedDay.focus || '').toLowerCase().includes('endurance')
                                    ? (selectedSuggestedDay.duration_target % 60 === 0 
                                        ? `${selectedSuggestedDay.duration_target / 60}H` 
                                        : `${Math.floor(selectedSuggestedDay.duration_target / 60)}H${selectedSuggestedDay.duration_target % 60 > 0 ? (selectedSuggestedDay.duration_target % 60 < 10 ? `0${selectedSuggestedDay.duration_target % 60}` : selectedSuggestedDay.duration_target % 60) : ''}`)
                                    : `${selectedSuggestedDay.duration_target} MIN`)}
                            </span>
                          </div>
                          <div className="flex flex-col items-center justify-center text-center border-x border-white/5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Zap size={11} fill="currentColor" className="text-amber-400" /> Load
                            </span>
                            <span className="text-xs sm:text-sm font-black text-amber-400 mt-0.5">
                              {displayLoadTarget <= 0 ? '—' : `${displayLoadTarget} TSS`}
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
                      )}

                      {isRest ? (
                        <div className="space-y-2.5">
                          {/* 3 Metric Badges */}
                          {restRationale && (
                            <div className="grid grid-cols-3 gap-1.5">
                              {restRationale.metrics.map((m, mIdx) => {
                                const toneClass = m.tone === 'rose' ? 'text-rose-400' :
                                                  m.tone === 'amber' ? 'text-amber-400' :
                                                  m.tone === 'blue' ? 'text-blue-400' :
                                                  'text-emerald-400';
                                return (
                                  <div key={mIdx} className="bg-white/[0.03] border border-white/5 rounded-xl p-2 flex flex-col items-center text-center">
                                    <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-full">{m.label}</span>
                                    <span className={`text-xs font-black font-mono mt-0.5 ${toneClass}`}>{m.value}</span>
                                    <span className="text-[7.5px] text-slate-400 truncate max-w-full mt-0.5 font-medium">{m.subtext}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Data-Driven Physiological Rationale */}
                          {restRationale && (
                            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 space-y-1.5">
                              <div className="flex items-center justify-between border-b border-white/5 pb-1">
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                  <ActivityIcon size={11} className="text-emerald-400" /> Why Rest Today (Data-Driven)
                                </span>
                                <span className="text-[7.5px] font-mono text-slate-400 font-semibold uppercase tracking-wider">
                                  waTTson Biometrics
                                </span>
                              </div>

                              <p className="text-[11px] text-slate-200 leading-relaxed font-normal">
                                {restRationale.explanation}
                              </p>
                            </div>
                          )}

                          {/* Dynamic Physiological Recovery Focus */}
                          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 space-y-1.5">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block border-b border-white/5 pb-1">
                              Recovery Focus
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                              {(restRationale?.physiologicalFocus?.slice(0, 2) || [
                                { icon: '⚡', title: 'Glycogen Resynthesis', description: 'Consume complex carbohydrates and clean hydration.' },
                                { icon: '🧬', title: 'Cellular Remodeling', description: 'Rest allows satellite cell activation and tissue repair.' }
                              ]).map((item, fIdx) => (
                                <div key={fIdx} className="flex items-start gap-1.5 bg-black/20 rounded-xl p-2 border border-white/[0.03]">
                                  <span className="text-xs shrink-0 mt-0.5">{item.icon}</span>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-bold text-slate-200 truncate">{item.title}</span>
                                    <span className="text-[9.5px] text-slate-400 leading-snug line-clamp-2">{item.description}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedSuggestedDay.why && (
                            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 text-center">
                              <p className="text-xs text-slate-300 leading-relaxed font-medium italic">
                                "{selectedSuggestedDay.why}"
                              </p>
                            </div>
                          )}

                          {selectedSuggestedDay.workout_steps && selectedSuggestedDay.workout_steps.length > 0 && (
                            <div className="space-y-2.5">
                              <VisualProfileChart 
                                steps={selectedSuggestedDay.workout_steps}
                                currentFtp={ftp || undefined}
                                originalFtp={weeklyBriefing?.ftp}
                              />
                              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3.5 space-y-2">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block border-b border-white/5 pb-1.5">
                                  main interval(s)
                                </span>
                                <GroupedWorkoutStepsList 
                                  steps={selectedSuggestedDay.workout_steps}
                                  currentFtp={ftp || undefined}
                                  originalFtp={weeklyBriefing?.ftp}
                                  fontSize="sm"
                                />
                              </div>
                            </div>
                          )}
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

      {/* Plan & Change Modal */}
      <PlanAndChangeModal
        isOpen={showRequestChangeModal}
        onClose={() => setShowRequestChangeModal(false)}
        weeklyBriefing={weeklyBriefing}
        activities={activities}
        suggestion={suggestion}
        onApplyPlan={(directiveText, updatedDays) => {
          handleApplyScheduleChange(directiveText, updatedDays);
        }}
        planContext={planContext}
        onUpdatePlanContext={(newContext) => {
          setPlanContext(newContext);
          if (newContext) {
            safeSetItem('wattson_plan_context', newContext);
          } else {
            localStorage.removeItem('wattson_plan_context');
          }
        }}
        userGoal={userGoal}
        hasRideToday={hasRideToday}
      />

      {reasoningPopup && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setReasoningPopup(null)}>
          <div className="bg-[#0c0e15] border border-white/10 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-200 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-emerald-400" /> {reasoningPopup.title}
              </h3>
              <button onClick={() => setReasoningPopup(null)} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <X size={14} />
              </button>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed font-normal">"{reasoningPopup.content}"</p>
            <button 
              onClick={() => setReasoningPopup(null)} 
              className="w-full py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showReleaseNotes && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowReleaseNotes(false)}>
          <div className="bg-[#0c0e15] border border-white/10 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-200 space-y-3.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  waTTson <span className="text-emerald-400 font-normal text-xs">v{APP_VERSION}</span>
                </h3>
              </div>
              <button onClick={() => setShowReleaseNotes(false)} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <X size={14} />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.06]">
                <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-1">Athlete Profile Engine</h4>
                <p className="text-slate-400 text-xs leading-relaxed">waTTson analyzes your complete training history to build your individual rider DNA. Access via Profile tab.</p>
              </div>
              <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.06]">
                <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-1">Weekly Planning</h4>
                <p className="text-slate-400 text-xs leading-relaxed">Explore your adaptive training schedule, dive into target interval steps, and sync sessions directly to your calendar.</p>
              </div>
            </div>

            <button 
              onClick={() => setShowReleaseNotes(false)} 
              className="w-full py-2.5 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Suggestion Detail Modal */}
      {showSuggestionDetail && suggestion && (
        <div className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={() => setShowSuggestionDetail(false)}>
          <div className="bg-[#0c0e15] border-t sm:border border-white/10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl overflow-y-auto max-h-[90vh] space-y-3.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-white/10 text-slate-300 border border-white/10">
                  {hasRideToday ? "Tomorrow" : "Today"}
                </span>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                  {currentWorkout?.title}
                </h3>
              </div>
              <button onClick={() => setShowSuggestionDetail(false)} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <X size={16} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.06] text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-200 font-mono">
                <Clock size={13} className="text-slate-400" />
                <span>{formatDuration(currentWorkout?.duration_minutes || 0)}</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-200 font-mono border-l border-white/[0.06]">
                <Zap size={13} className="text-amber-400" />
                <span>{currentWorkout?.tss || 45} TSS</span>
              </div>
            </div>

            <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.06] space-y-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Session Structure</span>
              <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
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
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {suggestion.reasoning}
                  </p>
                )}
              </div>
            </div>

            <button 
              onClick={() => setShowSuggestionDetail(false)}
              className="w-full py-2.5 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showInsights && (
        <div 
          className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200" 
          onClick={() => setShowInsights(false)}
        >
          <div 
            className="bg-[#0a0c14] border border-white/[0.08] w-full max-w-[420px] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col relative select-none overflow-hidden" 
            onClick={e => e.stopPropagation()}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-3 pb-2.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <TrendingUp size={13} />
                </div>
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Training Insights</h2>
              </div>
              <button 
                onClick={() => setShowInsights(false)} 
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors shrink-0 cursor-pointer"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Period Selector Tabs */}
            <div className="flex flex-col gap-2 mb-3 shrink-0">
              <div className="flex p-0.5 bg-white/[0.02] border border-white/[0.06] rounded-xl shrink-0">
                {(['week', 'month', '6months', 'year', 'season'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setInsightsPeriod(period)}
                    className={`flex-1 py-1 sm:py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      insightsPeriod === period
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {period === 'week' ? 'Week' : period === 'month' ? 'Month' : period === '6months' ? '6 Months' : period === 'season' ? 'Season' : '1 Year'}
                  </button>
                ))}
              </div>
              
              {/* Stepper Navigation for Week, Month, and Season */}
              {(() => {
                const now = new Date();
                const currentYear = now.getFullYear();

                if (insightsPeriod === 'week') {
                  const canGoForward = selectedWeekOffset < 0;

                  let title: string;
                  let subtitle: string;

                  if (selectedWeekOffset === 0) {
                    const currIso = getISOWeekNumber(now);
                    title = 'Last 7 Days';
                    subtitle = `Week ${currIso.week} · Rolling 7d`;
                  } else {
                    const calendarOffset = selectedWeekOffset + 1;
                    const { start: weekStart, end: weekEnd } = getWeekRange(calendarOffset);
                    const iso = getISOWeekNumber(weekStart);

                    title = iso.year !== currentYear ? `Week ${iso.week} (${iso.year})` : `Week ${iso.week}`;

                    const startDay = weekStart.getDate();
                    const endDay = weekEnd.getDate();
                    const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' });
                    const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
                    const year = weekEnd.getFullYear();

                    subtitle = startMonth === endMonth 
                      ? `${startMonth} ${startDay} – ${endDay}, ${year}`
                      : `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
                  }

                  return (
                    <div className="flex items-center justify-between px-2 py-1 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <button 
                        onClick={() => setSelectedWeekOffset(w => w - 1)} 
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                        title="Previous Week"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <div className="flex flex-col items-center justify-center min-w-0 px-2 text-center">
                        <span className="text-xs font-bold text-white font-mono leading-tight">{title}</span>
                        <span className="text-[9px] text-slate-400 font-medium leading-tight">{subtitle}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {selectedWeekOffset !== 0 && (
                          <button 
                            onClick={() => setSelectedWeekOffset(0)}
                            className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded transition-all cursor-pointer"
                            title="Back to rolling 7 days"
                          >
                            Now
                          </button>
                        )}
                        <button 
                          onClick={() => setSelectedWeekOffset(w => Math.min(0, w + 1))} 
                          disabled={!canGoForward}
                          className={`p-1 rounded-lg transition-colors ${
                            canGoForward 
                              ? 'text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer' 
                              : 'text-slate-600 opacity-25 cursor-not-allowed'
                          }`}
                          title="Next Week"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                }

                if (insightsPeriod === 'month') {
                  const canGoForward = selectedMonthOffset < 0;

                  let title: string;
                  let subtitle: string;

                  if (selectedMonthOffset === 0) {
                    title = 'Last 30 Days';
                    subtitle = 'Rolling 30 days';
                  } else {
                    const calendarOffset = selectedMonthOffset + 1;
                    const { start: monthStart, end: monthEnd } = getMonthRange(calendarOffset);
                    const monthName = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    title = monthName;
                    subtitle = `${monthStart.toLocaleDateString('en-US', { month: 'short' })} 1 – ${monthEnd.getDate()}, ${monthStart.getFullYear()}`;
                  }

                  return (
                    <div className="flex items-center justify-between px-2 py-1 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <button 
                        onClick={() => setSelectedMonthOffset(m => m - 1)} 
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                        title="Previous Month"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <div className="flex flex-col items-center justify-center min-w-0 px-2 text-center">
                        <span className="text-xs font-bold text-white font-mono leading-tight">{title}</span>
                        <span className="text-[9px] text-slate-400 font-medium leading-tight">{subtitle}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {selectedMonthOffset !== 0 && (
                          <button 
                            onClick={() => setSelectedMonthOffset(0)}
                            className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded transition-all cursor-pointer"
                            title="Back to rolling 30 days"
                          >
                            Now
                          </button>
                        )}
                        <button 
                          onClick={() => setSelectedMonthOffset(m => Math.min(0, m + 1))} 
                          disabled={!canGoForward}
                          className={`p-1 rounded-lg transition-colors ${
                            canGoForward 
                              ? 'text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer' 
                              : 'text-slate-600 opacity-25 cursor-not-allowed'
                          }`}
                          title="Next Month"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                }

                if (insightsPeriod === 'season') {
                  const canGoForward = selectedSeasonYear < currentYear;

                  return (
                    <div className="flex items-center justify-between px-2 py-1 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <button 
                        onClick={() => setSelectedSeasonYear(y => y - 1)} 
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
                        title="Previous Season"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <div className="flex flex-col items-center justify-center min-w-0 px-2 text-center">
                        <span className="text-xs font-bold text-white font-mono leading-tight">Season {selectedSeasonYear}</span>
                        <span className="text-[9px] text-slate-400 font-medium leading-tight">
                          {selectedSeasonYear === currentYear ? 'Current season' : 'Complete year'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {selectedSeasonYear !== currentYear && (
                          <button 
                            onClick={() => setSelectedSeasonYear(currentYear)}
                            className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded transition-all cursor-pointer"
                            title="Back to current season"
                          >
                            Now
                          </button>
                        )}
                        <button 
                          onClick={() => setSelectedSeasonYear(y => Math.min(currentYear, y + 1))} 
                          disabled={!canGoForward}
                          className={`p-1 rounded-lg transition-colors ${
                            canGoForward 
                              ? 'text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer' 
                              : 'text-slate-600 opacity-25 cursor-not-allowed'
                          }`}
                          title="Next Season"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex items-center justify-center px-2 py-1 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                    <span className="text-[10px] font-medium text-slate-400">
                      {insightsPeriod === '6months' ? 'Rolling past 180 days of activity' : 'Rolling past 365 days of activity'}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Computed Insights Metrics - Clean, No-Scroll Grid */}
            <div className="shrink-0 space-y-2">
              {(() => {
                const now = new Date();
                let cutoff: Date, endCutoff: Date, weeks: number;

                if (insightsPeriod === 'week') {
                  if (selectedWeekOffset === 0) {
                    cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    endCutoff = now;
                    weeks = 1;
                  } else {
                    const calendarOffset = selectedWeekOffset + 1;
                    const { start: weekStart, end: weekEnd } = getWeekRange(calendarOffset);
                    cutoff = weekStart;
                    endCutoff = weekEnd;
                    weeks = 1;
                  }
                } else if (insightsPeriod === 'month') {
                  if (selectedMonthOffset === 0) {
                    cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    endCutoff = now;
                    weeks = 30 / 7;
                  } else {
                    const calendarOffset = selectedMonthOffset + 1;
                    const { start: monthStart, end: monthEnd } = getMonthRange(calendarOffset);
                    cutoff = monthStart;
                    endCutoff = monthEnd;
                    const effectiveEnd = endCutoff.getTime() > now.getTime() ? now : endCutoff;
                    const activeDays = Math.max(1, (effectiveEnd.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000));
                    weeks = Math.max(1, activeDays / 7);
                  }
                } else if (insightsPeriod === 'season') {
                  cutoff = new Date(selectedSeasonYear, 0, 1, 0, 0, 0, 0);
                  endCutoff = new Date(selectedSeasonYear, 11, 31, 23, 59, 59, 999);
                  const effectiveEnd = endCutoff.getTime() > now.getTime() ? now : endCutoff;
                  const activeDays = Math.max(1, (effectiveEnd.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000));
                  weeks = Math.max(1, activeDays / 7);
                } else {
                  const daysMap = { '6months': 180, year: 365 };
                  const days = daysMap[insightsPeriod];
                  cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
                  endCutoff = now;
                  weeks = days / 7;
                }

                const filtered = (activities || []).filter(a => {
                  const d = new Date(a.start_date_local);
                  return d >= cutoff && d <= endCutoff;
                });

                const formatThousand = (val: number | string, decimals: number = 0) => {
                  const num = typeof val === 'number' ? val : parseFloat(val as string);
                  if (isNaN(num)) return val;
                  const fixed = num.toFixed(decimals);
                  const parts = fixed.split('.');
                  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                  return parts.join(',');
                };

                const totalHoursNum = filtered.reduce((acc, a) => acc + (a.moving_time || 0), 0) / 3600;
                const totalHours = formatThousand(totalHoursNum, 1);
                const rawTotalTss = Math.round(filtered.reduce((acc, a) => acc + (a.icu_training_load || a.icu_tss || 0), 0));
                const totalTss = formatThousand(rawTotalTss);
                const avgTssPerWeek = formatThousand(Math.round(rawTotalTss / Math.max(1, weeks)));
                const totalDistKmNum = filtered.reduce((acc, a) => acc + (a.distance || 0), 0) / 1000;
                const totalDistKm = formatThousand(totalDistKmNum, 0);

                // Helper to extract Normalized Power accurately
                const getNormalizedPower = (a: any): number => {
                  if (!a) return 0;
                  if (typeof a.icu_weighted_avg_watts === 'number' && a.icu_weighted_avg_watts > 0) {
                    return Math.round(a.icu_weighted_avg_watts);
                  }
                  if (typeof a.weighted_average_watts === 'number' && a.weighted_average_watts > 0) {
                    return Math.round(a.weighted_average_watts);
                  }
                  if (typeof a.icu_weighted_average_watts === 'number' && a.icu_weighted_average_watts > 0) {
                    return Math.round(a.icu_weighted_average_watts);
                  }
                  if (typeof a.normalized_power === 'number' && a.normalized_power > 0) {
                    return Math.round(a.normalized_power);
                  }
                  if (typeof a.np === 'number' && a.np > 0) {
                    return Math.round(a.np);
                  }
                  const avgP = a.average_watts || a.icu_average_watts || 0;
                  if (avgP > 0 && typeof a.icu_variability_index === 'number' && a.icu_variability_index > 0) {
                    return Math.round(avgP * a.icu_variability_index);
                  }
                  return 0;
                };

                // Power: Average Watts & Normalized Power
                const powerActivities = filtered.filter(a => (a.average_watts && a.average_watts > 0) || (a.icu_average_watts && a.icu_average_watts > 0));
                const avgWattsVal = powerActivities.length > 0
                  ? Math.round(powerActivities.reduce((acc, a) => acc + (a.average_watts || a.icu_average_watts || 0), 0) / powerActivities.length)
                  : 0;

                const npActivities = filtered.filter(a => getNormalizedPower(a) > 0);
                const avgNpVal = npActivities.length > 0
                  ? Math.round(npActivities.reduce((acc, a) => acc + getNormalizedPower(a), 0) / npActivities.length)
                  : 0;

                // Average Heart Rate
                const hrActivities = filtered.filter(a => a.average_heartrate && a.average_heartrate > 0);
                const avgHrVal = hrActivities.length > 0
                  ? Math.round(hrActivities.reduce((acc, a) => acc + (a.average_heartrate || 0), 0) / hrActivities.length)
                  : 0;

                // Efficiency Factor
                const efActivities = filtered.filter(a => {
                  if (typeof a.icu_efficiency_factor === 'number' && a.icu_efficiency_factor > 0) return true;
                  const np = getNormalizedPower(a) || (a.average_watts || a.icu_average_watts || 0);
                  const hr = a.average_heartrate || 0;
                  return np > 0 && hr > 0;
                });

                const avgEfVal = efActivities.length > 0
                  ? efActivities.reduce((acc, a) => {
                      if (typeof a.icu_efficiency_factor === 'number' && a.icu_efficiency_factor > 0) {
                        return acc + a.icu_efficiency_factor;
                      }
                      const np = getNormalizedPower(a) || (a.average_watts || a.icu_average_watts || 0);
                      const hr = a.average_heartrate || 1;
                      return acc + (np / hr);
                    }, 0) / efActivities.length
                  : 0;

                const avgEf = avgEfVal > 0 ? formatThousand(avgEfVal, 2) : '—';

                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 sm:p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-0.5">
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">Total Volume</span>
                        <p className="text-base sm:text-lg font-bold text-white font-mono leading-tight">{totalHours}h</p>
                        <span className="text-[9px] text-slate-500 block truncate">{filtered.length} activities logged</span>
                      </div>
                      <div className="p-2.5 sm:p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-0.5">
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">Training Load</span>
                        <p className="text-base sm:text-lg font-bold text-amber-400 font-mono leading-tight">{totalTss} TSS</p>
                        <span className="text-[9px] text-slate-500 block truncate">
                          {insightsPeriod === 'week' 
                            ? (selectedWeekOffset === 0 ? 'Last 7 days total load' : 'Weekly total load') 
                            : (insightsPeriod === 'month' && selectedMonthOffset === 0 ? 'Rolling 30 days load' : `${avgTssPerWeek} TSS / week avg`)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 sm:p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-0.5">
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">Distance</span>
                        <p className="text-base sm:text-lg font-bold text-cyan-400 font-mono leading-tight">{totalDistKm} km</p>
                        <span className="text-[9px] text-slate-500 block truncate">Total distance covered</span>
                      </div>
                      <div className="p-2.5 sm:p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-0.5">
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">Power (Avg / NP)</span>
                        <p className="text-base sm:text-lg font-bold text-emerald-400 font-mono truncate leading-tight">
                          {avgWattsVal ? `${formatThousand(avgWattsVal)}W` : '—'}
                          <span className="text-slate-500 font-normal text-xs mx-1">/</span>
                          <span className="text-emerald-300">{avgNpVal ? `${formatThousand(avgNpVal)}W` : '—'}</span>
                        </p>
                        <span className="text-[9px] text-slate-500 block truncate">Avg power / NP</span>
                      </div>
                    </div>

                  <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 sm:p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-0.5">
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">Avg Heart Rate</span>
                        <p className="text-base sm:text-lg font-bold text-rose-400 font-mono leading-tight">
                          {avgHrVal ? `${formatThousand(avgHrVal)} bpm` : '—'}
                        </p>
                        <span className="text-[9px] text-slate-500 block truncate">{hrActivities.length} activities with HR</span>
                      </div>
                      <div className="p-2.5 sm:p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-0.5">
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">Efficiency Factor</span>
                        <p className="text-base sm:text-lg font-bold text-violet-400 font-mono leading-tight">{avgEf}</p>
                        <span className="text-[9px] text-slate-500 block truncate">NP / HR efficiency</span>
                      </div>
                    </div>
                  </div>

                );
              })()}
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
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[340px] bg-[#080b11]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-1 shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex items-center justify-between gap-1">
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
                    className="absolute inset-0 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon 
                  size={15} 
                  className={`transition-colors duration-200 ${
                    isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`} 
                />
                <span 
                  className={`text-[8.5px] uppercase tracking-wider transition-all duration-200 ${
                    isActive ? 'text-emerald-400 font-semibold' : 'text-slate-500 group-hover:text-slate-400 font-normal'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
    </div>
  );
};

export default App;
