import React, { useEffect, useState, useCallback } from 'react';
import { Activity, IntervalsCredentials, CoachingFeedback } from '../types';
import { getRideFeedback } from '../services/geminiService';
import { fetchActivityIntervals, fetchPlannedWorkout } from '../services/intervalsService';
import { getRideType } from './ActivityCard';
import { 
  Sparkles, 
  X, 
  TrendingUp,
  Target,
  Loader2,
  RefreshCw
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
  
  const initialIntervals = (activity.icu_intervals && activity.icu_intervals.length > 0)
    ? activity.icu_intervals
    : (activity.laps && activity.laps.length > 0)
      ? activity.laps
      : (activity.icu_laps && activity.icu_laps.length > 0)
        ? activity.icu_laps
        : (activity.icu_intervals_edited && activity.icu_intervals_edited.length > 0)
          ? activity.icu_intervals_edited
          : [];

  const [intervals, setIntervals] = useState<any[]>(initialIntervals);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunAnalysis = useCallback(async (forceOrEvent?: boolean | React.MouseEvent) => {
    const force = typeof forceOrEvent === 'boolean' ? forceOrEvent : false;
    setLoading(true);
    setError(null);
    try {
      const dateStr = activity.start_date_local.split('T')[0];
      const [fetchedIntervals, plannedWorkout] = await Promise.all([
        fetchActivityIntervals(activity.id, creds),
        fetchPlannedWorkout(dateStr, creds)
      ]);

      const resolvedIntervals = (fetchedIntervals && fetchedIntervals.length > 0)
        ? fetchedIntervals
        : initialIntervals;

      setIntervals(resolvedIntervals);
      if (resolvedIntervals.length > 0) {
        (activity as any).icu_intervals = resolvedIntervals;
      }

      const data = await getRideFeedback(activity, resolvedIntervals, plannedWorkout, userGoal, ftp, allActivities, force);
      setFeedback(data);
    } catch (err: any) {
      setError(err.message || "Engine analysis failed.");
    } finally {
      setLoading(false);
    }
  }, [activity, creds, initialIntervals, userGoal, ftp, allActivities]);

  useEffect(() => {
    if (!feedback && !loading && !error) {
      handleRunAnalysis();
    }
  }, [handleRunAnalysis, feedback, loading, error]);

  const dateObj = new Date(activity.start_date_local);
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  
  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const rideTitle = getRideType(activity, intervals);
  const duration = formatDuration(activity.moving_time || activity.elapsed_time || 0);
  
  const avgWatts = Math.round(activity.average_watts ?? activity.icu_average_watts ?? 0);
  let rawNp = Math.round(activity.weighted_average_watts ?? activity.icu_weighted_avg_watts ?? activity.icu_weighted_average_watts ?? 0);
  
  if (rawNp === 0 && avgWatts > 0 && activity.icu_variability_index && activity.icu_variability_index > 1.01) {
    rawNp = Math.round(avgWatts * activity.icu_variability_index);
  }

  const hasDistinctNp = rawNp > 0 && avgWatts > 0 && Math.abs(rawNp - avgWatts) >= 2;
  const displayWatts = avgWatts > 0 ? avgWatts : (rawNp > 0 ? rawNp : 0);
  
  const avgHr = Math.round(activity.average_heartrate || 0);
  const tss = Math.round(activity.icu_training_load || activity.icu_tss || activity.training_load || 0);
  const displayDistance = activity.distance || (activity as any).icu_distance || 0;
  const distKm = displayDistance > 0 ? (Math.round(displayDistance / 100) / 10) : 0;

  return (
    <div className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-[#0a0c14] border-t sm:border border-white/[0.08] w-full sm:max-w-md h-[90dvh] sm:h-auto sm:max-h-[85dvh] rounded-none sm:rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col overflow-hidden relative" 
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-4 shrink-0 sm:hidden" />

        {/* Minimalist Header */}
        <div className="flex items-center justify-between shrink-0 mb-4 pb-3 border-b border-white/[0.06]">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-medium text-slate-400 tracking-wider">
              {dateLabel} • <span className="text-white font-semibold">{activity.name}</span>
            </span>
            <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
              {rideTitle}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {feedback && !loading && (
              <button 
                onClick={() => handleRunAnalysis(true)}
                className="text-slate-500 hover:text-white p-2 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer"
                title="Regenerate Analysis"
              >
                <RefreshCw size={14} />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/[0.04] transition-colors shrink-0 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Minimalist Metrics Strip */}
        <div className="grid grid-cols-5 gap-2 p-3 bg-white/[0.02] border border-white/[0.06] rounded-2xl shrink-0 mb-4">
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">Time</span>
            <span className="text-xs font-bold text-white font-mono">{duration}</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center border-l border-white/[0.06]">
            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">
              {hasDistinctNp ? 'NP' : displayWatts > 0 ? 'Power' : 'Dist'}
            </span>
            <span className="text-xs font-bold text-emerald-400 font-mono">
              {hasDistinctNp ? `${rawNp}W` : displayWatts > 0 ? `${displayWatts}W` : distKm > 0 ? `${distKm}km` : '--'}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center text-center border-l border-white/[0.06]">
            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">Heart Rate</span>
            <span className="text-xs font-bold text-rose-400 font-mono">{avgHr > 0 ? `${avgHr} bpm` : '--'}</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center border-l border-white/[0.06]">
            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">Cadence</span>
            <span className="text-xs font-bold text-slate-400 font-mono">
              {typeof activity.average_cadence === 'number' && activity.average_cadence > 0 
                ? `${Math.round(activity.average_cadence)} rpm` 
                : typeof (activity as any).icu_average_cadence === 'number' && (activity as any).icu_average_cadence > 0
                  ? `${Math.round((activity as any).icu_average_cadence)} rpm`
                  : '--'}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center text-center border-l border-white/[0.06]">
            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">TSS</span>
            <span className="text-xs font-bold text-amber-400 font-mono">{tss > 0 ? tss : '--'}</span>
          </div>
        </div>

        {/* Secondary Info Bar */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-white/[0.01] border border-white/[0.04] rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">File Recording</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">Recorded Laps:</span>
            <span className="text-[10px] font-bold text-sky-400 font-mono">
              {intervals && intervals.length > 0 ? (
                `${intervals.length} ${intervals.length === 1 ? 'interval' : 'intervals'}`
              ) : loading ? (
                <span className="inline-flex items-center gap-1 text-slate-400 font-normal">
                  <Loader2 size={10} className="animate-spin text-sky-400" />
                  <span>reading...</span>
                </span>
              ) : (
                'None'
              )}
            </span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-0.5">
          {!feedback && !loading && !error ? (
            <div className="w-full py-12 flex flex-col items-center justify-center bg-white/[0.02] rounded-2xl border border-white/[0.06] text-center px-4">
              <Sparkles size={24} className="text-emerald-400 mb-3" />
              <h3 className="text-sm font-bold text-white mb-1">Analyze Workout</h3>
              <p className="text-xs text-slate-400 mb-4">Click below to run an AI-powered analysis of this workout.</p>
              <button 
                onClick={handleRunAnalysis}
                className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-xl text-xs uppercase tracking-wider transition-all border border-emerald-500/20"
              >
                Analyze Ride
              </button>
            </div>
          ) : loading ? (
            <div className="w-full py-12 flex flex-col items-center justify-center bg-white/[0.02] rounded-2xl border border-white/[0.06] text-center px-4">
              <Loader2 size={20} className="animate-spin text-slate-400 mb-2" />
              <span className="text-xs font-medium text-slate-300">Analyzing ride data & power distribution...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center">
              <span className="text-xs font-semibold text-rose-400 block mb-1">Analysis Unavailable</span>
              <p className="text-[11px] text-slate-400">{error}</p>
              <button onClick={() => handleRunAnalysis(true)} className="mt-3 text-[10px] text-emerald-400 font-bold underline">Retry Analysis</button>
            </div>
          ) : feedback && (
            <>
              {/* Coach Insight */}
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-purple-400">
                  <Sparkles size={13} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Coach Insight</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-normal">
                  "{feedback.summary}"
                </p>
              </div>

              {/* One Thing to Improve */}
              {feedback.one_thing_to_improve && (
                <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-400">
                    <TrendingUp size={13} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Area to Refine</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-normal">
                    {feedback.one_thing_to_improve}
                  </p>
                </div>
              )}

              {/* Goal Impact */}
              {feedback.goal_contribution && (
                <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Target size={13} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Goal Alignment</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-normal">
                    {feedback.goal_contribution}
                  </p>
                </div>
              )}

              {/* Recorded Laps / Intervals */}
              {intervals && intervals.length > 0 && (
                <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Laps & Intervals ({intervals.filter(l => (l.moving_time || 0) >= 5).length})
                    </span>
                    {activity.max_watts && activity.max_watts > 0 && (
                      <span className="text-[10px] font-semibold text-amber-400 font-mono">
                        Peak: {Math.round(activity.max_watts)}W
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {intervals.filter(l => (l.moving_time || 0) >= 5).map((lap, idx) => {
                      const dur = lap.moving_time || 0;
                      const m = Math.floor(dur / 60);
                      const s = Math.round(dur % 60);
                      const timeStr = m > 0 ? `${m}m ${s > 0 ? `${s}s` : ''}` : `${s}s`;
                      const isWork = lap.type === 'WORK';
                      const isRecovery = lap.type === 'RECOVERY';
                      const zoneBadge = lap.zone ? (
                        <span className={`px-1 py-0.5 rounded text-[8px] font-mono font-bold ${
                          lap.zone <= 2 ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                          lap.zone === 3 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          lap.zone === 4 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          lap.zone === 5 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                          'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          Z{lap.zone}
                        </span>
                      ) : null;
                      
                      return (
                        <div key={idx} className="flex justify-between items-center text-xs py-1.5 border-b border-white/[0.03] last:border-0">
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-bold shrink-0 ${
                              isWork 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : isRecovery 
                                  ? 'bg-blue-500/10 text-blue-400' 
                                  : 'bg-white/5 text-slate-400'
                            }`}>
                              {idx + 1}
                            </span>
                            <div className="flex items-center gap-1.5 min-w-0">
                              {zoneBadge}
                              <span className="font-medium text-slate-200 truncate">
                                {lap.label || (isWork ? 'Interval Effort' : isRecovery ? 'Recovery' : 'Lap')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 font-mono shrink-0 text-right">
                            <span className="text-slate-400 text-[11px]">{timeStr}</span>
                            {lap.average_watts > 0 && (
                              <span className="text-emerald-400 font-semibold text-[11px]">
                                {lap.average_watts}W
                              </span>
                            )}
                            {lap.average_cadence > 0 && (
                              <span className="text-slate-400 text-[10px]">
                                {lap.average_cadence}rpm
                              </span>
                            )}
                            {lap.average_heartrate > 0 && (
                              <span className="text-rose-400 text-[11px]">
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 shrink-0 border-t border-white/[0.06] mt-auto">
          <button 
            onClick={onClose}
            className="w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] text-slate-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

