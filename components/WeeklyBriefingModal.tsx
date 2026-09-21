import React, { useState, useEffect } from 'react';
import { Activity, Wellness, WeeklyBriefing, IntervalsCredentials, DailySuggestion, AnnualPowerCurve } from '../types';
import { uploadWorkout } from '../services/intervalsService';
import { scaleLabelWatts, GroupedWorkoutStepsList, isEnduranceWorkout, VisualProfileChart, calculateWorkoutAverageWatts } from './StepLabel';
import { SuggestedWorkoutCard } from './SuggestedWorkoutCard';
import { 
  X, Sparkles, Trophy, Clock, Zap, Info, 
  Calendar as CalendarIcon, Check, Loader2, RefreshCw,
  Sliders, CheckCircle, Activity as ActivityIcon
} from 'lucide-react';

interface WeeklyBriefingModalProps {
  activities: Activity[];
  wellness: Wellness[];
  creds: IntervalsCredentials;
  userGoal?: string;
  onClose: () => void;
  todaySuggestion?: DailySuggestion | null;
  ftp?: number;
  powerCurves?: AnnualPowerCurve[];
  planContext?: string;
  weeklyBriefing: WeeklyBriefing | null;
  weeklyBriefingError?: string | null;
  loadingWeeks: { [week: number]: boolean };
  reworkingWeeks: number[];
  generatedWeeks: number[];
  onFetchWeek: (weekIndex: number) => void;
  planMode?: 'power' | 'hr';
  onPlanModeChange?: (mode: 'power' | 'hr') => void;
  onResetPlanContext?: () => void;
  onUpdatePlanContext?: (context: string, weekIndex?: number) => void;
  onForceRefresh?: () => void;
}

const toLocalDateStr = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatTweakForDisplay = (directive: string) => {
  return directive
    .replace(/^Modify Entire Plan: /, 'Plan: ')
    .replace(/^Modify Week (\d+): /, 'Week $1: ')
    .replace(/^Modify /, '')
    .replace(/\. Please regenerate.*$/, '')
    .replace(/\. Please focus.*$/, '');
};

export const WeeklyBriefingModal: React.FC<WeeklyBriefingModalProps> = ({ 
  activities, userGoal, onClose, creds, ftp, planContext, onResetPlanContext, onUpdatePlanContext,
  weeklyBriefing, weeklyBriefingError, loadingWeeks, reworkingWeeks, generatedWeeks, onFetchWeek, onForceRefresh,
  planMode = 'power', onPlanModeChange
}) => {
  const [selectedDay, setSelectedDay] = useState<WeeklyBriefing['days'][0] | null>(null);
  
  // DRIVER: activeWeek is selected via a simple tab bar at the top!
  const [activeWeek, setActiveWeek] = useState<1 | 2 | 3 | 4>(1);

  // Unified tweak states
  const [tweakText, setTweakText] = useState('');
  const [tweakTarget, setTweakTarget] = useState<'week' | 'plan'>('week'); // target week or whole plan
  const [rideTweakText, setRideTweakText] = useState('');

  useEffect(() => {
    [2, 3, 4].forEach(wk => {
      if (!generatedWeeks.includes(wk) && !loadingWeeks[wk]) {
        onFetchWeek(wk);
      }
    });
  }, [generatedWeeks, loadingWeeks, onFetchWeek]);

  const handleClearAllTweaks = () => {
    localStorage.removeItem('wattson_plan_tweaks');
    if (onResetPlanContext) {
      onResetPlanContext();
    }
  };

  const handleRemoveTweak = (index: number) => {
    if (!planContext) return;
    let currentTweaks = planContext.split(' ; ').filter(Boolean);
    currentTweaks.splice(index, 1);
    
    if (currentTweaks.length === 0) {
      localStorage.removeItem('wattson_plan_tweaks');
      if (onResetPlanContext) {
        onResetPlanContext();
      }
    } else {
      const newContext = currentTweaks.join(' ; ');
      localStorage.setItem('wattson_plan_tweaks', JSON.stringify(currentTweaks));
      if (onUpdatePlanContext) {
        onUpdatePlanContext(newContext, undefined);
      }
    }
  };

  const handleAddTweak = (newTweakDirective: string, weekIndex?: number) => {
    let currentTweaks: string[] = [];
    if (planContext) {
      currentTweaks = planContext.split(' ; ').filter(Boolean);
    }
    currentTweaks.push(newTweakDirective);
    const newContext = currentTweaks.join(' ; ');
    
    localStorage.setItem('wattson_plan_tweaks', JSON.stringify(currentTweaks));
    if (onUpdatePlanContext) {
      onUpdatePlanContext(newContext, weekIndex);
    }
  };

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

  const getWeek1Length = () => {
    if (!weeklyBriefing || weeklyBriefing.days.length === 0) return 7;
    const firstDay = weeklyBriefing.days[0].day;
    const dayOfWeek = getDayOfWeekFromAbbr(firstDay);
    return 8 - dayOfWeek;
  };

  const getDaysForWeek = (wk: 1 | 2 | 3 | 4) => {
    if (!weeklyBriefing) return [];
    const week1Len = getWeek1Length();
    if (wk === 1) {
      return weeklyBriefing.days.slice(0, week1Len);
    }
    const startIndex = week1Len + (wk - 2) * 7;
    return weeklyBriefing.days.slice(startIndex, startIndex + 7);
  };

  const getWeekForDay = (dayObj: WeeklyBriefing['days'][0]) => {
    if (!weeklyBriefing) return 1;
    for (let wk = 1; wk <= 4; wk++) {
      const days = getDaysForWeek(wk as any);
      if (days.some(d => d.day === dayObj.day)) {
        return wk;
      }
    }
    return 1;
  };

  const getWeekSummaryStats = (wk: 1 | 2 | 3 | 4) => {
    const days = getDaysForWeek(wk);
    if (!days || days.length === 0) return null;
    
    const totalTss = days.reduce((sum, d) => sum + d.load_target, 0);
    const totalDuration = days.reduce((sum, d) => sum + d.duration_target, 0);
    const restDays = days.filter(d => d.intensity === 'Rest' || d.load_target === 0).length;
    const workDays = days.length - restDays;
    
    const primaryFocuses = Array.from(new Set(days.filter(d => d.intensity !== 'Rest' && d.focus).map(d => d.focus)));
    
    return {
      totalTss,
      totalDuration,
      restDays,
      workDays,
      days,
      primaryFocuses
    };
  };

  const weekPhaseNames = {
    1: "Build & Adapt",
    2: "Peak Progression",
    3: "Target Taper",
    4: "Recovery & Test"
  };

  const selectedWeekStats = getWeekSummaryStats(activeWeek);
  const isWeekLoading = loadingWeeks[activeWeek];

  // Quick preset tweak options
  const weekPresets = [
    { label: '🛌 Deload', value: 'make this week active recovery/deload' },
    { label: '🚀 Peak Build', value: 'progress to peak intensity and higher TSS' },
    { label: '🏔️ Base Focus', value: 'focus heavily on aerobic base endurance' },
    { label: '⏱️ Sweet Spot', value: 'focus on sweet spot tempo work' }
  ];

  const planPresets = [
    { label: '🛌 Deload Block', value: 'make the entire plan an active recovery/deload focus' },
    { label: '🚀 Progress Plan', value: 'progress the entire plan with higher TSS targets' },
    { label: '⏱️ Time-Crunched', value: 'shorten midweek workouts but keep intensity' }
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-[#05070a]/95 backdrop-blur-3xl flex flex-col animate-in slide-in-from-bottom duration-300 md:max-w-[480px] md:mx-auto md:shadow-2xl overflow-hidden">
      
      {/* Header */}
      <div 
        className="flex-none flex items-center justify-between pb-3 px-6 border-b border-white/5 bg-transparent animate-in fade-in"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
      >
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl glass-card flex flex-shrink-0 items-center justify-center shadow-inner relative overflow-hidden border border-white/10">
             <CalendarIcon size={18} className="text-emerald-400" />
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-white italic tracking-tight leading-none">
                wa<span className="text-emerald-400">TT</span>son
              </h2>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-white/5 font-mono">PLAN</span>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 items-center">
          <button 
            onClick={onForceRefresh}
            disabled={Object.values(loadingWeeks).some(Boolean)}
            className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-emerald-400 border border-emerald-500/20 active:scale-95 transition-all shadow-[0_0_15px_rgba(34,211,238,0.15)] disabled:opacity-50"
            title="Refresh Plan"
          >
            <RefreshCw size={16} className={Object.values(loadingWeeks).some(Boolean) ? "animate-spin text-emerald-400" : ""} />
          </button>
          
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-slate-500 border border-white/10 active:scale-95 transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Week Segmented Tab switcher */}
      <div className="flex-none px-5 py-3 border-b border-white/5 bg-slate-950/25">
        <div className="flex gap-1.5 p-1 bg-[#090d14]/85 rounded-xl border border-white/5">
          {([1, 2, 3, 4] as const).map((wk) => (
            <button
              key={wk}
              onClick={() => setActiveWeek(wk)}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition-all tracking-wider relative ${
                activeWeek === wk 
                  ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-md scale-[1.02]' 
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              <span>W{wk}</span>
              {loadingWeeks[wk] && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-sky-400 rounded-full animate-ping" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable container for current selected week list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 flex flex-col gap-4 relative">
        
        {/* Loader overlay when reworking / AI generation is happening */}
        {reworkingWeeks.length > 0 && (
          <div className="absolute inset-0 bg-[#05070a]/95 backdrop-blur-md flex flex-col items-center justify-center z-50 p-6 text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.15)] relative overflow-hidden">
              <Loader2 size={32} className="animate-spin text-emerald-400" />
            </div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider mb-2 italic">Coach waTTson is calibrating your training block</h4>
            <p className="text-slate-500 text-[10px] uppercase font-mono tracking-widest">Applying custom adaptations...</p>
          </div>
        )}

        {/* Selected Week Info & Stats Card */}
        {selectedWeekStats && !isWeekLoading && (
          <div className="p-4 rounded-2xl border border-white/5 bg-slate-950/40 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Week {activeWeek} Focus</span>
                <h3 className="text-sm font-black text-white uppercase tracking-tight">
                  {weekPhaseNames[activeWeek]}
                </h3>
              </div>

              {/* Intensity Mode Toggle (Power vs Heart Rate) */}
              {onPlanModeChange && (
                <div className="flex bg-[#090d14] border border-white/5 p-0.5 rounded-lg">
                  {(['power', 'hr'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onPlanModeChange(mode)}
                      className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider transition-all ${
                        planMode === mode 
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-bold' 
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {mode === 'power' ? 'FTP' : 'HR'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Micro Stats Row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[#0c0f16]/85 border border-white/5 rounded-xl p-2 flex flex-col items-center">
                <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-widest">TSS Target</span>
                <span className="text-sm font-black text-emerald-400 font-mono mt-0.5">
                  {selectedWeekStats.totalTss}
                </span>
              </div>
              <div className="bg-[#0c0f16]/85 border border-white/5 rounded-xl p-2 flex flex-col items-center">
                <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-widest">Total Duration</span>
                <span className="text-sm font-black text-white font-mono mt-0.5 truncate max-w-full">
                  {Math.floor(selectedWeekStats.totalDuration / 60)}h {selectedWeekStats.totalDuration % 60}m
                </span>
              </div>
              <div className="bg-[#0c0f16]/85 border border-white/5 rounded-xl p-2 flex flex-col items-center">
                <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-widest">Rides count</span>
                <span className="text-sm font-black text-slate-300 font-mono mt-0.5">
                  {selectedWeekStats.workDays}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Selected Week Days List */}
        <div className="flex flex-col gap-2">
          {isWeekLoading ? (
            <div className="p-12 rounded-2xl flex flex-col items-center justify-center border border-white/5 bg-slate-950/20">
              <Loader2 size={24} className="animate-spin text-emerald-500 mb-2" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 animate-pulse">Analyzing Week {activeWeek} suggestions...</span>
            </div>
          ) : selectedWeekStats ? (
            <div className="flex flex-col gap-2 animate-in fade-in duration-300">
              {selectedWeekStats.days.map((day, dIdx) => {
                const absoluteIdx = weeklyBriefing ? weeklyBriefing.days.indexOf(day) : dIdx;
                const today = new Date();
                const dayNum = today.getDate();
                const monthStr = today.toLocaleDateString('en-US', { month: 'short' });
                const isToday = day.day.includes(`(${monthStr} ${dayNum})`);

                return (
                  <SuggestedWorkoutCard 
                    key={dIdx}
                    day={day}
                    absoluteIndex={absoluteIdx}
                    onClick={setSelectedDay}
                    isToday={isToday}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">No plan loaded for Week {activeWeek}.</span>
            </div>
          )}
        </div>

        {/* Active plan tweaks list */}
        {planContext && planContext.split(' ; ').filter(Boolean).length > 0 && (
          <div className="flex flex-col gap-2 p-3 bg-[#0a0d14]/40 border border-white/5 rounded-2xl animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center px-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <Sliders size={8} className="text-emerald-400" /> Active Adaptations ({planContext.split(' ; ').filter(Boolean).length})
              </span>
              <button 
                onClick={handleClearAllTweaks}
                className="text-[8px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-widest hover:underline font-mono"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {planContext.split(' ; ').filter(Boolean).map((tweak, index) => (
                <div 
                  key={index} 
                  className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-[8.5px] font-semibold text-emerald-400"
                >
                  <span className="truncate max-w-[200px]">{formatTweakForDisplay(tweak)}</span>
                  <button 
                    onClick={() => handleRemoveTweak(index)}
                    className="hover:bg-emerald-500/20 p-0.5 rounded text-emerald-400/70 hover:text-emerald-400"
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Simplified Plan Tweak Input */}
        <div className="p-4 rounded-2xl border border-white/5 bg-slate-950/40 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles size={10} className="text-emerald-400" /> Adapt Entire Training Block
            </span>
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              value={tweakText}
              onChange={(e) => setTweakText(e.target.value)}
              placeholder="e.g., Focus on base miles, reduce intensity..."
              className="w-full bg-[#090d14] border border-white/10 rounded-xl pl-3.5 pr-16 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-semibold shadow-inner"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tweakText.trim() && !isWeekLoading) {
                  const text = tweakText.trim();
                  const directive = `Modify Entire Plan: ${text}. Please focus the entire plan on this adjustment.`;
                  handleAddTweak(directive, undefined);
                  setTweakText('');
                }
              }}
            />
            <button
              onClick={() => {
                const text = tweakText.trim();
                if (!text) return;
                const directive = `Modify Entire Plan: ${text}. Please focus the entire plan on this adjustment.`;
                handleAddTweak(directive, undefined);
                setTweakText('');
              }}
              disabled={!tweakText.trim() || isWeekLoading}
              className="absolute right-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-slate-950 font-black text-[9px] uppercase tracking-wider rounded-lg transition-colors"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Bottom Helper Info Block */}
        <div className="p-3 bg-slate-950/20 rounded-2xl border border-white/5 flex gap-3 items-center shrink-0">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
             <Info size={14} className="text-emerald-400" />
          </div>
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
            Your adaptations are sent to Google Gemini Pro to dynamically recalculate training targets and stress.
          </p>
        </div>

      </div>

      {/* Selected Workout Detail View Drawer / Modal overlay */}
      {selectedDay ? (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={() => setSelectedDay(null)}>
          <div className="bg-[#0c0e15] border-t sm:border border-white/10 w-full sm:max-w-md h-[100dvh] sm:h-auto sm:max-h-[88dvh] rounded-none sm:rounded-[2.2rem] p-5 sm:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] sm:shadow-2xl flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
            
            {/* Mobile drag handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 shrink-0 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-3 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px] tracking-wider uppercase shrink-0">
                  {selectedDay.day.split(' ')[0]}
                </div>
                <h3 className="text-sm sm:text-base font-black text-white italic tracking-tight uppercase truncate">
                  {selectedDay.focus}
                </h3>
              </div>
              <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 space-y-3.5">
              {/* Compact Metrics Strip */}
              {(() => {
                const isRestDay = selectedDay.intensity === 'Rest' || (selectedDay.focus || '').toLowerCase().includes('rest') || selectedDay.load_target === 0;
                const avgWatts = calculateWorkoutAverageWatts(
                  selectedDay.workout_steps,
                  ftp || 250,
                  weeklyBriefing?.ftp,
                  {
                    duration: selectedDay.duration_target,
                    focus: selectedDay.focus,
                    intensity: selectedDay.intensity,
                    load_target: selectedDay.load_target
                  }
                );

                return (
                  <div className="grid grid-cols-3 gap-2 p-3 bg-white/[0.03] border border-white/5 rounded-2xl">
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={11} className="text-blue-400" /> Duration
                      </span>
                      <span className="text-xs sm:text-sm font-black text-white mt-0.5">
                        {isRestDay || selectedDay.duration_target <= 0 
                          ? '—' 
                          : ((selectedDay.focus || '').toLowerCase().includes('endurance') || selectedDay.duration_target >= 60
                              ? (selectedDay.duration_target % 60 === 0 
                                  ? `${selectedDay.duration_target / 60}H` 
                                  : `${Math.floor(selectedDay.duration_target / 60)}H${selectedDay.duration_target % 60 > 0 ? (selectedDay.duration_target % 60 < 10 ? `0${selectedDay.duration_target % 60}` : selectedDay.duration_target % 60) : ''}`)
                              : `${selectedDay.duration_target} MIN`)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center border-x border-white/5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Zap size={11} fill="currentColor" className="text-amber-400" /> Load
                      </span>
                      <span className="text-xs sm:text-sm font-black text-amber-400 mt-0.5">
                        {isRestDay || selectedDay.load_target <= 0 ? '—' : `${selectedDay.load_target} TSS`}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <ActivityIcon size={11} className="text-emerald-400" /> Target
                      </span>
                      <span className="text-xs sm:text-sm font-black text-emerald-400 mt-0.5 uppercase">
                        {isRestDay ? '—' : (avgWatts ? `${avgWatts}W` : '—')}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {selectedDay.why && (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 text-center">
                  <p className="text-xs text-slate-300 leading-relaxed font-medium italic">
                    "{selectedDay.why}"
                  </p>
                </div>
              )}

              {selectedDay.workout_steps && selectedDay.workout_steps.length > 0 && (
                <div className="space-y-2.5">
                  <VisualProfileChart 
                    steps={selectedDay.workout_steps} 
                    currentFtp={ftp || undefined}
                    originalFtp={weeklyBriefing?.ftp}
                  />
                  <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3.5 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block border-b border-white/5 pb-1.5">
                      Intervals
                    </span>
                    <GroupedWorkoutStepsList 
                      steps={selectedDay.workout_steps}
                      currentFtp={ftp || undefined}
                      originalFtp={weeklyBriefing?.ftp}
                      fontSize="sm"
                    />
                  </div>
                </div>
              )}

              {/* Custom Tweak Input for this Ride */}
              <div className="relative flex items-center pt-1">
                <input
                  type="text"
                  id="weekly-custom-ride-tweak"
                  placeholder="Modify this ride..."
                  value={rideTweakText}
                  onChange={(e) => setRideTweakText(e.target.value)}
                  className="w-full bg-[#0a0d14] border border-white/10 rounded-xl pl-3 pr-16 py-2.5 text-[11px] text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-semibold"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && rideTweakText.trim()) {
                      const weekIdx = getWeekForDay(selectedDay);
                      const directive = `Modify ${selectedDay.focus} on ${selectedDay.day.split(' ')[0]}: ${rideTweakText.trim()}. Please focus on this adjustment.`;
                      handleAddTweak(directive, weekIdx);
                      setRideTweakText('');
                      setSelectedDay(null);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (!rideTweakText.trim()) return;
                    const weekIdx = getWeekForDay(selectedDay);
                    const directive = `Modify ${selectedDay.focus} on ${selectedDay.day.split(' ')[0]}: ${rideTweakText.trim()}. Please focus on this adjustment.`;
                    handleAddTweak(directive, weekIdx);
                    setRideTweakText('');
                    setSelectedDay(null);
                  }}
                  disabled={!rideTweakText.trim()}
                  className="absolute right-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-slate-950 font-black text-[9px] uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Footer close button */}
            <div className="pt-3 shrink-0 border-t border-white/5 mt-auto">
              <button 
                onClick={() => setSelectedDay(null)}
                className="w-full py-3 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      ) : null}

    </div>
  );
};
