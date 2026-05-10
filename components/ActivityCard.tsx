import React, { memo } from 'react';
import { Activity } from '../types';
import { Zap, Clock, ChevronRight, Activity as ActivityIcon, Heart, TrendingUp } from 'lucide-react';

interface ActivityCardProps {
  activity: Activity;
  onClick: (activity: Activity) => void;
}

export const ActivityCard: React.FC<ActivityCardProps> = memo(({ activity, onClick }) => {
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
  
  const displayDuration = activity.moving_time || activity.elapsed_time || (activity as any).time || (activity as any).duration;

  // For runs, speed is m/s. Pace is min/km
  const pace = (activity.type === 'Run' || activity.type === 'VirtualRun') && (activity as any).average_speed
    ? `${Math.floor(1000 / (activity as any).average_speed / 60)}:${Math.floor((1000 / (activity as any).average_speed) % 60).toString().padStart(2, '0')}/km`
    : null;

  const displayName = (activity.name && activity.name.toLowerCase() !== 'workout' && activity.name.toLowerCase() !== 'activity') 
    ? activity.name 
    : (activity.type || 'Workout');
    
  const displayDistance = activity.distance || (activity as any).icu_distance || 0;
  load = Math.round(activity.icu_training_load ?? activity.icu_tss ?? activity.training_load ?? (activity as any).load ?? (activity as any).tss ?? 0);

  return (
    <div 
      onClick={() => onClick(activity)}
      className="glass-card p-2.5 pl-3 pr-3 rounded-2xl cursor-pointer hover:bg-white/[0.04] active:scale-[0.98] transition-all duration-300 group flex items-center gap-3 border border-white/[0.03]"
    >
      <div className="w-10 h-10 rounded-xl bg-slate-900/50 flex flex-col items-center justify-center shrink-0 border border-white/5 shadow-inner group-hover:border-emerald-500/20 transition-colors">
        <span className="text-[7.5px] font-black text-slate-500 uppercase leading-none mb-0.5 tracking-tighter">{weekday}</span>
        <span className="text-base font-black text-white italic leading-none">{day}</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-bold text-slate-200 text-xs truncate leading-tight tracking-tight group-hover:text-emerald-400 transition-colors">
            {displayName}
          </h3>
          {isVirtual && (
            <div className="px-1.5 py-0.5 rounded shadow-sm bg-orange-500/10 border border-orange-500/20 text-[7px] font-black text-orange-500 uppercase tracking-widest">Virtual</div>
          )}
        </div>
        
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <div className="flex items-center gap-1 text-[10px] font-bold">
            <Clock size={10} className="text-blue-400/60" />
            <span className="text-slate-400">{formatDuration(displayDuration)}</span>
          </div>

          {(displayDistance > 0) && (
            <div className="flex items-center gap-1 text-[10px] font-bold">
              <TrendingUp size={10} className="text-emerald-400/60" />
              <span className="text-slate-400">{Math.round(displayDistance / 100) / 10}km</span>
            </div>
          )}

          {pace ? (
            <div className="flex items-center gap-1 text-[10px] font-bold">
              <Zap size={10} className="text-indigo-400/60" />
              <span className="text-slate-400">{pace}</span>
            </div>
          ) : (activity.average_watts || activity.icu_average_watts) ? (
            <div className="flex items-center gap-1 text-[10px] font-bold">
              <Zap size={10} className="text-yellow-400/60" />
              <span className="text-slate-400">{Math.round(activity.average_watts ?? activity.icu_average_watts ?? 0)}W</span>
            </div>
          ) : activity.average_heartrate ? (
            <div className="flex items-center gap-1 text-[10px] font-bold">
              <Heart size={10} className="text-rose-400/60" />
              <span className="text-slate-400">{Math.round(activity.average_heartrate)}bpm</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col items-end justify-center shrink-0">
        {load > 0 ? (
          <div className="flex flex-col items-end">
            <span className="text-[13px] font-black text-emerald-400 italic leading-none">{load}</span>
            <span className="text-[7px] font-bold text-emerald-500/50 uppercase tracking-wider">TSS</span>
          </div>
        ) : (
          <ChevronRight size={14} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
        )}
      </div>
    </div>
  );
});