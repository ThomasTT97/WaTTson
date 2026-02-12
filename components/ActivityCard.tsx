import React, { memo } from 'react';
import { Activity } from '../types';
import { Zap, Clock, ChevronRight, Activity as ActivityIcon } from 'lucide-react';

interface ActivityCardProps {
  activity: Activity;
  onClick: (activity: Activity) => void;
}

export const ActivityCard: React.FC<ActivityCardProps> = memo(({ activity, onClick }) => {
  const dateObj = new Date(activity.start_date_local);
  const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
  const day = dateObj.getDate();

  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const load = Math.round(activity.icu_training_load ?? activity.icu_tss ?? 0);
  const isVirtual = activity.source === 'ZWIFT' || activity.type === 'VirtualRide';

  return (
    <div 
      onClick={() => onClick(activity)}
      className="glass-card p-5 rounded-[2rem] cursor-pointer hover:bg-slate-800/40 active:scale-[0.98] transition-all duration-300 group flex items-center gap-5 border border-white/5"
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-900/80 flex flex-col items-center justify-center shrink-0 border border-white/10 shadow-inner group-hover:border-cyan-500/30 transition-colors">
        <span className="text-[9px] font-black text-slate-500 uppercase leading-none mb-1 tracking-tighter">{weekday}</span>
        <span className="text-xl font-black text-white italic leading-none">{day}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="font-bold text-white text-[14px] truncate leading-tight tracking-tight">
            {activity.name}
          </h3>
          {isVirtual && (
            <div className="px-1.5 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-[7px] font-black text-orange-500 uppercase tracking-widest">Virtual</div>
          )}
        </div>
        
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            <Clock size={11} className="text-blue-400/60" />
            <span className="text-slate-400">{formatDuration(activity.moving_time)}</span>
          </div>
          
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            <Zap size={11} className="text-amber-400/60" fill="currentColor" />
            <span className="text-slate-400">{load} TSS</span>
          </div>

          {activity.average_watts && (
            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              <ActivityIcon size={11} className="text-cyan-400/60" />
              <span className="text-slate-400">{Math.round(activity.average_watts)}W avg</span>
            </div>
          )}
        </div>
      </div>

      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 border border-white/5 opacity-40 group-hover:opacity-100 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20 transition-all">
        <ChevronRight size={14} className="text-slate-500 group-hover:text-cyan-400" />
      </div>
    </div>
  );
});