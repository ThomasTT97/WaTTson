import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Plus, 
  Minus 
} from 'lucide-react';
import { Activity, DailySuggestion, WeeklyBriefing } from '../types';
import { parsePlanDirectives } from '../services/directiveService';

export interface DayDurationItem {
  id: string;
  dayName: string;
  dayShort: string;
  dateStr: string;
  durationMins: number;
  isToday: boolean;
  statusText?: string;
  statusType?: 'completed' | 'scheduled' | 'rest' | 'default';
}

export interface SavedAvailabilityDay {
  dayShort: string;
  dayName: string;
  dateStr: string;
  durationMins: number;
  formattedDuration: string;
}

export interface SavedAvailabilityRecord {
  savedAt: string;
  formattedTime: string;
  totalMinutes: number;
  totalHours: string;
  trainingDaysCount: number;
  restDaysCount: number;
  directiveText: string;
  days: SavedAvailabilityDay[];
}

export const AVAILABILITY_STORAGE_KEY = 'wattson_last_saved_availability';

interface PlanAndChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPlan: (directiveText: string, updatedDays?: DayDurationItem[]) => void;
  weeklyBriefing?: WeeklyBriefing | null;
  activities?: Activity[] | null;
  suggestion?: DailySuggestion | null;
  planContext?: string | null;
  onUpdatePlanContext?: (newContext: string) => void;
  userGoal?: string;
  hasRideToday?: boolean;
}

export const formatDurationDisplay = (mins: number): string => {
  if (mins <= 0) return 'Rest';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h${m < 10 ? `0${m}` : m}`;
};

export const parseDurationStrToMins = (str: string): number => {
  if (!str) return 60;
  const s = str.trim().toLowerCase();
  if (s === 'rest' || s === '0' || s === '0h' || s === '0m') return 0;
  
  const hMatch = s.match(/^([\d.]+)h$/);
  if (hMatch) {
    return Math.round(parseFloat(hMatch[1]) * 60);
  }
  
  const mMatch = s.match(/^(\d+)m$/);
  if (mMatch) {
    return parseInt(mMatch[1], 10);
  }

  const hmMatch = s.match(/^(\d+)h\s*(\d+)m$/);
  if (hmMatch) {
    return parseInt(hmMatch[1], 10) * 60 + parseInt(hmMatch[2], 10);
  }

  const num = parseInt(s, 10);
  return isNaN(num) ? 60 : num;
};

export const formatFriendlyTimestamp = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (isToday) {
      return `Today at ${timeStr}`;
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${timeStr}`;
    }
    
    const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${dateFormatted} at ${timeStr}`;
  } catch {
    return dateStr;
  }
};

export const parseScheduleDirective = (directiveText: string, savedAt?: string): SavedAvailabilityRecord | null => {
  if (!directiveText || !directiveText.toLowerCase().includes('weekly schedule')) return null;
  
  const scheduleMatch = directiveText.match(/Adjusted weekly schedule:\s*(.*?)(?:\s*\(Total:\s*([\d.]+)h?\))?$/i);
  if (!scheduleMatch) return null;
  
  const daySegments = scheduleMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  const days: SavedAvailabilityDay[] = [];
  let totalMins = 0;
  
  const dayNames: Record<string, string> = {
    MON: 'Monday',
    TUE: 'Tuesday',
    WED: 'Wednesday',
    THU: 'Thursday',
    FRI: 'Friday',
    SAT: 'Saturday',
    SUN: 'Sunday'
  };

  for (const seg of daySegments) {
    const parts = seg.split(':').map(p => p.trim());
    if (parts.length >= 2) {
      const dayShort = parts[0].toUpperCase();
      const durStr = parts.slice(1).join(':').trim();
      const mins = parseDurationStrToMins(durStr);
      totalMins += mins;
      
      days.push({
        dayShort,
        dayName: dayNames[dayShort] || dayShort,
        dateStr: '',
        durationMins: mins,
        formattedDuration: formatDurationDisplay(mins)
      });
    }
  }
  
  if (days.length === 0) return null;
  
  const totalHours = scheduleMatch[2] || (totalMins / 60).toFixed(1).replace('.0', '');
  const trainingDaysCount = days.filter(d => d.durationMins > 0).length;
  const restDaysCount = days.length - trainingDaysCount;
  
  return {
    savedAt: savedAt || new Date().toISOString(),
    formattedTime: savedAt ? formatFriendlyTimestamp(savedAt) : 'Previously applied',
    totalMinutes: totalMins,
    totalHours,
    trainingDaysCount,
    restDaysCount,
    directiveText,
    days
  };
};

export const PlanAndChangeModal: React.FC<PlanAndChangeModalProps> = ({
  isOpen,
  onClose,
  onApplyPlan,
  weeklyBriefing,
  activities,
  suggestion,
  planContext
}) => {
  const [days, setDays] = useState<DayDurationItem[]>([]);

  const loadSavedAvailability = useCallback((): SavedAvailabilityRecord | null => {
    try {
      const stored = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse wattson_last_saved_availability from localStorage', e);
    }

    if (planContext) {
      try {
        const directives = parsePlanDirectives(planContext);
        const schedDir = [...directives].reverse().find(d => 
          d.text.toLowerCase().includes('weekly schedule')
        );
        if (schedDir) {
          const parsedFromDir = parseScheduleDirective(schedDir.text, schedDir.requestedAt);
          if (parsedFromDir) {
            return parsedFromDir;
          }
        }
      } catch (e) {
        console.warn('Failed to parse availability from planContext', e);
      }
    }

    return null;
  }, [planContext]);

  // Initialize and prefill days: previously set availability is prioritized and preserved
  useEffect(() => {
    if (!isOpen) return;

    const saved = loadSavedAvailability();

    const today = new Date();
    const toLocalDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const getDayShort = (d: Date) => {
      return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
    };

    const getDayName = (d: Date) => {
      return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    };

    const initialDays: DayDurationItem[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const isToday = i === 0;
      const dateStr = toLocalDateStr(d);
      const dayShort = getDayShort(d);
      const dayName = getDayName(d);

      // Find matching day from previously set availability
      const savedMatch = saved?.days?.find(sd => 
        (sd.dateStr && sd.dateStr === dateStr) || sd.dayShort === dayShort
      );

      let prefilledMins = 60;
      if (savedMatch !== undefined) {
        // A set availability is strictly kept
        prefilledMins = savedMatch.durationMins;
      } else {
        // Fallback if no availability was ever set
        const plannedDay = weeklyBriefing?.days?.find(dayItem => {
          if (dayItem.day && dayShort) {
            return dayItem.day.toUpperCase().startsWith(dayShort) || dayShort.startsWith(dayItem.day.toUpperCase());
          }
          return false;
        });

        if (plannedDay) {
          const isRest = plannedDay.intensity === 'Rest' || 
                         (plannedDay.focus || '').toLowerCase().includes('rest') || 
                         (plannedDay.duration_target || 0) <= 0;
          prefilledMins = isRest ? 0 : (plannedDay.duration_target || 60);
        } else if (isToday && suggestion?.primary?.duration_minutes) {
          prefilledMins = suggestion.primary.duration_minutes;
        }
      }

      initialDays.push({
        id: `day_${i}_${dateStr}`,
        dayName,
        dayShort,
        dateStr,
        durationMins: prefilledMins,
        isToday
      });
    }

    setDays(initialDays);
  }, [isOpen, weeklyBriefing, activities, suggestion, loadSavedAvailability]);

  if (!isOpen) return null;

  const handleStep = (index: number, deltaMinutes: number) => {
    setDays(prev => {
      const next = [...prev];
      const current = next[index].durationMins;
      
      let updated = current;
      if (deltaMinutes > 0) {
        if (current === 0) {
          updated = 30;
        } else if (current % 30 !== 0) {
          updated = Math.ceil(current / 30) * 30;
        } else {
          updated = current + 30;
        }
      } else {
        if (current <= 30) {
          updated = 0;
        } else if (current % 30 !== 0) {
          updated = Math.floor(current / 30) * 30;
        } else {
          updated = current - 30;
        }
      }

      const clamped = Math.max(0, Math.min(360, updated));
      next[index] = {
        ...next[index],
        durationMins: clamped
      };
      return next;
    });
  };

  const totalMinutes = days.reduce((acc, d) => acc + d.durationMins, 0);
  const totalHours = (totalMinutes / 60).toFixed(1).replace('.0', '');
  const trainingDaysCount = days.filter(d => d.durationMins > 0).length;
  const restDaysCount = 7 - trainingDaysCount;

  const handleApply = () => {
    const parts = days.map(d => {
      const formatted = formatDurationDisplay(d.durationMins);
      return `${d.dayShort}: ${formatted}`;
    });
    const directiveText = `Adjusted weekly schedule: ${parts.join(', ')} (Total: ${totalHours}h)`;

    const now = new Date();
    const newRecord: SavedAvailabilityRecord = {
      savedAt: now.toISOString(),
      formattedTime: formatFriendlyTimestamp(now.toISOString()),
      totalMinutes,
      totalHours,
      trainingDaysCount,
      restDaysCount,
      directiveText,
      days: days.map(d => ({
        dayShort: d.dayShort,
        dayName: d.dayName,
        dateStr: d.dateStr,
        durationMins: d.durationMins,
        formattedDuration: formatDurationDisplay(d.durationMins)
      }))
    };

    try {
      localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(newRecord));
    } catch (err) {
      console.warn('Could not save availability to localStorage:', err);
    }

    onApplyPlan(directiveText, days);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-[#0b0f19] w-full h-full p-4 sm:p-5 relative border border-white/10 shadow-2xl space-y-3.5 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Minimalist Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white tracking-tight">
              Availability
            </h2>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/5">
              {totalHours}h / week
            </span>
          </div>

          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-full cursor-pointer"
            aria-label="Close modal"
          >
            <X size={17} />
          </button>
        </div>

        {/* Minimalist Days List: Only days & hours available per day */}
        <div className="space-y-1.5 overflow-y-auto flex-1">
          {days.map((day, idx) => {
            const isRest = day.durationMins <= 0;
            const displayStr = formatDurationDisplay(day.durationMins);

            return (
              <div
                key={day.id}
                className={`flex items-center justify-between px-3 py-2 rounded-2xl border transition-colors ${
                  day.isToday
                    ? 'bg-emerald-500/[0.04] border-emerald-500/25'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                {/* Day name */}
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold tracking-tight ${isRest ? 'text-slate-400' : 'text-slate-200'}`}>
                    {day.dayName}
                  </span>
                  {day.isToday && (
                    <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[8px] font-black rounded uppercase tracking-wider">
                      Today
                    </span>
                  )}
                </div>

                {/* Hours available stepper */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleStep(idx, -30)}
                    disabled={day.durationMins <= 0}
                    className="w-7 h-7 rounded-lg bg-slate-900 border border-white/10 hover:border-white/25 hover:bg-slate-800 active:scale-95 disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center justify-center text-slate-300 cursor-pointer"
                    aria-label={`Decrease duration for ${day.dayName}`}
                  >
                    <Minus size={12} className="stroke-[2.5]" />
                  </button>

                  <div className={`w-14 h-7 rounded-lg border flex items-center justify-center font-mono text-xs font-bold transition-all ${
                    isRest 
                      ? 'bg-slate-950/60 border-white/5 text-slate-400' 
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}>
                    {displayStr}
                  </div>

                  <button
                    onClick={() => handleStep(idx, +30)}
                    disabled={day.durationMins >= 360}
                    className="w-7 h-7 rounded-lg bg-slate-900 border border-white/10 hover:border-emerald-500/40 hover:bg-slate-800 active:scale-95 disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center justify-center text-slate-300 hover:text-emerald-400 cursor-pointer"
                    aria-label={`Increase duration for ${day.dayName}`}
                  >
                    <Plus size={12} className="stroke-[2.5]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Minimalist Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          <button
            onClick={() => {
              // Reset to planned schedule
              const saved = loadSavedAvailability();
              const today = new Date();
              const toLocalDateStr = (d: Date) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              };
              const getDayShort = (d: Date) => {
                return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
              };

              setDays(days.map((day, i) => {
                const d = new Date();
                d.setDate(today.getDate() + i);
                const dayShort = getDayShort(d);

                const plannedDay = weeklyBriefing?.days?.find(dayItem => {
                  if (dayItem.day && dayShort) {
                    return dayItem.day.toUpperCase().startsWith(dayShort) || dayShort.startsWith(dayItem.day.toUpperCase());
                  }
                  return false;
                });

                let mins = 60;
                if (plannedDay) {
                  const isRest = plannedDay.intensity === 'Rest' || 
                                 (plannedDay.focus || '').toLowerCase().includes('rest') || 
                                 (plannedDay.duration_target || 0) <= 0;
                  mins = isRest ? 0 : (plannedDay.duration_target || 60);
                }
                
                return { ...day, durationMins: mins };
              }));
            }}
            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            Reset to Optimal
          </button>
          
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            Cancel
          </button>

          <button
            onClick={handleApply}
            className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] shadow-md shadow-emerald-500/20 text-center cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
