import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Clock, 
  Plus, 
  Minus, 
  CheckCircle2,
  CalendarCheck
} from 'lucide-react';
import { Activity, DailySuggestion, WeeklyBriefing } from '../types';

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

interface PlanAndChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPlan: (directiveText: string) => void;
  weeklyBriefing?: WeeklyBriefing | null;
  activities?: Activity[] | null;
  suggestion?: DailySuggestion | null;
  planContext?: string | null;
  onUpdatePlanContext?: (newContext: string | null) => void;
  userGoal?: string;
  hasRideToday?: boolean;
}

const toLocalDateStr = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const formatDurationDisplay = (mins: number): string => {
  if (mins <= 0) return 'Rest';
  const hours = mins / 60;
  if (mins % 60 === 0) {
    return `${hours}h`;
  }
  if (mins % 30 === 0) {
    return `${hours.toFixed(1).replace('.0', '')}h`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h${m < 10 ? `0${m}` : m}`;
};

export const PlanAndChangeModal: React.FC<PlanAndChangeModalProps> = ({
  isOpen,
  onClose,
  onApplyPlan,
  weeklyBriefing,
  activities,
  suggestion
}) => {
  const [days, setDays] = useState<DayDurationItem[]>([]);

  // Initialize and prefill days from the current weekly plan, performed ride, or scheduled workout
  useEffect(() => {
    if (!isOpen) return;

    const today = new Date();
    const todayDateStr = toLocalDateStr(today);
    const initialDays: DayDurationItem[] = [];

    // 1. Check for performed activity today
    const safeActivities = activities || [];
    const performedToday = safeActivities.filter(a => {
      if (!a.start_date_local || !a.start_date_local.startsWith(todayDateStr)) return false;
      const dur = a.moving_time || a.elapsed_time || (a as any).time || (a as any).duration || (a as any).icu_recording_time || 0;
      const dist = a.distance || (a as any).icu_distance || 0;
      return dur >= 60 || dist >= 100;
    });

    let performedMinsToday = 0;
    if (performedToday.length > 0) {
      const totalSecs = performedToday.reduce((acc, a) => {
        return acc + (a.moving_time || a.elapsed_time || (a as any).time || (a as any).duration || (a as any).icu_recording_time || 0);
      }, 0);
      performedMinsToday = Math.round(totalSecs / 60);
    }

    // 2. Pre-calculate day offsets for weekly briefing
    const dayOffsets: number[] = [];
    let currentOffset = 0;
    let prevDayStr = '';
    if (weeklyBriefing?.days) {
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
    }

    // 3. Build the 7-day schedule
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      const dayShort = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayName = i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' }));
      const isToday = i === 0;

      // Find planned day from briefing
      let plannedDay: WeeklyBriefing['days'][0] | undefined;
      if (weeklyBriefing?.days) {
        // Try offset match first
        const offsetIdx = dayOffsets.findIndex(offset => offset === i);
        if (offsetIdx !== -1) {
          plannedDay = weeklyBriefing.days[offsetIdx];
        } else if (weeklyBriefing.days[i]) {
          plannedDay = weeklyBriefing.days[i];
        }
      }

      let prefilledMins = 60;
      let statusText = '60 minutes planned';
      let statusType: DayDurationItem['statusType'] = 'default';

      if (isToday) {
        // Handle Today specially: performed ride > scheduled workout > daily suggestion > fallback
        if (performedMinsToday > 0) {
          prefilledMins = performedMinsToday;
          statusText = `Completed ride (${formatDurationDisplay(performedMinsToday)})`;
          statusType = 'completed';
        } else if (plannedDay && (plannedDay.duration_target || 0) > 0 && plannedDay.intensity !== 'Rest' && !(plannedDay.focus || '').toLowerCase().includes('rest')) {
          prefilledMins = plannedDay.duration_target;
          statusText = `Scheduled: ${plannedDay.focus || 'Target Workout'}`;
          statusType = 'scheduled';
        } else if (suggestion?.primary && (suggestion.primary.duration_minutes || 0) > 0 && suggestion.primary.intensity !== 'Rest') {
          prefilledMins = suggestion.primary.duration_minutes;
          statusText = `Suggested: ${suggestion.primary.title || 'Workout'}`;
          statusType = 'scheduled';
        } else if (plannedDay && (plannedDay.intensity === 'Rest' || (plannedDay.focus || '').toLowerCase().includes('rest') || (plannedDay.duration_target || 0) <= 0)) {
          prefilledMins = 0;
          statusText = 'Rest Day planned';
          statusType = 'rest';
        } else if (suggestion?.primary && suggestion.primary.intensity === 'Rest') {
          prefilledMins = 0;
          statusText = 'Rest Day suggested';
          statusType = 'rest';
        } else {
          // Default for today based on weekday
          const dayOfWeek = d.getDay();
          prefilledMins = dayOfWeek === 0 ? 90 : (dayOfWeek === 6 ? 180 : 60);
          statusText = `${prefilledMins}m planned`;
          statusType = 'default';
        }
      } else {
        // Upcoming days (Tomorrow and beyond)
        if (plannedDay) {
          const isRest = plannedDay.intensity === 'Rest' || 
                         (plannedDay.focus || '').toLowerCase().includes('rest') || 
                         (plannedDay.duration_target || 0) <= 0;
          prefilledMins = isRest ? 0 : (plannedDay.duration_target || 60);
          statusText = isRest ? 'Rest Day' : `${plannedDay.focus || `${plannedDay.duration_target}m planned`}`;
          statusType = isRest ? 'rest' : 'scheduled';
        } else {
          // Fallback defaults
          const dayOfWeek = d.getDay();
          if (dayOfWeek === 1) { // Monday
            prefilledMins = 0;
            statusText = 'Rest Day';
            statusType = 'rest';
          } else if (dayOfWeek === 6) { // Saturday
            prefilledMins = 180;
            statusText = '180 minutes planned';
            statusType = 'default';
          } else if (dayOfWeek === 0) { // Sunday
            prefilledMins = 90;
            statusText = '90 minutes planned';
            statusType = 'default';
          } else if (dayOfWeek === 2 || dayOfWeek === 4) { // Tue / Thu
            prefilledMins = 75;
            statusText = '75 minutes planned';
            statusType = 'default';
          } else if (dayOfWeek === 5) { // Friday
            prefilledMins = 45;
            statusText = '45 minutes planned';
            statusType = 'default';
          } else {
            prefilledMins = 60;
            statusText = '60 minutes planned';
            statusType = 'default';
          }
        }
      }

      initialDays.push({
        id: `day_${i}_${d.toISOString().slice(0, 10)}`,
        dayName,
        dayShort,
        dateStr,
        durationMins: prefilledMins,
        isToday,
        statusText,
        statusType
      });
    }

    setDays(initialDays);
  }, [isOpen, weeklyBriefing, activities, suggestion]);

  if (!isOpen) return null;

  const handleStep = (index: number, deltaMinutes: number) => {
    setDays(prev => {
      const next = [...prev];
      const current = next[index].durationMins;
      
      let updated = current;
      if (deltaMinutes > 0) {
        // Increment: align to next 30m step or +30m
        if (current === 0) {
          updated = 30;
        } else if (current % 30 !== 0) {
          updated = Math.ceil(current / 30) * 30;
        } else {
          updated = current + 30;
        }
      } else {
        // Decrement: align to previous 30m step or -30m
        if (current <= 30) {
          updated = 0;
        } else if (current % 30 !== 0) {
          updated = Math.floor(current / 30) * 30;
        } else {
          updated = current - 30;
        }
      }

      // Clamp between 0 (Rest) and 360m (6h)
      const clamped = Math.max(0, Math.min(360, updated));
      next[index] = {
        ...next[index],
        durationMins: clamped,
        statusText: clamped === 0 ? 'Rest Day' : `${clamped} minutes planned`,
        statusType: clamped === 0 ? 'rest' : 'default'
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
    onApplyPlan(directiveText);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[#0b0f19] w-full max-w-md rounded-3xl p-4 sm:p-6 relative border border-white/10 shadow-2xl space-y-4 my-auto flex flex-col max-h-[92dvh] overflow-y-auto custom-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 pb-1 border-b border-white/5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9.5px] font-black uppercase tracking-wider">
              <Sparkles size={11} /> Plan & Change
            </div>
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
              Weekly Duration
            </h2>
            <p className="text-[11px] text-slate-400">
              Adapt your hours per day using the + or - buttons
            </p>
          </div>

          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Days List with + / - steppers */}
        <div className="space-y-2 py-1">
          {days.map((day, idx) => {
            const isRest = day.durationMins <= 0;
            const displayStr = formatDurationDisplay(day.durationMins);

            return (
              <div
                key={day.id}
                className={`flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition-all ${
                  day.isToday
                    ? 'bg-emerald-500/[0.04] border-emerald-500/30 shadow-sm'
                    : (isRest 
                        ? 'bg-slate-950/40 border-white/5 text-slate-400' 
                        : 'bg-white/[0.03] border-white/10 hover:border-emerald-500/30')
                }`}
              >
                {/* Left: Day info */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-mono shrink-0 ${
                    day.isToday 
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400' 
                      : (isRest ? 'bg-white/[0.02] border border-white/5 text-slate-400' : 'bg-white/5 border border-white/10 text-slate-200')
                  }`}>
                    <span className="text-[10px] font-black leading-none">{day.dayShort}</span>
                    <span className="text-[8.5px] text-slate-400 mt-0.5 leading-none">{day.dateStr.split(' ')[1]}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold leading-tight ${isRest ? 'text-slate-400' : 'text-slate-200'}`}>
                        {day.dayName}
                      </span>
                      {day.isToday && (
                        <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[8px] font-black rounded-md uppercase tracking-wider">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {day.isToday && day.statusType === 'completed' && (
                        <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
                      )}
                      {day.isToday && day.statusType === 'scheduled' && (
                        <CalendarCheck size={10} className="text-blue-400 shrink-0" />
                      )}
                      <span className="text-[10px] text-slate-400 truncate">
                        {day.statusText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Minimalist Stepper with - and + */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleStep(idx, -30)}
                    disabled={day.durationMins <= 0}
                    className="w-8 h-8 rounded-xl bg-slate-900 border border-white/10 hover:border-white/25 hover:bg-slate-800 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center justify-center text-slate-200 cursor-pointer shadow-sm"
                    title="Decrease duration by 30m"
                    aria-label={`Decrease duration for ${day.dayShort}`}
                  >
                    <Minus size={13} className="stroke-[2.5]" />
                  </button>

                  <div className={`w-16 h-8 rounded-xl border flex items-center justify-center px-1 font-mono text-xs font-black transition-all ${
                    isRest 
                      ? 'bg-slate-950/60 border-white/5 text-slate-400' 
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}>
                    {displayStr}
                  </div>

                  <button
                    onClick={() => handleStep(idx, +30)}
                    disabled={day.durationMins >= 360}
                    className="w-8 h-8 rounded-xl bg-slate-900 border border-white/10 hover:border-emerald-500/40 hover:bg-slate-800 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center justify-center text-slate-200 hover:text-emerald-400 cursor-pointer shadow-sm"
                    title="Increase duration by 30m"
                    aria-label={`Increase duration for ${day.dayShort}`}
                  >
                    <Plus size={13} className="stroke-[2.5]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total Summary Footer */}
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-emerald-400" />
            <span className="text-slate-300 font-medium">
              Total Volume: <strong className="text-white font-bold">{totalHours} Hours</strong>
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {trainingDaysCount} rides · {restDaysCount} rest
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            Cancel
          </button>

          <button
            onClick={handleApply}
            className="flex-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles size={14} className="fill-slate-950" />
            <span>Apply & Recalibrate</span>
          </button>
        </div>
      </div>
    </div>
  );
};
