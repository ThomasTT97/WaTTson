import React, { memo } from 'react';
import { Activity } from '../types';
import { Zap, Clock, ChevronRight, Activity as ActivityIcon, Heart, TrendingUp } from 'lucide-react';

interface ActivityCardProps {
  activity: Activity;
  onClick: (activity: Activity) => void;
  isToday?: boolean;
}

export const getRideType = (activity: Activity): string => {
  let baseType = 'Endurance';

  // 1. Check if the activity name itself contains clear indications of the target types
  const nameLower = (activity.name || '').toLowerCase();
  if (nameLower.includes('recovery')) {
    baseType = 'Recovery';
  } else if (nameLower.includes('endurance')) {
    baseType = 'Endurance';
  } else if (nameLower.includes('sweet spot') || nameLower.includes('sweetspot')) {
    baseType = 'Sweet Spot';
  } else if (nameLower.includes('threshold')) {
    baseType = 'Threshold';
  } else if (nameLower.includes('vo2')) {
    baseType = 'VO2 Max';
  } else {
    // 2. Get intensity
    let intensity = activity.icu_intensity;
    
    // If intensity is a percentage (e.g. 75.5 instead of 0.755), convert to fraction
    if (intensity !== undefined && intensity !== null && intensity > 2.0) {
      intensity = intensity / 100;
    }

    // Calculate if not present or invalid
    if (intensity === undefined || intensity === null || intensity <= 0 || intensity > 2.0) {
      const power = activity.weighted_average_watts ?? activity.icu_weighted_average_watts ?? activity.average_watts ?? activity.icu_average_watts;
      let ftp = activity.icu_eftp;
      if (!ftp || ftp <= 0) {
        try {
          const savedFtp = localStorage.getItem('wattson_ftp');
          if (savedFtp) {
            ftp = parseInt(savedFtp, 10);
          }
        } catch {}
      }
      if (!ftp || ftp <= 0) {
        ftp = 250; // Fallback
      }
      if (power && ftp && ftp > 0) {
        intensity = power / ftp;
      }
    }

    // Calculate from TSS and moving time if intensity is still missing or invalid
    if (intensity === undefined || intensity === null || intensity <= 0 || intensity > 2.0) {
      const load = activity.icu_training_load ?? activity.icu_tss ?? activity.training_load ?? (activity as any).load ?? (activity as any).tss ?? 0;
      const movingTime = activity.moving_time || activity.elapsed_time || (activity as any).time || (activity as any).duration;
      if (load > 0 && movingTime && movingTime > 0) {
        const durationHours = movingTime / 3600;
        intensity = Math.sqrt(load / (100 * durationHours));
      }
    }

    // Map intensity to zones
    if (intensity !== undefined && intensity !== null && intensity > 0 && !isNaN(intensity)) {
      if (intensity < 0.60) {
        baseType = 'Recovery';
      } else if (intensity < 0.75) {
        baseType = 'Endurance';
      } else if (intensity < 0.88) {
        baseType = 'Sweet Spot';
      } else if (intensity < 1.05) {
        baseType = 'Threshold';
      } else {
        baseType = 'VO2 Max';
      }
    } else {
      // 3. Fallback name cues
      if (nameLower.includes('easy') || nameLower.includes('spin') || nameLower.includes('rec')) {
        baseType = 'Recovery';
      } else if (nameLower.includes('tempo')) {
        baseType = 'Sweet Spot';
      } else if (nameLower.includes('interval') || nameLower.includes('hiit')) {
        baseType = 'VO2 Max';
      }
    }
  }

  return `${baseType} Ride`;
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
  
  const displayDuration = activity.moving_time || activity.elapsed_time || (activity as any).time || (activity as any).duration;

  // For runs, speed is m/s. Pace is min/km
  const pace = (activity.type === 'Run' || activity.type === 'VirtualRun') && (activity as any).average_speed
    ? `${Math.floor(1000 / (activity as any).average_speed / 60)}:${Math.floor((1000 / (activity as any).average_speed) % 60).toString().padStart(2, '0')}/km`
    : null;

  const displayName = getRideType(activity);
    
  const displayDistance = activity.distance || (activity as any).icu_distance || 0;
  load = Math.round(activity.icu_training_load ?? activity.icu_tss ?? activity.training_load ?? (activity as any).load ?? (activity as any).tss ?? 0);

  return (
    <div 
      onClick={() => onClick(activity)}
      className={`glass-card p-2.5 pl-3 pr-3 rounded-2xl cursor-pointer active:scale-[0.98] transition-all duration-300 group flex items-center gap-3 border ${
        isToday 
          ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/30 via-slate-900/50 to-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.12)] hover:border-emerald-500/60' 
          : 'border-white/[0.04] bg-slate-900/40 hover:bg-white/[0.04]'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 border shadow-inner transition-colors ${
        isToday 
          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
          : 'bg-slate-900/50 border-white/5 text-white group-hover:border-emerald-500/20'
      }`}>
        <span className={`text-[7.5px] font-black uppercase leading-none mb-0.5 tracking-tighter ${isToday ? 'text-emerald-400' : 'text-slate-500'}`}>{weekday}</span>
        <span className={`text-base font-black italic leading-none ${isToday ? 'text-emerald-300' : 'text-white'}`}>{day}</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className={`font-bold text-xs truncate leading-tight tracking-tight transition-colors ${isToday ? 'text-emerald-300' : 'text-slate-200 group-hover:text-emerald-400'}`}>
            {displayName}
          </h3>
          {isToday && (
            <div className="px-1.5 py-0.5 rounded shadow-sm bg-emerald-500/20 border border-emerald-500/40 text-[7.5px] font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1 shrink-0">
              COMPLETED TODAY
            </div>
          )}
          {isVirtual && !isToday && (
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

          {activity.icu_eftp && activity.icu_eftp > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-black bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              <span className="text-emerald-400">eFTP</span>
              <span className="text-white">{Math.round(activity.icu_eftp)}W</span>
            </div>
          )}
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