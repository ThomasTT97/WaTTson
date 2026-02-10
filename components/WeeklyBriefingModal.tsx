
import React, { useEffect, useState } from 'react';
import { Activity, Wellness, WeeklyBriefing, IntervalsCredentials, DailySuggestion } from '../types';
import { getWeeklyBriefing } from '../services/geminiService';
import { X, Sparkles, TrendingUp, Calendar, ChevronRight, Loader2, Info, Trophy, Heart } from 'lucide-react';

interface WeeklyBriefingModalProps {
  activities: Activity[];
  wellness: Wellness[];
  creds: IntervalsCredentials;
  userGoal?: string;
  onClose: () => void;
  todaySuggestion?: DailySuggestion | null;
}

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
        const todayTitle = todaySuggestion?.primary?.title;
        const data = await getWeeklyBriefing(activities, wellness, userGoal, todayTitle);
        setBriefing(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchBriefing();
  }, [activities, wellness, userGoal, todaySuggestion]);

  const intensityColors = {
    'High': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    'Moderate': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Low': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'Rest': 'text-slate-400 bg-slate-500/10 border-slate-500/20'
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in slide-in-from-bottom duration-300 h-[100dvh] max-w-[450px] mx-auto overflow-hidden">
      <div 
        className="flex items-center justify-between px-6 py-4 border-b border-white/5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Weekly Briefing</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">7-Day Performance Outlook</p>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 active:scale-90 transition-all">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin"></div>
              <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400 animate-pulse" size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Synthesizing Outlook...</p>
              <p className="text-xs text-slate-500 mt-1">Starting from today's readiness</p>
            </div>
          </div>
        ) : briefing ? (
          <div className="space-y-6 animate-in fade-in duration-700">
            {/* Outlook Summary */}
            <div className="glass-panel p-5 rounded-[2rem] border-white/5 bg-slate-900/40">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">Weekly Focus</h3>
              <p className="text-sm text-slate-200 leading-relaxed font-medium">
                {briefing.outlook_summary}
              </p>
            </div>

            {/* Daily Outlook */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Daily Plan (Tap for 'Why')</h4>
              <div className="space-y-2.5">
                {briefing.days.map((day, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => setSelectedDay(day)}
                    className="w-full text-left glass-panel p-4 rounded-2xl border-white/5 flex items-center gap-4 hover:bg-white/5 active:scale-[0.98] transition-all"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex flex-col items-center justify-center shrink-0 border border-white/5">
                      <span className="text-[10px] font-black text-slate-500 uppercase">{day.day.slice(0,3)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{day.focus}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${intensityColors[day.intensity]}`}>
                          {day.intensity}
                        </span>
                        {day.load_target > 0 && (
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-tighter">Target {day.load_target} TSS</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-700" />
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5 flex gap-3 items-start">
              <Info size={16} className="text-cyan-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-400 leading-normal">
                This plan adapts your home screen suggestion and projects the next 7 days based on current fatigue trends.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-slate-500">Sync again to refresh outlook.</p>
          </div>
        )}
      </div>

      <div className="p-6 bg-slate-950 border-t border-white/5">
        <button 
          onClick={onClose}
          className="w-full py-4 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/15 transition-all"
        >
          Close Outlook
        </button>
      </div>

      {/* Why Popup */}
      {selectedDay && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in duration-200">
          <div className="glass-panel w-full max-w-[320px] rounded-[2.5rem] p-8 border border-white/10 shadow-2xl relative">
            <button onClick={() => setSelectedDay(null)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${intensityColors[selectedDay.intensity].split(' ')[1]}`}>
                <Trophy size={24} className={intensityColors[selectedDay.intensity].split(' ')[0]} />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{selectedDay.day} Focus</h3>
              <p className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-4">{selectedDay.focus}</p>
              
              <div className="bg-slate-950/50 p-5 rounded-2xl border border-white/5 w-full text-left">
                <p className="text-sm text-slate-300 leading-relaxed italic font-light">
                  "{selectedDay.why}"
                </p>
              </div>

              <button 
                onClick={() => setSelectedDay(null)}
                className="mt-6 w-full py-3 bg-white/10 rounded-full text-xs font-bold text-white hover:bg-white/20 transition-all uppercase tracking-widest"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
