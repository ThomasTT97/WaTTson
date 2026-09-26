import React, { memo } from 'react';
import { Clock, Zap, Activity, Bike, ShieldAlert, Coffee } from 'lucide-react';
import { WeeklyBriefing, formatDuration } from '../types';

interface SuggestedWorkoutCardProps {
  day: WeeklyBriefing['days'][0];
  absoluteIndex?: number;
  onClick: (day: WeeklyBriefing['days'][0]) => void;
  isToday?: boolean;
  date?: Date;
}

export const formatPlannedRideTitle = (focusStr?: string): string => {
  if (!focusStr) return 'Ride';
  const cleanedFocus = focusStr.replace(/\s*\(\d+h\d*\)/i, '');
  const trimmed = cleanedFocus.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower.includes('ride') ||
    lower.includes('run') ||
    lower.includes('swim') ||
    lower.includes('rest') ||
    lower.includes('commute') ||
    lower.includes('brick') ||
    lower.includes('race') ||
    lower.includes('workout')
  ) {
    return trimmed;
  }

  return `${trimmed} Ride`;
};

export const SuggestedWorkoutCard: React.FC<SuggestedWorkoutCardProps> = memo(({ 
  day, 
  absoluteIndex, 
  onClick,
  isToday = false,
  date
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
    return formatDuration(mins);
  };

  const getSportInfo = (focusStr?: string) => {
    const lower = (focusStr || '').toLowerCase();
    if (lower.includes('run') || lower.includes('running') || lower.includes('brick')) {
      return { name: 'Run', color: 'text-orange-400/60' };
    } else if (lower.includes('swim') || lower.includes('swimming') || lower.includes('pool')) {
      return { name: 'Swim', color: 'text-sky-400/60' };
    } else if (lower.includes('rest') || lower.includes('recovery') || day.intensity === 'Rest') {
      return { name: 'Rest', color: 'text-slate-500/60' };
    }
    return { name: 'Ride', color: 'text-yellow-400/60' };
  };

  const computedDate = (() => {
    if (date) return date;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (typeof absoluteIndex === 'number') {
      d.setDate(d.getDate() + absoluteIndex);
    }
    return d;
  })();

  const weekday = (date || typeof absoluteIndex === 'number') 
    ? computedDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    : getDayAbbr(day.day || '');

  const dayNum = (date || typeof absoluteIndex === 'number')
    ? computedDate.getDate()
    : getDayNumber(day.day || '');

  const sport = getSportInfo(day.focus);

  const isRest = day.intensity === 'Rest' || (day.focus || '').toLowerCase().includes('rest') || day.load_target === 0;

  if (isRest) {
    return (
      <div 
        onClick={() => onClick(day)}
        className={`p-3 rounded-2xl cursor-pointer active:scale-[0.99] transition-all duration-200 group flex items-center gap-3 border ${
          isToday 
            ? 'border-white/[0.12] bg-white/[0.04] hover:border-white/20' 
            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05]'
        }`}
      >
        {/* Date block */}
        <div className="w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-colors bg-indigo-500/10 border-indigo-500/25 text-indigo-300">
          <span className="text-[7.5px] font-bold uppercase leading-none mb-0.5 tracking-wider">{weekday}</span>
          <span className="text-xs font-bold font-mono leading-none text-slate-200">{dayNum || '–'}</span>
        </div>

        {/* Focus description & REST badge */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-xs truncate leading-tight tracking-tight text-slate-300 group-hover:text-white transition-colors">
              {day.focus || 'Rest Day'}
            </h3>
            <span className="text-[7.5px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 shrink-0 text-indigo-300/90 bg-indigo-500/10 border border-indigo-500/20">
              <Coffee size={9} /> Rest
            </span>
          </div>
        </div>

        {/* Cozy rest icon */}
        <div className="flex items-center justify-center shrink-0">
          <div className="p-1.5 rounded-xl border border-white/[0.05] bg-white/[0.02] text-slate-500 flex items-center justify-center">
            <Coffee size={13} />
          </div>
        </div>
      </div>
    );
  }

  const intensityColors: Record<string, string> = {
    'Hard': 'text-amber-400/90 bg-amber-500/10 border-amber-500/20',
    'Medium': 'text-blue-400/90 bg-blue-500/10 border-blue-500/20',
    'Easy': 'text-emerald-400/90 bg-emerald-500/10 border-emerald-500/20',
    'Rest': 'text-slate-400 bg-slate-500/10 border-slate-500/20'
  };

  return (
    <div 
      onClick={() => onClick(day)}
      className={`p-3 rounded-2xl cursor-pointer active:scale-[0.99] transition-all duration-200 group flex items-center gap-3 border ${
        isToday 
          ? 'border-white/[0.12] bg-white/[0.04] hover:border-white/20' 
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05]'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-colors ${
        isToday
          ? 'bg-blue-500/10 border-blue-500/25 text-blue-400'
          : 'bg-white/[0.02] border-white/[0.06] text-slate-300 group-hover:border-white/10'
      }`}>
        <span className={`text-[7.5px] font-bold uppercase leading-none mb-0.5 tracking-wider ${isToday ? 'text-blue-400' : 'text-slate-400'}`}>{weekday}</span>
        <span className={`text-xs font-bold font-mono leading-none ${isToday ? 'text-blue-300' : 'text-white'}`}>{dayNum || '–'}</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className={`font-semibold text-xs truncate leading-tight tracking-tight transition-colors ${
            isToday ? 'text-blue-300' : 'text-slate-200 group-hover:text-blue-400'
          }`}>
            {formatPlannedRideTitle(day.focus)}
          </h3>
          <span className={`text-[7.5px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wider border ${
            intensityColors[day.intensity] || intensityColors['Medium']
          }`}>
            {day.intensity}
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
            <Clock size={10} className="text-slate-500" />
            <span>{formatWorkoutDuration(day.duration_target)}</span>
          </div>

          <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
            {sport.name === 'Run' ? (
              <Activity size={10} className="text-orange-400" />
            ) : sport.name === 'Swim' ? (
              <Activity size={10} className="text-sky-400" />
            ) : sport.name === 'Rest' ? (
              <ShieldAlert size={10} className="text-slate-500" />
            ) : (
              <Bike size={10} className={isToday ? 'text-blue-400' : 'text-slate-500'} />
            )}
            <span>{sport.name} Session</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end justify-center shrink-0">
        {day.load_target > 0 ? (
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold font-mono leading-none text-blue-400">{day.load_target}</span>
            <span className="text-[7.5px] font-semibold uppercase tracking-wider text-slate-500 mt-0.5">TSS</span>
          </div>
        ) : (
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-semibold text-slate-500 leading-none">REST</span>
          </div>
        )}
      </div>
    </div>
  );
});
SuggestedWorkoutCard.displayName = 'SuggestedWorkoutCard';
