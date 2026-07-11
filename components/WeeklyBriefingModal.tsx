import React, { useState, useRef } from 'react';
import { Activity, Wellness, WeeklyBriefing, IntervalsCredentials, DailySuggestion, AnnualPowerCurve } from '../types';
import { uploadWorkout } from '../services/intervalsService';
import { X, Sparkles, ChevronRight, Trophy, Clock, Zap, Info, Calendar as CalendarIcon, Check, Loader2, RefreshCw } from 'lucide-react';

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
  loadingWeeklyBriefing: boolean;
  onResetPlanContext?: () => void;
  onUpdatePlanContext?: (context: string) => void;
  onForceRefresh?: () => void;
}

const toLocalDateStr = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const WeeklyBriefingModal: React.FC<WeeklyBriefingModalProps> = ({ 
  activities, wellness, userGoal, onClose, todaySuggestion, creds, ftp, powerCurves, planContext, onResetPlanContext, onUpdatePlanContext,
  weeklyBriefing, loadingWeeklyBriefing, onForceRefresh
}) => {
  const [selectedDay, setSelectedDay] = useState<WeeklyBriefing['days'][0] | null>(null);
  const [syncingDay, setSyncingDay] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [activeWeek, setActiveWeek] = useState<1 | 2 | 3 | 4>(1);
  const [promptInput, setPromptInput] = useState('');
  const [showChangePlanPopup, setShowChangePlanPopup] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Simulated progress bar
  React.useEffect(() => {
    if (loadingWeeklyBriefing) {
      setLoadingProgress(0);
      const interval = setInterval(() => {
        setLoadingProgress(prev => (prev < 99 ? prev + 1 : prev));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100);
      const timeout = setTimeout(() => setLoadingProgress(0), 500);
      return () => clearTimeout(timeout);
    }
  }, [loadingWeeklyBriefing]);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingToRef = useRef<boolean>(false);

  const handleSyncToIntervals = async (day: WeeklyBriefing['days'][0], absoluteIndex: number) => {
    setSyncingDay(day.day);
    try {
      const todayStr = toLocalDateStr(new Date());
      const hasActivityToday = activities.some(a => a.start_date_local.startsWith(todayStr));
      const offset = hasActivityToday ? 1 : 0;

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + absoluteIndex + offset);
      const dateStr = toLocalDateStr(targetDate);
      
      const workoutText = day.workout_steps?.map(s => `- ${s.label || 'Step'} ${s.duration}m ${s.target_watts ? `${s.target_watts}w` : ''}`).join('\n') || day.why;

      await uploadWorkout(creds, {
        name: day.focus,
        description: day.why,
        date: dateStr,
        moving_time: day.duration_target * 60,
        icu_training_load: day.load_target,
        workout_text: workoutText
      });
      
      setSyncSuccess(day.day);
      setTimeout(() => setSyncSuccess(null), 3000);
    } catch (err) {
      console.error("Sync failed:", err);
      alert("Failed to sync workout to Intervals.icu calendar.");
    } finally {
      setSyncingDay(null);
    }
  };

  const intensityColors = {
    'Hard': 'text-red-400 bg-red-500/20 border-red-500/30',
    'Medium': 'text-orange-400 bg-orange-500/20 border-orange-500/30',
    'Easy': 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
    'Rest': 'text-slate-400 bg-slate-500/10 border-slate-500/20'
  };

  const intensityRowStyles = {
    'Hard': 'bg-gradient-to-r from-red-500/15 to-transparent border-red-500/20 shadow-red-950/20',
    'Medium': 'bg-gradient-to-r from-orange-500/15 to-transparent border-orange-500/20 shadow-orange-950/20',
    'Easy': 'bg-gradient-to-r from-emerald-500/15 to-transparent border-emerald-500/20 shadow-emerald-950/20',
    'Rest': 'bg-slate-900/40 border-white/5 opacity-80'
  };

  const getDayAbbr = (dayStr: string) => {
    const lower = dayStr.toLowerCase();
    if (lower.includes('mon')) return 'MON';
    if (lower.includes('tue')) return 'TUE';
    if (lower.includes('wed')) return 'WED';
    if (lower.includes('thu')) return 'THU';
    if (lower.includes('fri')) return 'FRI';
    if (lower.includes('sat')) return 'SAT';
    if (lower.includes('sun')) return 'SUN';
    const match = dayStr.match(/^([A-Za-z]{3})/);
    if (match) return match[1].toUpperCase();
    return dayStr.slice(0, 3).toUpperCase();
  };

  const getDayLabel = (dayStr: string) => {
    const match = dayStr.match(/\(([^)]+)\)/);
    if (match) return match[1];
    return '';
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

  const scrollToWeekSection = (wk: 1 | 2 | 3 | 4) => {
    isScrollingToRef.current = true;
    setActiveWeek(wk);
    const container = scrollContainerRef.current;
    const element = document.getElementById(`week-section-${wk}`);
    if (container && element) {
      container.scrollTo({
        top: element.offsetTop - 12,
        behavior: 'smooth'
      });
    }
    setTimeout(() => {
      isScrollingToRef.current = false;
    }, 800);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isScrollingToRef.current) return;
    const container = e.currentTarget;
    const scrollPositions = ([1, 2, 3, 4] as const).map(wk => {
      const el = document.getElementById(`week-section-${wk}`);
      if (!el) return { wk, distance: Infinity };
      // Measure offset relative to container scroll top
      const distance = Math.abs(el.offsetTop - container.scrollTop - 20);
      return { wk, distance };
    });
    
    const closest = scrollPositions.reduce((min, curr) => curr.distance < min.distance ? curr : min, { wk: 1 as any, distance: Infinity });
    if (closest.wk !== activeWeek) {
      setActiveWeek(closest.wk);
    }
  };

  const weekPhaseNames = {
    1: "Build & Adapt",
    2: "Peak Progression",
    3: "Target Taper",
    4: "Recovery & Test"
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#05070a]/95 backdrop-blur-3xl flex flex-col animate-in slide-in-from-bottom duration-300 md:max-w-[480px] md:mx-auto md:shadow-2xl overflow-hidden">
      
      {/* Header - Matches the Look and Feel of Global Top Bar */}
      <div 
        className="flex-none flex items-center justify-between pb-3 px-6 border-b border-white/5 bg-transparent"
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
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 items-center">
          <button 
            onClick={onForceRefresh}
            disabled={loadingWeeklyBriefing}
            className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-emerald-400 border border-emerald-500/20 active:scale-95 transition-all shadow-[0_0_15px_rgba(34,211,238,0.15)] disabled:opacity-50"
            title="Refresh Plan"
          >
            <RefreshCw size={16} className={loadingWeeklyBriefing ? "animate-spin text-emerald-400" : ""} />
          </button>
          
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-slate-500 border border-white/10 active:scale-95 transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* PINNED CONTROLS AREA ON TOP - Option to change via prompt */}
      <div className="flex-none px-5 py-3 border-b border-white/5 bg-slate-950/20 flex flex-col gap-2.5">
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowChangePlanPopup(true)}
            className="flex-1 py-2.5 bg-white/5 border border-white/10 hover:border-emerald-500/30 hover:bg-white/10 text-white font-black text-[11px] uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Sparkles size={12} className="text-emerald-400 animate-pulse" /> Change plan
          </button>
          {planContext && (
            <button
              onClick={() => {
                if (onResetPlanContext) onResetPlanContext();
              }}
              className="px-4 py-2.5 bg-white/5 border border-white/10 hover:border-amber-500/30 hover:bg-white/10 text-slate-400 hover:text-amber-400 font-black text-[11px] uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] flex items-center justify-center"
              title="Revert to Optimal Plan"
            >
              <RefreshCw size={12} /> Optimal
            </button>
          )}
        </div>

        {/* Week tab selectors (used as jump-to-week anchors) */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950/60 border border-white/5 rounded-xl">
          {([1, 2, 3, 4] as const).map((wk) => (
            <button
              key={wk}
              onClick={() => scrollToWeekSection(wk)}
              className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center ${
                activeWeek === wk
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              W{wk}
            </button>
          ))}
        </div>
      </div>

      {/* CONTINUOUS DAY-BY-DAY SCROLL CONTAINER */}
      <div 
        id="trainings-plan-scroll-container" 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 flex flex-col gap-5 relative scroll-smooth"
      >
        {loadingWeeklyBriefing ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-12 px-8 w-full">
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-white/5">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Calculating Trajectory...</p>
              <p className="text-[10px] font-bold text-emerald-400">{Math.round(loadingProgress)}%</p>
            </div>
          </div>
        ) : weeklyBriefing ? (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-12">
            
            {/* continuous 4-week render */}
            {([1, 2, 3, 4] as const).map((wk) => {
              const weekDays = getDaysForWeek(wk);
              return (
                <div 
                  key={wk} 
                  id={`week-section-${wk}`}
                  className="scroll-mt-3 flex flex-col gap-2 border-l border-white/5 pl-4 ml-2 relative"
                >
                  {/* Decorative timeline node */}
                  <div className="absolute -left-[5px] top-2.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#05070a] shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  
                  <div className="flex items-baseline justify-between mb-1">
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">
                      Week {wk} • <span className="text-emerald-400">{weekPhaseNames[wk]}</span>
                    </h3>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      {weekDays[0] && getDayLabel(weekDays[0].day)} — {weekDays[weekDays.length - 1] && getDayLabel(weekDays[weekDays.length - 1].day)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {weekDays.map((day, idx) => {
                      const absoluteIdx = weeklyBriefing ? weeklyBriefing.days.indexOf(day) : idx;
                      return (
                        <button 
                          key={idx} 
                          onClick={() => setSelectedDay(day)}
                          className={`w-full text-left py-2.5 px-3 rounded-xl border flex items-center gap-3 hover:brightness-110 active:scale-[0.99] transition-all shadow ${intensityRowStyles[day.intensity] || intensityRowStyles['Medium']}`}
                        >
                          {/* Day Box */}
                          <div className="w-9 h-9 rounded-lg bg-black/40 flex flex-col items-center justify-center shrink-0 border border-white/5">
                            <span className="text-[10px] font-black text-slate-300 uppercase leading-none tracking-tighter">{getDayAbbr(day.day)}</span>
                            {getDayLabel(day.day) && (
                              <span className="text-[7px] font-bold text-slate-500 mt-0.5 uppercase tracking-tighter">{getDayLabel(day.day)}</span>
                            )}
                          </div>

                          {/* Info Column */}
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <div className="flex items-baseline gap-1">
                              <span className="text-xl font-black text-white leading-none tracking-tighter italic">
                                {day.duration_target > 0 ? day.duration_target : '--'}
                              </span>
                              <span className="text-[8px] font-black text-slate-600 uppercase tracking-tighter leading-none">MIN</span>
                            </div>

                            <div className="flex items-center gap-1.5 mt-0.5 opacity-90">
                              {day.load_target > 0 ? (
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-1 leading-none">
                                  <Zap size={9} className="text-amber-500/80" fill="currentColor" /> Target {day.load_target} TSS
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter leading-none">Full Recovery</span>
                              )}
                            </div>
                          </div>

                          {/* Badge */}
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider min-w-[55px] text-center ${intensityColors[day.intensity] || intensityColors['Medium']}`}>
                              {day.intensity}
                            </span>
                            <ChevronRight size={12} className="text-slate-700" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Bottom info banner */}
            <div className="p-4 bg-slate-900/40 rounded-2xl border border-white/5 flex gap-3 items-center mt-2 shrink-0">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                 <Info size={14} className="text-emerald-500" />
              </div>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                Your 4-week trainings plan adapts automatically based on recorded stressors, wellness indicators, and power curves.
              </p>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center py-12 opacity-30">
            <p className="text-sm font-bold uppercase tracking-widest">Unable to generate trainings plan</p>
          </div>
        )}
      </div>

      {/* Why Detail Popup */}
      {selectedDay && (
        <div className="fixed inset-0 z-[110] bg-[#05070a]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedDay(null)}>
          <div className="bg-slate-950/80 w-full max-w-sm rounded-[2rem] p-6 pb-6 relative border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedDay(null)} className="absolute top-5 right-5 text-slate-500 hover:text-white transition-colors p-2 z-20 bg-black/40 rounded-full">
              <X size={18} />
            </button>
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-5 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)] relative flex-shrink-0">
                <Trophy size={28} className="text-emerald-400" />
              </div>
              
              <h3 className="text-xl font-black text-white italic tracking-tighter mb-1 uppercase text-center leading-tight">
                {selectedDay.day.toUpperCase()} FOCUS
              </h3>
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-6 text-center">{selectedDay.focus}</p>
              
              <div className="bg-black/60 p-5 rounded-3xl border border-white/5 w-full text-left space-y-4 relative overflow-hidden">
                 <div className="flex items-center justify-center gap-6 border-b border-white/5 pb-4">
                    <div className="flex items-center gap-2 text-sm font-black text-white tracking-tighter">
                       <Clock size={16} className="text-blue-400" /> {selectedDay.duration_target} MIN
                    </div>
                    <div className="flex items-center gap-2 text-sm font-black text-amber-400 italic">
                       <Zap size={16} fill="currentColor" className="text-amber-400" /> {selectedDay.load_target} TSS
                    </div>
                 </div>

                 <div className="space-y-3 py-2 max-h-[220px] overflow-y-auto custom-scrollbar px-1">
                   {selectedDay.workout_steps && selectedDay.workout_steps.length > 0 ? (
                      selectedDay.workout_steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex flex-col gap-1 text-[13px] font-medium group">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 text-slate-300">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] mt-1.5 flex-shrink-0" />
                              <span className="leading-tight">{step.duration}m {step.label}</span>
                            </div>
                            {step.target_watts && (
                              <span className="text-emerald-400 font-black italic tabular-nums flex-shrink-0 bg-emerald-500/10 px-2 py-0.5 rounded text-[12px]">{step.target_watts}W</span>
                            )}
                          </div>
                        </div>
                      ))
                   ) : (
                      <p className="text-[13px] text-slate-400 leading-relaxed text-center px-2 font-medium opacity-80">
                        {selectedDay.why}
                      </p>
                   )}
                 </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 w-full">
                <button 
                  onClick={() => setSelectedDay(null)}
                  className="w-full py-4 bg-[#1a1c22] rounded-2xl text-[11px] font-black text-slate-300 hover:text-white hover:bg-slate-800 transition-all uppercase tracking-[0.2em] active:scale-95"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Plan Full Screen Modal */}
      {showChangePlanPopup && (
        <div className="fixed inset-0 z-[120] bg-[#05070a] flex flex-col animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex-none flex items-center justify-between p-6 pb-4 border-b border-white/5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}>
            <h3 className="text-lg font-black text-white italic tracking-tighter uppercase flex items-center gap-2">
              <Sparkles size={18} className="text-emerald-400" />
              Adapt Plan
            </h3>
            <button onClick={() => setShowChangePlanPopup(false)} className="text-slate-400 hover:text-white p-2 transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 flex flex-col p-6 h-full">
            <p className="text-[12px] text-slate-400 leading-relaxed mb-6">
              Ask waTTson to adapt your schedule (e.g., "Taper for Saturday race", "increase hill climb intervals", "easier week").
            </p>
            
            <textarea
              autoFocus
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ex: Taper for Saturday race, increase threshold..."
              className="flex-1 w-full bg-slate-950/60 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-emerald-500/30 font-semibold placeholder-slate-600 transition-colors resize-none mb-6"
            />

            <button 
              onClick={() => {
                if (!promptInput.trim()) return;
                if (onUpdatePlanContext) {
                  onUpdatePlanContext(promptInput.trim());
                }
                setPromptInput('');
                setShowChangePlanPopup(false);
              }}
              disabled={!promptInput.trim()}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[12px] uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none flex-none mb-6"
            >
              Apply Adaptation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
