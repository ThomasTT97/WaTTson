import React from 'react';
import { Activity } from '../types';
import { Zap, Clock, ChevronRight } from 'lucide-react';

interface ActivityCardProps {
  activity: Activity;
  onClick: (activity: Activity) => void;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({ activity, onClick }) => {
  const dateObj = new Date(activity.start_date_local);
  const date = dateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
  const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });

  const duration = Math.round(activity.moving_time / 60);

  // Correctly access TSS from icu_training_load (the API standard)
  const load = activity.icu_training_load ?? activity.icu_tss;
  
  const tssValue = load !== undefined && load !== null 
    ? Math.round(load) 
    : 0;

  // Format source (e.g., "GARMIN_CONNECT" -> "Garmin")
  // Now infers "Zwift" if the activity type is VirtualRide, even if source is Strava
  const formatSource = (source?: string, type?: string) => {
    if (source === 'ZWIFT') return 'Zwift';
    if (type === 'VirtualRide') return 'Zwift';
    
    if (!source) return null;
    if (source === 'GARMIN_CONNECT') return 'Garmin';
    if (source === 'STRAVA') return 'Strava';
    if (source === 'WAHOO') return 'Wahoo';
    if (source === 'POLAR') return 'Polar';
    if (source === 'SUUNTO') return 'Suunto';
    return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
  };

  const sourceName = formatSource(activity.source, activity.type);

  return (
    <div 
      onClick={() => onClick(activity)}
      className="glass-panel p-4 rounded-3xl cursor-pointer hover:bg-slate-800/80 transition-all duration-300 group flex items-center gap-4 active:scale-[0.98] border border-white/5 hover:border-cyan-500/20"
    >
      <div className="w-12 h-12 rounded-2xl bg-white/5 flex flex-col items-center justify-center shrink-0 border border-white/5 group-hover:bg-cyan-500/10 transition-colors">
        <span className="text-[9px] font-bold text-slate-500 uppercase leading-none mb-0.5 group-hover:text-cyan-500/70">{weekday}</span>
        <span className="text-base font-bold text-white leading-tight group-hover:text-cyan-400">{dateObj.getDate()}</span>
      </div>

      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-slate-100 text-sm truncate group-hover:text-cyan-400 transition-colors pr-2">
            {activity.name}
          </h3>
          {sourceName && (
            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md tracking-wider ${
              sourceName === 'Zwift' 
                ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
                : 'bg-white/5 text-slate-500'
            }`}>
              {sourceName}
            </span>
          )}
        </div>
        
        <div className="flex gap-4">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
            <Clock size={12} />
            {duration}m
          </div>
          
          <div className="flex items-center gap-1 text-[11px] text-slate-300 font-bold">
            <Zap size={12} className="text-amber-400" fill="currentColor" />
            {tssValue} TSS
          </div>

          {activity.average_watts && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <span className="font-bold text-slate-400">{Math.round(activity.average_watts)}</span>
              <span className="text-[9px] uppercase tracking-tighter opacity-70">W</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center w-8 h-8 rounded-full group-hover:bg-cyan-500/20 transition-all opacity-0 group-hover:opacity-100 -ml-2">
        <ChevronRight size={16} className="text-slate-600 group-hover:text-cyan-400" />
      </div>
    </div>
  );
};