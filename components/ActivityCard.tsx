import React, { memo } from 'react';
import { Activity, ActivityInterval } from '../types';
import { Zap, Clock, ChevronRight, Activity as ActivityIcon, Heart, TrendingUp } from 'lucide-react';
import { detectIntervalsFromLaps } from '../services/intervalsService';

interface ActivityCardProps {
  activity: Activity;
  onClick: (activity: Activity) => void;
  isToday?: boolean;
}

// In-memory cache for fast lookup without disk I/O on every render
let inMemoryRideTypes: Record<string, string> | null = null;
let saveTimeout: any = null;

const getStoredRideTypes = (): Record<string, string> => {
  if (inMemoryRideTypes !== null) return inMemoryRideTypes;
  try {
    const raw = localStorage.getItem('wattson_custom_ride_types');
    inMemoryRideTypes = raw ? JSON.parse(raw) : {};
  } catch {
    inMemoryRideTypes = {};
  }
  return inMemoryRideTypes || {};
};

const setCachedRideType = (id: string, type: string) => {
  const cache = getStoredRideTypes();
  if (cache[id] === type) return;
  cache[id] = type;
  
  // Debounce localStorage writes so hundreds of cards don't freeze the main thread
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem('wattson_custom_ride_types', JSON.stringify(inMemoryRideTypes));
    } catch {}
  }, 1000);
};

export const getRideType = (activity: Activity, intervals?: ActivityInterval[]): string => {
  const cachedTypes = getStoredRideTypes();
  if (cachedTypes[activity.id]) {
    return cachedTypes[activity.id];
  }

  // Extract intervals attached to activity or passed directly
  let actIntervals: any[] | undefined = (intervals && intervals.length > 0) ? intervals : undefined;
  if (!actIntervals) {
    if (Array.isArray((activity as any).icu_laps) && (activity as any).icu_laps.length > 0) {
      actIntervals = (activity as any).icu_laps;
    } else if (Array.isArray((activity as any).icu_intervals) && (activity as any).icu_intervals.length > 0) {
      actIntervals = (activity as any).icu_intervals;
    } else if (Array.isArray((activity as any).icu_intervals_edited) && (activity as any).icu_intervals_edited.length > 0) {
      actIntervals = (activity as any).icu_intervals_edited;
    } else if (Array.isArray((activity as any).laps) && (activity as any).laps.length > 0) {
      actIntervals = (activity as any).laps;
    } else if (Array.isArray((activity as any).intervals) && (activity as any).intervals.length > 0) {
      actIntervals = (activity as any).intervals;
    }
  }

  // Programmatically detect intervals pattern
  const detected = detectIntervalsFromLaps(activity, actIntervals);

  // If specific interval count/duration/watts detected, prioritize and update cache
  if (detected && !detected.endsWith('(Intervals)')) {
    setCachedRideType(activity.id, detected);
    return detected;
  }

  if (detected) {
    setCachedRideType(activity.id, detected);
    return detected;
  }

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
  } else if (nameLower.includes('anaerobic')) {
    baseType = 'Anaerobic';
  } else if (nameLower.includes('sprint')) {
    baseType = 'Sprint';
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
      
      const vi = activity.icu_variability_index;
      if (vi && vi > 1.15 && intensity > 0.75) {
        if (vi > 1.25) baseType = 'Sprint';
        else if (baseType === 'Threshold') baseType = 'Anaerobic';
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

  const displayName = getRideType(activity, (activity as any).icu_intervals || (activity as any).intervals);
    
  const displayDistance = activity.distance || (activity as any).icu_distance || 0;
  load = Math.round(activity.icu_training_load ?? activity.icu_tss ?? activity.training_load ?? (activity as any).load ?? (activity as any).tss ?? 0);

  return (
    <div 
      onClick={() => onClick(activity)}
      className={`glass-card p-3 rounded-2xl cursor-pointer active:scale-[0.99] transition-all duration-200 group flex items-center gap-3 border ${
        isToday 
          ? 'border-emerald-500/30 bg-emerald-950/20 shadow-sm hover:border-emerald-500/50' 
          : 'border-white/[0.06] bg-slate-900/30 hover:border-white/10 hover:bg-slate-900/50'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-colors ${
        isToday 
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
          : 'bg-white/[0.02] border-white/[0.08] text-slate-200 group-hover:border-emerald-500/20'
      }`}>
        <span className={`text-[7px] font-black uppercase leading-none mb-0.5 tracking-wider ${isToday ? 'text-emerald-400' : 'text-slate-400'}`}>{weekday}</span>
        <span className={`text-sm font-black italic leading-none ${isToday ? 'text-emerald-300' : 'text-white'}`}>{day}</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-1">
          <h3 className={`font-bold text-xs truncate leading-tight tracking-tight transition-colors ${isToday ? 'text-emerald-300' : 'text-slate-200 group-hover:text-emerald-400'}`}>
            {displayName}
          </h3>
          {isToday && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[7px] font-black text-emerald-300 uppercase tracking-widest shrink-0">
              Today
            </span>
          )}
          {isVirtual && !isToday && (
            <span className="px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[7px] font-black text-orange-400 uppercase tracking-widest shrink-0">
              Virtual
            </span>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-400">
            <Clock size={10} className="text-slate-500" />
            <span>{formatDuration(displayDuration)}</span>
          </div>

          {(displayDistance > 0) && (
            <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-400">
              <TrendingUp size={10} className="text-slate-500" />
              <span>{Math.round(displayDistance / 100) / 10}km</span>
            </div>
          )}

          {pace ? (
            <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-400">
              <Zap size={10} className="text-indigo-400" />
              <span>{pace}</span>
            </div>
          ) : (activity.average_watts || activity.icu_average_watts || activity.weighted_average_watts || activity.icu_weighted_average_watts) ? (
            <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-400">
              <Zap size={10} className="text-amber-400/80" />
              <span>
                {Math.round(activity.average_watts ?? activity.icu_average_watts ?? activity.weighted_average_watts ?? activity.icu_weighted_average_watts ?? 0)}W
              </span>
            </div>
          ) : activity.average_heartrate ? (
            <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-400">
              <Heart size={10} className="text-rose-400/80" />
              <span>{Math.round(activity.average_heartrate)}bpm</span>
            </div>
          ) : null}

          {activity.icu_eftp && activity.icu_eftp > 0 && (
            <div className="flex items-center gap-1 text-[9.5px] font-black bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 text-emerald-400">
              <span>eFTP</span>
              <span className="text-slate-200">{Math.round(activity.icu_eftp)}W</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end justify-center shrink-0">
        {load > 0 ? (
          <div className="flex flex-col items-end">
            <span className="text-xs font-black text-emerald-400 italic font-mono leading-none">{load}</span>
            <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">TSS</span>
          </div>
        ) : (
          <ChevronRight size={13} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
        )}
      </div>
    </div>
  );
});