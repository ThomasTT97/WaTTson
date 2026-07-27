import React, { useEffect, useState } from 'react';
import { Activity, IntervalsCredentials, CoachingFeedback } from '../types';
import { getRideFeedback } from '../services/geminiService';
import { fetchActivityIntervals, fetchPlannedWorkout } from '../services/intervalsService';
import { StepLabel, getStepPhaseLabel, GroupedWorkoutStepsList } from './StepLabel';
import { motion, AnimatePresence } from 'motion/react';
import { getRideType } from './ActivityCard';
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
  Activity as ActivityIcon,
  ChevronRight
} from 'lucide-react';

interface CoachingModalProps {
  activity: Activity;
  creds: IntervalsCredentials;
  onClose: () => void;
  userGoal?: string;
  ftp?: number;
  allActivities?: Activity[];
}

export const CoachingModal: React.FC<CoachingModalProps> = ({ activity, creds, onClose, userGoal, ftp, allActivities }) => {
  const [feedback, setFeedback] = useState<CoachingFeedback | null>(null);
  const [intervals, setIntervals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFeedback = async () => {
      setLoading(true);
      setError(null);
      try {
        const dateStr = activity.start_date_local.split('T')[0];
        const [fetchedIntervals, plannedWorkout] = await Promise.all([
          fetchActivityIntervals(activity.id, creds),
          fetchPlannedWorkout(dateStr, creds)
        ]);
        setIntervals(fetchedIntervals || []);
        const data = await getRideFeedback(activity, fetchedIntervals, plannedWorkout, userGoal, ftp, allActivities);
        setFeedback(data);
      } catch (err: any) {
        setError(err.message || "Engine analysis failed.");
      } finally {
        setLoading(false);
      }
    };
    fetchFeedback();
  }, [activity, creds, userGoal, ftp, allActivities]);

  const dateObj = new Date(activity.start_date_local);
  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const metrics = [
    { label: 'DUR', value: formatDuration(activity.moving_time || activity.elapsed_time || 0), icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'NP', value: `${Math.round(activity.weighted_average_watts ?? activity.icu_weighted_average_watts ?? activity.average_watts ?? activity.icu_average_watts ?? 0)}W`, icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'HR', value: `${Math.round(activity.average_heartrate || 0)}`, icon: Heart, color: 'text-rose-400', bg: 'bg-rose-500/10' },
    { label: 'TSS', value: String(Math.round(activity.icu_training_load || activity.icu_tss || activity.training_load || 0)), icon: Target, color: 'text-amber-400', bg: 'bg-amber-500/10' }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col w-full h-full relative pb-8"
    >
      <div className="flex items-center gap-3 mb-5">
        <button 
          onClick={onClose} 
          className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-lg font-black text-white italic tracking-tight leading-none uppercase truncate max-w-[250px]">
            {getRideType(activity)}
          </h2>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            {dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • {activity.type} • {activity.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-5">
        {metrics.map((m: any, i) => (
          <div key={i} className="glass-card rounded-xl p-2 flex flex-col items-center justify-center border-white/5 bg-slate-950/40 min-h-[64px]">
            <div className={`flex items-center justify-center mb-1.5 ${m.color}`}>
              <m.icon size={12} fill={m.icon === Zap || m.icon === Heart ? "currentColor" : "none"} />
            </div>
            <span className="block text-[12px] font-black text-white tracking-tighter leading-none italic mb-0.5">{m.value}</span>
            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">
              {m.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col relative min-h-[250px]">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center text-center glass-card rounded-[1.5rem] border-white/5 bg-slate-950/20"
            >
              <div className="relative w-8 h-8 mb-4">
                <div className="absolute inset-0 border-2 border-emerald-500/10 rounded-full"></div>
                <div className="absolute inset-0 border-2 border-t-emerald-500 rounded-full animate-spin"></div>
              </div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Analyzing</p>
            </motion.div>
          ) : error ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center glass-card rounded-[1.5rem] border-rose-500/20 bg-rose-500/5"
            >
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest leading-none">Analysis Blocked</p>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">{error}</p>
            </motion.div>
          ) : feedback && (
            <motion.div 
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4 h-full"
            >
              {/* Insight block */}
              <div className="glass-card p-5 rounded-[1.5rem] relative overflow-hidden bg-emerald-500/5 border-emerald-500/10 shrink-0">
                 <div className="flex items-center gap-2 mb-2">
                   <Sparkles size={12} className="text-emerald-400" />
                   <h3 className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Coach Insight</h3>
                 </div>
                 <p className="text-[12px] text-white leading-relaxed italic font-medium">
                   "{feedback.summary}"
                 </p>
              </div>

              {/* One thing to improve block */}
              {feedback.one_thing_to_improve && (
                <div className="glass-card p-5 rounded-[1.5rem] relative overflow-hidden bg-rose-500/5 border-rose-500/10 shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={12} className="text-rose-400" />
                    <h3 className="text-[9px] font-black text-rose-400 uppercase tracking-widest">One Thing to Improve</h3>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-semibold">
                    {feedback.one_thing_to_improve}
                  </p>
                </div>
              )}

              {/* Laps block */}
              {intervals && intervals.length > 0 && (
                <div className="glass-card p-5 rounded-[1.5rem] relative overflow-hidden bg-blue-500/5 border-blue-500/10 shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    <ActivityIcon size={12} className="text-blue-400" />
                    <h3 className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Recorded Laps ({intervals.length})</h3>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto hide-scrollbar">
                    {intervals.filter(l => l.moving_time > 10).map((lap, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] text-slate-300">
                        <span className="font-semibold">{idx + 1}. {lap.label || 'Lap'}</span>
                        <div className="flex gap-3">
                          <span>{Math.floor(lap.moving_time / 60)}m {Math.round(lap.moving_time % 60)}s</span>
                          <span className="text-emerald-400 font-bold">{Math.round(lap.average_watts || 0)}W</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action block */}
              <div className="glass-card flex-1 p-5 rounded-[1.5rem] border-white/5 bg-slate-950/40 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <Target size={12} className="text-amber-400" />
                  <h3 className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Goal Impact</h3>
                </div>
                
                <p className="text-[11px] text-slate-300 leading-relaxed mb-4 shrink-0">{feedback.goal_contribution}</p>
                
                {feedback.workout_steps && feedback.workout_steps.length > 0 && (
                  <div className="flex-1 overflow-y-auto hide-scrollbar space-y-2 shrink-0">
                     <GroupedWorkoutStepsList 
                       steps={feedback.workout_steps}
                       currentFtp={ftp || undefined}
                       originalFtp={ftp}
                       fontSize="sm"
                     />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
