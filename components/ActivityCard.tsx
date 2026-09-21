import React, { memo } from 'react';
import { Activity, ActivityInterval } from '../types';
import { Zap, Clock, ChevronRight, Activity as ActivityIcon, Heart, TrendingUp } from 'lucide-react';
import { classifyActivityRide } from '../services/intervalsService';

interface ActivityCardProps {
  activity: Activity;
  onClick: (activity: Activity) => void;
  isToday?: boolean;
}

export const getRideType = (activity: Activity, intervals?: ActivityInterval[]): string => {
  return classifyActivityRide(activity, intervals);
};

export const ActivityCard: React.FC<ActivityCardProps> = memo(({ activity, onClick, isToday }) => {
  const dateObj = new Date(activity.start_date_local);
  const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
  const day = dateObj.getDate();

  const formatDuration = (totalSeconds: number | undefined) => {
    if (!totalSeconds || isNaN(totalSeconds)) return '0m';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  let load = Math.round(activity.icu_training_load ?? activity.icu_tss ?? activity.training_load ?? 0);
  const isVirtual = activity.source === 'ZWIFT' || activity.type === 'VirtualRide' || activity.type === 'VirtualRun';
  
  const displayDuration = activity.moving_time || activity.elapsed_time || (activity as any).time || (activity as any).duration || (activity as any).icu_recording_time || 0;
  const displayDistance = activity.distance || (activity as any).icu_distance || 0;

  // Do not display rides or activities with 0 minutes / zero duration
  if (displayDuration < 60 && displayDistance < 100) {
    return null;
  }

  // For runs and walks, compute pace (min/km)
  const isRunOrWalk = activity.type === 'Run' || activity.type === 'VirtualRun' || activity.type === 'TrailRun' || activity.type === 'Walk' || activity.type === 'Hike';
  let pace: string | null = null;
  if (isRunOrWalk && (activity as any).average_speed && (activity as any).average_speed > 0) {
    const secPerKm = 1000 / (activity as any).average_speed;
    if (secPerKm > 0 && secPerKm < 3600) {
      const pM = Math.floor(secPerKm / 60);
      const pS = Math.floor(secPerKm % 60).toString().padStart(2, '0');
      pace = `${pM}:${pS}/km`;
    }
  } else if (isRunOrWalk && displayDistance >= 500 && displayDuration >= 60) {
    const secPerKm = (displayDuration / displayDistance) * 1000;
    if (secPerKm > 0 && secPerKm < 3600) {
      const pM = Math.floor(secPerKm / 60);
      const pS = Math.floor(secPerKm % 60).toString().padStart(2, '0');
      pace = `${pM}:${pS}/km`;
    }
  }

  const displayName = getRideType(activity, (activity as any).icu_intervals || (activity as any).intervals);
  load = Math.round(activity.icu_training_load ?? activity.icu_tss ?? activity.training_load ?? (activity as any).load ?? (activity as any).tss ?? 0);

  return (
    <div 
      onClick={() => onClick(activity)}
      className={`p-3 rounded-2xl cursor-pointer active:scale-[0.99] transition-all duration-200 group flex items-center gap-3 border ${
        isToday 
          ? 'border-white/[0.12] bg-white/[0.04] hover:border-white/20' 
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05]'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-colors ${
        isToday 
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
          : 'bg-white/[0.02] border-white/[0.06] text-slate-300 group-hover:border-white/10'
      }`}>
        <span className={`text-[7.5px] font-bold uppercase leading-none mb-0.5 tracking-wider ${isToday ? 'text-emerald-400' : 'text-slate-400'}`}>{weekday}</span>
        <span className={`text-xs font-bold font-mono leading-none ${isToday ? 'text-emerald-300' : 'text-white'}`}>{day}</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className={`font-semibold text-xs truncate leading-tight tracking-tight transition-colors ${isToday ? 'text-emerald-300' : 'text-slate-200 group-hover:text-emerald-400'}`}>
            {displayName}
          </h3>
          {isToday && (
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[7.5px] font-semibold text-emerald-300 uppercase tracking-wider shrink-0">
              Today
            </span>
          )}
          {isVirtual && !isToday && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[7.5px] font-semibold text-amber-400 uppercase tracking-wider shrink-0">
              Virtual
            </span>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
            <Clock size={10} className="text-slate-500" />
            <span>{formatDuration(displayDuration)}</span>
          </div>

          {(displayDistance > 0) && (
            <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
              <TrendingUp size={10} className="text-slate-500" />
              <span>{Math.round(displayDistance / 100) / 10}km</span>
            </div>
          )}

          {pace ? (
            <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
              <Zap size={10} className="text-indigo-400" />
              <span>{pace}</span>
            </div>
          ) : (activity.average_watts || activity.icu_average_watts || activity.weighted_average_watts || activity.icu_weighted_average_watts) ? (
            <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
              <Zap size={10} className="text-amber-400/80" />
              <span>
                {Math.round(activity.average_watts ?? activity.icu_average_watts ?? activity.weighted_average_watts ?? activity.icu_weighted_average_watts ?? 0)}W
              </span>
            </div>
          ) : activity.average_heartrate ? (
            <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
              <Heart size={10} className="text-rose-400/80" />
              <span>{Math.round(activity.average_heartrate)}bpm</span>
            </div>
          ) : null}

          {activity.icu_eftp && activity.icu_eftp > 0 && (
            <div className="flex items-center gap-1 text-[9px] font-semibold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 text-emerald-400">
              <span>eFTP</span>
              <span className="text-slate-200">{Math.round(activity.icu_eftp)}W</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end justify-center shrink-0">
        {load > 0 ? (
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-emerald-400 font-mono leading-none">{load}</span>
            <span className="text-[7.5px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">TSS</span>
          </div>
        ) : (
          <ChevronRight size={13} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
        )}
      </div>
    </div>
  );
});