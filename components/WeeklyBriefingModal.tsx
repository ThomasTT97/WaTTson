
import React, { useEffect, useState } from 'react';
import { Activity, Wellness, WeeklyBriefing, IntervalsCredentials, DailySuggestion, AnnualPowerCurve } from '../types';
import { getWeeklyBriefing } from '../services/geminiService';
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
  onResetPlanContext?: () => void;
}

const toLocalDateStr = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const WeeklyBriefingModal: React.FC<WeeklyBriefingModalProps> = ({ 
  activities, wellness, userGoal, onClose, todaySuggestion, creds, ftp, powerCurves, planContext, onResetPlanContext
}) => {
  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<WeeklyBriefing['days'][0] | null>(null);
  const [syncingDay, setSyncingDay] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  const fetchBriefing = async (force: boolean = false) => {
    if (force) setIsRefreshing(true);
    else setLoading(true);
    
    try {
      const now = new Date();
      const todayStr = toLocalDateStr(now);
      const hasActivityToday = activities.some(a => a.start_date_local.startsWith(todayStr));
      
      const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      const tomorrowName = tomorrow.toLocaleDateString('en-US', { weekday: 'long' });

      // Ensure consistency with the home screen suggestion for the first day
      const todaySuggestionText = todaySuggestion 
        ? `The primary suggested workout is: "${todaySuggestion.primary.title}" (${todaySuggestion.primary.duration_minutes} min, ${todaySuggestion.primary.intensity} intensity). `
        : "";
        
      let startContext = "";
      if (hasActivityToday) {
        startContext = `Plan MUST start from TOMORROW, which is ${tomorrowName} (Day 1 = Tomorrow), as the athlete already completed a workout today. ${todaySuggestionText} Use this workout for ${tomorrowName}. `;
      } else {
        startContext = `Plan MUST start from TODAY, which is ${todayName}. ${todaySuggestionText} Use this workout for ${todayName} (Day 1). `;
      }

      const data = await getWeeklyBriefing(activities, wellness, userGoal, startContext, ftp, powerCurves, planContext, force);
      setBriefing(data);
    } catch (err) {
      console.error("Briefing failed:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBriefing();
  }, [activities, wellness, userGoal, todaySuggestion, ftp, powerCurves, planContext]);

  const handleSyncToIntervals = async (day: WeeklyBriefing['days'][0], index: number) => {
    setSyncingDay(day.day);
    try {
      const todayStr = toLocalDateStr(new Date());
      const hasActivityToday = activities.some(a => a.start_date_local.startsWith(todayStr));
      const offset = hasActivityToday ? 1 : 0;

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + index + offset);
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
    return dayStr.slice(0, 3).toUpperCase();
  };

  return (
      <div className="fixed inset-0 z-[100] bg-[#05070a]/95 backdrop-blur-3xl flex flex-col animate-in slide-in-from-bottom duration-300 md:max-w-[480px] md:mx-auto md:shadow-2xl overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-transparent"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div className="flex items-center gap-3">
          <button 
            onClick={() => fetchBriefing(true)}
            disabled={loading || isRefreshing}
            className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 active:scale-90 transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight leading-none">Weekly Briefing</h2>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mt-1.5">7-Day Performance Outlook</p>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-slate-500 active:scale-90 transition-all border border-white/10">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest animate-pulse">Analyzing Trajectory...</p>
          </div>
        ) : briefing ? (
          <div className="flex-1 flex flex-col gap-3 animate-in fade-in duration-700">
            <h4 className="text-[9px] font-black text-slate-700 uppercase tracking-[0.4em] text-center mb-1">
              7-Day Projection
            </h4>
            
            <div className="flex-1 flex flex-col justify-between max-h-[calc(100vh-220px)] gap-1">
              {briefing.days.map((day, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setSelectedDay(day)}
                  className={`w-full text-left py-2.5 px-3 rounded-2xl border flex items-center gap-3 hover:brightness-110 active:scale-[0.99] transition-all shadow-lg ${intensityRowStyles[day.intensity] || intensityRowStyles['Medium']}`}
                >
                  {/* Day Box */}
                  <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center shrink-0 border border-white/5">
                    <span className="text-[11px] font-black text-slate-400 uppercase leading-none tracking-tighter">{getDayAbbr(day.day)}</span>
                  </div>

                  {/* Info Column */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-baseline gap-2">
                       <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest leading-none">
                         {idx === 0 ? (activities.some(a => a.start_date_local.startsWith(toLocalDateStr(new Date()))) ? "TOMORROW" : "TODAY") : (idx === 1 && !activities.some(a => a.start_date_local.startsWith(toLocalDateStr(new Date()))) ? "TOMORROW" : "")}
                       </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-white leading-none tracking-tighter italic">
                        {day.duration_target > 0 ? day.duration_target : '--'}
                      </span>
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter leading-none">MIN</span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5 opacity-90">
                      {day.load_target > 0 ? (
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-1">
                          <Zap size={10} className="text-amber-500/80" fill="currentColor" /> Target {day.load_target} TSS
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Full Recovery</span>
                      )}
                    </div>
                  </div>

                  {/* Badge */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full border uppercase tracking-widest min-w-[65px] text-center shadow-sm ${intensityColors[day.intensity] || intensityColors['Medium']}`}>
                      {day.intensity}
                    </span>
                    <ChevronRight size={14} className="text-slate-800" />
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-auto pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
              {planContext && (
                <div className="mb-3 p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 flex flex-col gap-2">
                   <div className="flex items-center justify-between">
                     <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Active Coaching Directive</span>
                     <button 
                       onClick={() => onResetPlanContext?.()}
                       className="text-[9px] font-black text-slate-500 hover:text-rose-400 uppercase tracking-widest"
                     >
                       Reset
                     </button>
                   </div>
                   <p className="text-[11px] text-slate-300 font-medium italic leading-snug">"{planContext}"</p>
                </div>
              )}
              
              <div className="p-4 bg-slate-900/40 rounded-2xl border border-white/5 flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                   <Info size={14} className="text-emerald-500" />
                </div>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Plan is adaptive based on recorded stress. {planContext ? "Refined by coach chat." : "Talk to waTTson to rework focus."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center opacity-30">
            <p className="text-sm font-bold uppercase tracking-widest">Unable to generate outlook</p>
          </div>
        )}
      </div>

      {/* Why Detail Popup */}
      {selectedDay && (
        <div className="fixed inset-0 z-[110] bg-[#05070a]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in slide-in-from-bottom-4 duration-300" onClick={() => setSelectedDay(null)}>
          <div className="glass-card w-full max-w-sm rounded-[3rem] p-6 pb-8 relative border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedDay(null)} className="absolute top-6 right-6 text-slate-600 hover:text-white transition-colors p-2 z-20">
              <X size={20} />
            </button>
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.1)] relative flex-shrink-0">
                <div className="absolute inset-1.5 border border-emerald-500/30 rounded-full" />
                <Trophy size={32} className="text-emerald-400" />
              </div>
              
              <h3 className="text-2xl font-black text-white italic tracking-tighter mb-1.5 uppercase text-center leading-tight">
                {briefing?.days.findIndex(d => d.day === selectedDay.day) === 0 ? (activities.some(a => a.start_date_local.startsWith(toLocalDateStr(new Date()))) ? "TOMORROW'S" : "TODAY'S") : selectedDay.day.toUpperCase()} FOCUS
              </h3>
              <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.25em] mb-8 text-center">{selectedDay.focus}</p>
              
              <div className="bg-[#0a0c10] p-6 rounded-[2.5rem] border border-white/5 w-full text-left space-y-5 shadow-inner relative overflow-hidden">
                 <div className="flex items-center justify-between border-b border-white/5 pb-4 mx-1">
                    <div className="flex items-center gap-2 text-[14px] font-black text-white tracking-tighter">
                       <Clock size={16} className="text-blue-400" /> {selectedDay.duration_target} MIN
                    </div>
                    <div className="flex items-center gap-2 text-[14px] font-black text-amber-400 italic">
                       <Zap size={16} fill="currentColor" className="text-amber-400" /> {selectedDay.load_target} TSS
                    </div>
                 </div>

                 <div className="space-y-4 py-1 max-h-[180px] overflow-y-auto custom-scrollbar px-1">
                   {selectedDay.workout_steps && selectedDay.workout_steps.length > 0 ? (
                      selectedDay.workout_steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-center justify-between gap-4 text-[13px] font-bold group">
                          <div className="flex items-center gap-2.5 text-slate-300">
                            <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] flex-shrink-0" />
                            <span className="truncate">{step.duration}m {step.label}</span>
                          </div>
                          {step.target_watts && (
                            <span className="text-emerald-400 font-extrabold italic tabular-nums flex-shrink-0">{step.target_watts}W</span>
                          )}
                        </div>
                      ))
                   ) : (
                      <p className="text-[13px] text-slate-400 leading-relaxed italic text-center px-4 font-medium opacity-80">
                        {selectedDay.why}
                      </p>
                   )}
                 </div>
              </div>

              <div className="mt-8 flex flex-col gap-3 w-full">
                <button 
                  onClick={() => {
                    if (briefing) {
                      const idx = briefing.days.findIndex(d => d.day === selectedDay.day);
                      handleSyncToIntervals(selectedDay, idx);
                    }
                  }}
                  disabled={syncingDay === selectedDay.day || syncSuccess === selectedDay.day || selectedDay.intensity === 'Rest'}
                  className={`w-full py-4.5 rounded-full text-[12px] font-black uppercase tracking-[0.14em] flex items-center justify-center gap-2.5 transition-all shadow-xl active:scale-95 ${
                    syncSuccess === selectedDay.day 
                      ? 'bg-emerald-500 text-white' 
                      : selectedDay.intensity === 'Rest'
                      ? 'bg-slate-900 text-slate-600 border border-white/5 opacity-50 cursor-not-allowed'
                      : 'bg-[#40e0a0] text-slate-950 hover:bg-[#38d090] shadow-emerald-400/20'
                  }`}
                >
                  {syncingDay === selectedDay.day ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : syncSuccess === selectedDay.day ? (
                    <>SYNCED <Check size={18} strokeWidth={3} /></>
                  ) : (
                    <>SYNC TO CALENDAR <CalendarIcon size={18} strokeWidth={2.5} /></>
                  )}
                </button>

                <button 
                  onClick={() => setSelectedDay(null)}
                  className="w-full py-4.5 bg-[#1a1c22] rounded-full text-[11px] font-black text-slate-400 hover:text-white transition-all uppercase tracking-[0.2em] active:scale-95"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
