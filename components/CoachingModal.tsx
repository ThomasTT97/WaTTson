import React, { useEffect, useState } from 'react';
import { Activity, IntervalsCredentials, CoachingFeedback } from '../types';
import { getRideFeedback } from '../services/geminiService';
import { fetchActivityIntervals, fetchPlannedWorkout } from '../services/intervalsService';
import { 
  Sparkles, 
  ArrowLeft, 
  Zap,
  Clock,
  Heart,
  TrendingUp,
  Flame,
  Target,
  Trophy,
  Activity as ActivityIcon
} from 'lucide-react';

interface CoachingModalProps {
  activity: Activity;
  creds: IntervalsCredentials;
  onClose: () => void;
  userGoal?: string;
}

export const CoachingModal: React.FC<CoachingModalProps> = ({ activity, creds, onClose, userGoal }) => {
  const [feedback, setFeedback] = useState<CoachingFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFeedback = async () => {
      setLoading(true);
      setError(null);
      try {
        const dateStr = activity.start_date_local.split('T')[0];
        const [intervals, plannedWorkout] = await Promise.all([
          fetchActivityIntervals(activity.id, creds),
          fetchPlannedWorkout(dateStr, creds)
        ]);
        const data = await getRideFeedback(activity, intervals, plannedWorkout, userGoal);
        setFeedback(data);
      } catch (err: any) {
        setError(err.message || "Engine analysis failed.");
      } finally {
        setLoading(false);
      }
    };
    fetchFeedback();
  }, [activity, creds, userGoal]);

  const dateObj = new Date(activity.start_date_local);
  const metrics = [
    { label: 'TSS', value: Math.round(activity.icu_training_load || 0), icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/5' },
    { label: 'MINS', value: Math.round(activity.moving_time / 60), icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/5' },
    { label: 'BPM', value: Math.round(activity.average_heartrate || 0), icon: Heart, color: 'text-rose-400', bg: 'bg-rose-500/5' },
    { label: 'KCAL', value: activity.calories || Math.round((activity.icu_joules || 0) / 1000), icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/5' }
  ];

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0a0e17] animate-in slide-in-from-bottom duration-400 h-[100dvh] max-w-[450px] mx-auto overflow-hidden">
      
      {/* Header */}
      <div 
        className="relative z-20 flex items-center justify-between px-6 py-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <button onClick={onClose} className="w-10 h-10 rounded-full glass-card flex items-center justify-center text-slate-400">
          <ArrowLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-12 px-6">
        <div className="mt-8 mb-10">
          <h1 className="text-3xl text-header italic mb-6 leading-tight uppercase tracking-tight">{activity.name}</h1>
          
          <div className="grid grid-cols-4 gap-2">
            {metrics.map((m, i) => (
              <div key={i} className="glass-card rounded-2xl p-3 flex flex-col items-center justify-center border-white/5">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center mb-2 ${m.bg} ${m.color}`}>
                  <m.icon size={12} fill={m.icon === Zap || m.icon === Heart || m.icon === Flame ? "currentColor" : "none"} />
                </div>
                <span className="text-sm font-bold text-white tracking-tighter leading-none italic">{m.value}</span>
                <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mt-1">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <div className="w-6 h-6 border-2 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
            <p className="text-[9px] font-bold uppercase tracking-widest">Generating Feedback...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center glass-card rounded-[2rem] border-rose-500/20">
             <p className="text-xs font-bold text-rose-400 uppercase tracking-widest">Analysis Failure</p>
             <p className="text-[10px] text-slate-500 mt-2">{error}</p>
          </div>
        ) : feedback && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="glass-card p-7 rounded-[2.5rem] relative overflow-hidden">
               <div className="flex items-center gap-2 mb-4">
                 <Sparkles size={12} className="text-cyan-400" />
                 <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Coach Summary</h3>
               </div>
               <p className="text-sm text-slate-200 leading-relaxed italic">"{feedback.summary}"</p>
            </div>

            <div className="glass-card p-7 rounded-[2.5rem]">
               <div className="flex items-center gap-2 mb-4">
                 <Target size={12} className="text-amber-400" />
                 <h3 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Goal Progress</h3>
               </div>
               <div className="bg-slate-950/40 p-6 rounded-3xl border border-white/5">
                 <p className="text-sm text-slate-300 leading-relaxed">{feedback.goal_contribution}</p>
                 <div className="mt-6 flex items-center gap-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-t border-white/5 pt-4">
                   <Trophy size={12} className="text-cyan-400" /> Alignment with {userGoal}
                 </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};