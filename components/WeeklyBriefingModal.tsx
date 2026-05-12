
import React, { useEffect, useState } from 'react';
import { Activity, Wellness, WeeklyBriefing, IntervalsCredentials, DailySuggestion } from '../types';
import { getWeeklyBriefing } from '../services/geminiService';
import { uploadWorkout } from '../services/intervalsService';
import { X, Sparkles, ChevronRight, Trophy, Clock, Zap, Info, Calendar as CalendarIcon, Check, Loader2 } from 'lucide-react';

interface WeeklyBriefingModalProps {
  activities: Activity[];
  wellness: Wellness[];
  creds: IntervalsCredentials;
  userGoal?: string;
  onClose: () => void;
  todaySuggestion?: DailySuggestion | null;
  ftp?: number;
}

const toLocalDateStr = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const WeeklyBriefingModal: React.FC<WeeklyBriefingModalProps> = ({ 
  activities, wellness, userGoal, onClose, todaySuggestion, creds, ftp
}) => {
  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<WeeklyBriefing['days'][0] | null>(null);
  const [syncingDay, setSyncingDay] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchBriefing = async () => {
      setLoading(true);
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

        const data = await getWeeklyBriefing(activities, wellness, userGoal, startContext, ftp);
        setBriefing(data);
      } catch (err) {
        console.error("Briefing failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBriefing();
  }, [activities, wellness, userGoal, todaySuggestion, ftp]);

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
    <div className="fixed inset-0 z-[100] bg-[#05070a]/95 backdrop-blur-3xl flex flex-col animate-in slide-in-from-bottom duration-300 max-w-[450px] mx-auto overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-transparent"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div>
          <h2 className="text-xl font-black text-white tracking-tight leading-none">Weekly Briefing</h2>
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mt-1.5">7-Day Performance Outlook</p>
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
              <div className="p-4 bg-slate-900/40 rounded-2xl border border-white/5 flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                   <Info size={14} className="text-emerald-500" />
                </div>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Plan is adaptive based on recorded stress. Tap any session for coach reasoning.
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
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95 duration-200">
          <div className="glass-card w-full max-w-[340px] rounded-[3rem] p-10 relative">
            <button onClick={() => setSelectedDay(null)} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-[1.8rem] flex items-center justify-center mb-6 shadow-2xl border border-white/10 ${intensityColors[selectedDay.intensity]?.split(' ')[1] || 'bg-slate-800'}`}>
                <Trophy size={28} className={intensityColors[selectedDay.intensity]?.split(' ')[0] || 'text-slate-400'} />
              </div>
              
              <h3 className="text-xl font-black text-white italic tracking-tight mb-1">
                {briefing?.days.findIndex(d => d.day === selectedDay.day) === 0 ? (activities.some(a => a.start_date_local.startsWith(toLocalDateStr(new Date()))) ? "TOMORROW'S" : "TODAY'S") : selectedDay.day} FOCUS
              </h3>
              <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-6">{selectedDay.focus}</p>
              
              <div className="bg-slate-950/60 p-6 rounded-[2rem] border border-white/5 w-full text-left space-y-4 shadow-inner overflow-hidden">
                 <div className="flex items-center justify-between opacity-80 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-1.5 text-xs font-black text-white">
                       <Clock size={14} className="text-blue-400" /> {selectedDay.duration_target} MIN
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
                       <Zap size={14} fill="currentColor" /> {selectedDay.load_target} TSS
                    </div>
                 </div>

                 {selectedDay.workout_steps && selectedDay.workout_steps.length > 0 ? (
                   <div className="space-y-2 py-1 max-h-[180px] overflow-y-auto custom-scrollbar pr-2">
                     {selectedDay.workout_steps.map((step, sIdx) => (
                       <div key={sIdx} className="flex items-center justify-between gap-3 text-[11px] font-bold">
                         <div className="flex items-center gap-2 text-slate-400">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                           <span>{step.duration}m {step.label}</span>
                         </div>
                         {step.target_watts && (
                           <span className="text-emerald-400/80">{step.target_watts}W</span>
                         )}
                       </div>
                     ))}
                   </div>
                 ) : (
                   <p className="text-sm text-slate-300 leading-relaxed italic font-light">
                     "{selectedDay.why}"
                   </p>
                 )}
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
                  className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-xl ${
                    syncSuccess === selectedDay.day 
                      ? 'bg-emerald-500 text-white' 
                      : selectedDay.intensity === 'Rest'
                      ? 'bg-slate-900 text-slate-600 border border-white/5 opacity-50 cursor-not-allowed'
                      : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 active:scale-95'
                  }`}
                >
                  {syncingDay === selectedDay.day ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : syncSuccess === selectedDay.day ? (
                    <>SYNCED <Check size={16} strokeWidth={3} /></>
                  ) : (
                    <>SYNC TO CALENDAR <CalendarIcon size={14} strokeWidth={2.5} /></>
                  )}
                </button>

                <button 
                  onClick={() => setSelectedDay(null)}
                  className="w-full py-4 bg-white/5 rounded-2xl text-[10px] font-black text-slate-500 hover:text-white transition-all uppercase tracking-[0.2em] border border-white/5"
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
