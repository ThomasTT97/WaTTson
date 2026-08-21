import React, { useEffect, useState } from 'react';
import { Activity, IntervalsCredentials, CoachingFeedback } from '../types';
import { getRideFeedback } from '../services/geminiService';
import { fetchActivityIntervals, fetchPlannedWorkout } from '../services/intervalsService';
import { GroupedWorkoutStepsList, isEnduranceWorkout, VisualProfileChart } from './StepLabel';
import { getRideType } from './ActivityCard';
import { 
  Sparkles, 
  X, 
  Zap,
  Clock,
  Heart,
  TrendingUp,
  Target,
  Activity as ActivityIcon,
  Loader2
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
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  
  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const rideTitle = getRideType(activity, intervals);
  const duration = formatDuration(activity.moving_time || activity.elapsed_time || 0);
  
  // Power parsing: distinguish genuine Average Power vs Normalized / Weighted Average Power
  const avgWatts = Math.round(activity.average_watts ?? activity.icu_average_watts ?? 0);
  let rawNp = Math.round(activity.weighted_average_watts ?? activity.icu_weighted_average_watts ?? 0);
  
  // If NP is not directly set, but Intervals provided Variability Index (VI = NP / Avg), calculate NP
  if (rawNp === 0 && avgWatts > 0 && activity.icu_variability_index && activity.icu_variability_index > 1.01) {
    rawNp = Math.round(avgWatts * activity.icu_variability_index);
  }

  // Only display separate AVG and NP if both exist and are distinct (not identical)
  const hasDistinctNp = rawNp > 0 && avgWatts > 0 && Math.abs(rawNp - avgWatts) >= 2;
  const displayWatts = avgWatts > 0 ? avgWatts : (rawNp > 0 ? rawNp : 0);
  
  const avgHr = Math.round(activity.average_heartrate || 0);
  const tss = Math.round(activity.icu_training_load || activity.icu_tss || activity.training_load || 0);

  return (
    <div className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-[#0c0e15] border-t sm:border border-white/10 w-full sm:max-w-md h-[100dvh] sm:h-auto sm:max-h-[88dvh] rounded-none sm:rounded-[2.2rem] p-5 sm:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] sm:shadow-2xl flex flex-col overflow-hidden relative" 
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 shrink-0 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between shrink-0 mb-3 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-extrabold text-[10px] tracking-wider uppercase shrink-0">
              {dateLabel}
            </div>
            <div className="flex flex-col min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white italic tracking-tight uppercase truncate">
                {rideTitle}
              </h3>
              <span className="text-[9.5px] font-semibold text-slate-400 truncate">
                {activity.name}
              </span>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Compact Metrics Strip (dynamically reporting DUR, AVG, NP, HR, TSS or DUR, PWR, HR, TSS) */}
        {hasDistinctNp ? (
          <div className="grid grid-cols-5 gap-1 p-2.5 bg-white/[0.03] border border-white/5 rounded-2xl shrink-0 mb-3">
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Clock size={9} className="text-blue-400" /> DUR
              </span>
              <span className="text-xs sm:text-sm font-black text-white mt-0.5">{duration}</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center border-l border-white/5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Zap size={9} className="text-amber-400" /> AVG
              </span>
              <span className="text-xs sm:text-sm font-black text-amber-400 mt-0.5">{avgWatts}W</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center border-l border-white/5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Zap size={9} fill="currentColor" className="text-emerald-400" /> NP
              </span>
              <span className="text-xs sm:text-sm font-black text-emerald-400 mt-0.5">{rawNp}W</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center border-l border-white/5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Heart size={9} fill="currentColor" className="text-rose-400" /> HR
              </span>
              <span className="text-xs sm:text-sm font-black text-rose-400 mt-0.5">{avgHr > 0 ? avgHr : '--'}</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center border-l border-white/5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Target size={9} className="text-yellow-400" /> TSS
              </span>
              <span className="text-xs sm:text-sm font-black text-yellow-400 mt-0.5">{tss}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 p-2.5 bg-white/[0.03] border border-white/5 rounded-2xl shrink-0 mb-3">
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Clock size={9} className="text-blue-400" /> DUR
              </span>
              <span className="text-xs sm:text-sm font-black text-white mt-0.5">{duration}</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center border-l border-white/5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Zap size={9} className="text-amber-400" /> PWR
              </span>
              <span className="text-xs sm:text-sm font-black text-amber-400 mt-0.5">{displayWatts > 0 ? `${displayWatts}W` : '--'}</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center border-l border-white/5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Heart size={9} fill="currentColor" className="text-rose-400" /> HR
              </span>
              <span className="text-xs sm:text-sm font-black text-rose-400 mt-0.5">{avgHr > 0 ? avgHr : '--'}</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center border-l border-white/5">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                <Target size={9} className="text-yellow-400" /> TSS
              </span>
              <span className="text-xs sm:text-sm font-black text-yellow-400 mt-0.5">{tss}</span>
            </div>
          </div>
        )}

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-0.5">
          {loading ? (
            <div className="w-full py-8 flex flex-col items-center justify-center bg-white/[0.02] rounded-2xl border border-white/5 text-center px-4">
              <Loader2 size={22} className="animate-spin text-emerald-400 mb-2.5" />
              <span className="text-[11px] font-black text-white uppercase tracking-wider mb-1">Analyzing Activity Data...</span>
              <span className="text-[9px] font-medium text-slate-400">Evaluating power curves & heart rate zones</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-2xl text-center">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest block mb-1">Analysis Blocked</span>
              <p className="text-[11px] text-slate-400">{error}</p>
            </div>
          ) : feedback && (
            <>
              {/* waTTson Coach Insight */}
              <div className="bg-purple-500/5 border-l-2 border-purple-400/80 rounded-r-2xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-purple-400">
                  <Sparkles size={12} className="animate-pulse" />
                  <span className="text-[9.5px] font-black uppercase tracking-widest">waTTson Coach Insight</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                  "{feedback.summary}"
                </p>
              </div>

              {/* One Thing to Improve */}
              {feedback.one_thing_to_improve && (
                <div className="bg-rose-500/5 border-l-2 border-rose-400/80 rounded-r-2xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-rose-400">
                    <TrendingUp size={12} />
                    <span className="text-[9.5px] font-black uppercase tracking-widest">One Thing to Improve</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                    {feedback.one_thing_to_improve}
                  </p>
                </div>
              )}

              {/* Goal Contribution */}
              {feedback.goal_contribution && (
                <div className="bg-emerald-500/5 border-l-2 border-emerald-400/80 rounded-r-2xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Target size={12} />
                    <span className="text-[9.5px] font-black uppercase tracking-widest">Goal Impact</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                    {feedback.goal_contribution}
                  </p>
                </div>
              )}

              {/* Recorded Laps / Intervals */}
              {intervals && intervals.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Recorded Laps & Intervals ({intervals.filter(l => (l.moving_time || 0) >= 5).length})
                    </span>
                    {activity.max_watts && activity.max_watts > 0 && (
                      <span className="text-[8.5px] font-bold text-amber-400/90 font-mono">
                        Peak: {Math.round(activity.max_watts)}W
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                    {intervals.filter(l => (l.moving_time || 0) >= 5).map((lap, idx) => {
                      const dur = lap.moving_time || 0;
                      const m = Math.floor(dur / 60);
                      const s = Math.round(dur % 60);
                      const timeStr = m > 0 ? `${m}m ${s > 0 ? `${s}s` : ''}` : `${s}s`;
                      const isWork = lap.type === 'WORK';
                      const isRecovery = lap.type === 'RECOVERY';
                      
                      return (
                        <div key={idx} className="flex justify-between items-center text-[10.5px] py-1 border-b border-white/[0.03] last:border-0">
                          <div className="flex items-center gap-1.5 min-w-0 pr-2">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                              isWork 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : isRecovery 
                                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                                  : 'bg-white/5 text-slate-400'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-slate-200 truncate">
                              {lap.label || (isWork ? 'Interval Effort' : isRecovery ? 'Recovery' : 'Lap')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 font-mono shrink-0 text-right">
                            <span className="text-slate-400 text-[10px]">{timeStr}</span>
                            {lap.average_watts > 0 && (
                              <span className="text-emerald-400 font-bold text-[10px]">
                                {lap.average_watts}W{lap.max_watts && lap.max_watts > lap.average_watts * 1.15 ? ` (pk ${lap.max_watts}W)` : ''}
                              </span>
                            )}
                            {lap.average_heartrate > 0 && (
                              <span className="text-rose-400 text-[10px]">
                                {lap.average_heartrate}bpm
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Workout Breakdown */}
              {feedback.workout_steps && feedback.workout_steps.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3.5 space-y-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block border-b border-white/5 pb-1.5">
                    Structure & Targets
                  </span>
                  <div className="max-h-36 overflow-y-auto custom-scrollbar">
                    {isEnduranceWorkout(feedback) ? (
                      <VisualProfileChart steps={feedback.workout_steps} />
                    ) : (
                      <GroupedWorkoutStepsList 
                        steps={feedback.workout_steps}
                        currentFtp={ftp || undefined}
                        originalFtp={ftp}
                        fontSize="sm"
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 shrink-0 border-t border-white/5 mt-auto">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
