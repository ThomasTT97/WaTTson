import React, { memo } from 'react';
import { Clock, Zap, Activity, Bike, ShieldAlert, Coffee } from 'lucide-react';
import { WeeklyBriefing } from '../types';

interface SuggestedWorkoutCardProps {
  day: WeeklyBriefing['days'][0];
  absoluteIndex: number;
  onClick: (day: WeeklyBriefing['days'][0]) => void;
  isToday?: boolean;
}

export const SuggestedWorkoutCard: React.FC<SuggestedWorkoutCardProps> = memo(({ 
  day, 
  absoluteIndex, 
  onClick,
  isToday = false
}) => {
  if (!day) return null;
  const getDayAbbr = (dayStr: string) => {
    const lower = dayStr.toLowerCase();
    if (lower.includes('mon')) return 'MON';
    if (lower.includes('tue')) return 'TUE';
    if (lower.includes('wed')) return 'WED';
    if (lower.includes('thu')) return 'THU';
    if (lower.includes('fri')) return 'FRI';
    if (lower.includes('sat')) return 'SAT';
    if (lower.includes('sun')) return 'SUN';
    return dayStr.slice(0, 3).toUpperCase();
  };

  const getDayNumber = (dayStr: string) => {
    const match = dayStr.match(/\d+/);
    return match ? match[0] : '';
  };

  const formatWorkoutDuration = (mins: number) => {
    if (mins <= 0) return '0m';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const getSportInfo = (focusStr: string) => {
    const lower = focusStr.toLowerCase();
    if (lower.includes('run') || lower.includes('running') || lower.includes('brick')) {
      return { name: 'Run', color: 'text-orange-400/60' };
    } else if (lower.includes('swim') || lower.includes('swimming') || lower.includes('pool')) {
      return { name: 'Swim', color: 'text-sky-400/60' };
    } else if (lower.includes('rest') || lower.includes('recovery') || day.intensity === 'Rest') {
      return { name: 'Rest', color: 'text-slate-500/60' };
    }
    return { name: 'Ride', color: 'text-yellow-400/60' };
  };

  const weekday = getDayAbbr(day.day);
  const dayNum = getDayNumber(day.day);
  const sport = getSportInfo(day.focus);

  const isRest = day.intensity === 'Rest' || day.focus.toLowerCase().includes('rest') || day.load_target === 0;

  if (isRest) {
    return (
      <div 
        onClick={() => onClick(day)}
        className={`glass-card p-2.5 pl-3 pr-3 rounded-2xl cursor-pointer hover:bg-white/[0.02] active:scale-[0.98] transition-all duration-300 group flex items-center gap-3 border border-dashed ${
          isToday 
            ? 'border-emerald-500/20 bg-emerald-500/[0.01] shadow-[0_0_15px_rgba(16,185,129,0.03)]' 
            : 'border-slate-800/60 bg-transparent opacity-60 hover:opacity-85'
        }`}
      >
        {/* Date block */}
        <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 border border-dashed shadow-inner transition-colors ${
          isToday 
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400/80' 
            : 'bg-slate-950/40 border-slate-800 text-slate-500'
        }`}>
          <span className="text-[7.5px] font-black uppercase leading-none mb-0.5 tracking-tighter">{weekday}</span>
          <span className={`text-base font-black italic leading-none ${isToday ? 'text-emerald-400' : 'text-slate-400'}`}>{dayNum || '–'}</span>
        </div>

        {/* Focus description & REST badge */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className={`font-bold text-xs truncate leading-tight tracking-tight transition-colors ${
              isToday ? 'text-emerald-400/90' : 'text-slate-400 group-hover:text-slate-300'
            }`}>
              {day.focus}
            </h3>
            <span className="text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider text-slate-400 bg-slate-500/10 border border-slate-500/10">
              REST
            </span>
          </div>
          
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">
            {day.why || 'Time to recover, adapt, and rebuild muscles.'}
          </p>
        </div>

        {/* Cozy rest icon */}
        <div className="flex flex-col items-end justify-center shrink-0 pr-1">
          <Coffee size={14} className={isToday ? 'text-emerald-400/60' : 'text-slate-600 group-hover:text-slate-500'} />
        </div>
      </div>
    );
  }

  const intensityColors = {
    'Hard': 'text-red-400 bg-red-500/10 border-red-500/20',
    'Medium': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    'Easy': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'Rest': 'text-slate-400 bg-slate-500/10 border-slate-500/20'
  };

  return (
    <div 
      onClick={() => onClick(day)}
      className={`glass-card p-2.5 pl-3 pr-3 rounded-2xl cursor-pointer hover:bg-white/[0.04] active:scale-[0.98] transition-all duration-300 group flex items-center gap-3 border ${
        isToday 
          ? 'border-emerald-500/30 bg-emerald-500/[0.02] shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
          : 'border-white/[0.03]'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 border shadow-inner transition-colors ${
        isToday 
          ? 'bg-emerald-500/10 border-emerald-500/30 group-hover:border-emerald-400' 
          : 'bg-slate-900/30 border-white/5 group-hover:border-emerald-500/20'
      }`}>
        <span className={`text-[7.5px] font-black uppercase leading-none mb-0.5 tracking-tighter ${
          isToday ? 'text-emerald-400/80' : 'text-slate-500'
        }`}>{weekday}</span>
        <span className="text-base font-black text-white italic leading-none">{dayNum || '–'}</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className={`font-bold text-xs truncate leading-tight tracking-tight transition-colors ${
            isToday ? 'text-emerald-400' : 'text-slate-200 group-hover:text-emerald-400'
          }`}>
            {day.focus}
          </h3>
          <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
            intensityColors[day.intensity] || intensityColors['Medium']
          }`}>
            {day.intensity}
          </span>
        </div>
        
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <div className="flex items-center gap-1 text-[10px] font-bold">
            <Clock size={10} className="text-blue-400/60" />
            <span className="text-slate-400">{formatWorkoutDuration(day.duration_target)}</span>
          </div>

          <div className="flex items-center gap-1 text-[10px] font-bold">
            {sport.name === 'Run' ? (
              <Activity size={10} className={sport.color} />
            ) : sport.name === 'Swim' ? (
              <Activity size={10} className={sport.color} />
            ) : sport.name === 'Rest' ? (
              <ShieldAlert size={10} className={sport.color} />
            ) : (
              <Bike size={10} className={sport.color} />
            )}
            <span className="text-slate-400">{sport.name} Session</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end justify-center shrink-0">
        {day.load_target > 0 ? (
          <div className="flex flex-col items-end">
            <span className={`text-[13px] font-black italic leading-none ${
              isToday ? 'text-emerald-400' : 'text-blue-400'
            }`}>{day.load_target}</span>
            <span className={`text-[7px] font-bold uppercase tracking-wider ${
              isToday ? 'text-emerald-500/50' : 'text-blue-500/50'
            }`}>TSS</span>
          </div>
        ) : (
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-500 italic leading-none">REST</span>
          </div>
        )}
      </div>
    </div>
  );
});
SuggestedWorkoutCard.displayName = 'SuggestedWorkoutCard';
