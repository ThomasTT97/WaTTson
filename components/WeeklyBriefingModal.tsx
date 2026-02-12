
import React, { useEffect, useState } from 'react';
import { Activity, Wellness, WeeklyBriefing, IntervalsCredentials, DailySuggestion } from '../types';
import { getWeeklyBriefing } from '../services/geminiService';
import { X, Sparkles, ChevronRight, Trophy, Clock, Zap, Info } from 'lucide-react';

interface WeeklyBriefingModalProps {
  activities: Activity[];
  wellness: Wellness[];
  creds: IntervalsCredentials;
  userGoal?: string;
  onClose: () => void;
  todaySuggestion?: DailySuggestion | null;
}

const toLocalDateStr = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const WeeklyBriefingModal: React.FC<WeeklyBriefingModalProps> = ({ 
  activities, wellness, userGoal, onClose, todaySuggestion 
}) => {
  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<WeeklyBriefing['days'][0] | null>(null);

  useEffect(() => {
    const fetchBriefing = async () => {
      setLoading(true);
      try {
        const todayStr = toLocalDateStr(new Date());
        const hasActivityToday = activities.some(a => a.start_date_local.startsWith(todayStr));
        
        // Ensure consistency with the home screen suggestion for the first day
        const todaySuggestionText = todaySuggestion 
          ? `Today's primary suggested workout on the home screen is: "${todaySuggestion.primary.title}" (${todaySuggestion.primary.duration_minutes} min, ${todaySuggestion.primary.intensity} intensity). `
          : "";
          
        // Always start from TODAY as requested.
        let startContext = `Start the 7-day plan from TODAY. The list MUST begin with today's day of the week. ${todaySuggestionText} You MUST use this exact workout for Day 1 (Today) in the briefing. `;
        
        if (hasActivityToday) {
          startContext += "Note: The athlete has already completed a session today, but still list Today as the first day of the briefing for context.";
        }

        const data = await getWeeklyBriefing(activities, wellness, userGoal, startContext);
        setBriefing(data);
      } catch (err) {
        console.error("Briefing failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBriefing();
  }, [activities, wellness, userGoal, todaySuggestion]);

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
    if (lower.includes('mon')) return 'MO';
    if (lower.includes('tue')) return 'TU';
    if (lower.includes('wed')) return 'WE';
    if (lower.includes('thu')) return 'TH';
    if (lower.includes('fri')) return 'FR';
    if (lower.includes('sat')) return 'SA';
    if (lower.includes('sun')) return 'SU';
    return dayStr.slice(0, 2).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in slide-in-from-bottom duration-300 h-[100dvh] max-w-[450px] mx-auto overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-6 py-4 border-b border-white/5"
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
            <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
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

            <div className="mt-auto pt-4 mb-2">
              <div className="p-4 bg-slate-900/40 rounded-2xl border border-white/5 flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                   <Info size={14} className="text-cyan-500" />
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
          <div className="glass-panel w-full max-w-[340px] rounded-[3rem] p-10 border border-white/10 shadow-2xl relative">
            <button onClick={() => setSelectedDay(null)} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-[1.8rem] flex items-center justify-center mb-6 shadow-2xl border border-white/10 ${intensityColors[selectedDay.intensity]?.split(' ')[1] || 'bg-slate-800'}`}>
                <Trophy size={28} className={intensityColors[selectedDay.intensity]?.split(' ')[0] || 'text-slate-400'} />
              </div>
              
              <h3 className="text-xl font-black text-white italic tracking-tight mb-1">{selectedDay.day} FOCUS</h3>
              <p className="text-[11px] font-black text-cyan-500 uppercase tracking-[0.2em] mb-6">{selectedDay.focus}</p>
              
              <div className="bg-slate-950/60 p-6 rounded-[2rem] border border-white/5 w-full text-left space-y-4 shadow-inner">
                 <div className="flex items-center justify-between opacity-80 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-1.5 text-xs font-black text-white">
                       <Clock size={14} className="text-blue-400" /> {selectedDay.duration_target} MIN
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
                       <Zap size={14} fill="currentColor" /> {selectedDay.load_target} TSS
                    </div>
                 </div>
                <p className="text-sm text-slate-300 leading-relaxed italic font-light">
                  "{selectedDay.why}"
                </p>
              </div>

              <button 
                onClick={() => setSelectedDay(null)}
                className="mt-8 w-full py-4 bg-white/10 rounded-2xl text-[11px] font-black text-white hover:bg-white/20 transition-all uppercase tracking-[0.3em] ring-1 ring-white/10"
              >
                CLOSE DETAILS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
