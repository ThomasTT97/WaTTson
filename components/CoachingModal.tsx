
import React, { useEffect, useState } from 'react';
import { Activity, IntervalsCredentials, CoachingFeedback } from '../types';
import { getRideFeedback } from '../services/geminiService';
import { fetchActivityIntervals, fetchPlannedWorkout } from '../services/intervalsService';
import { 
  X, 
  Sparkles, 
  Activity as ActivityIcon, 
  CheckCircle, 
  Info, 
  Loader2, 
  ArrowLeft, 
  CalendarCheck,
  Zap,
  Clock,
  Heart,
  TrendingUp,
  Flame,
  Quote,
  AlertCircle
} from 'lucide-react';

interface CoachingModalProps {
  activity: Activity;
  creds: IntervalsCredentials;
  onClose: () => void;
  userGoal?: string;
}

export const CoachingModal: React.FC<CoachingModalProps> = ({ activity, creds, onClose, userGoal }) => {
  const [feedback, setFeedback] = useState<CoachingFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPlan, setHasPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFeedback = async () => {
      setLoading(true);
      setError(null);
      try {
        const dateStr = activity.start_date_local.split('T')[0];
        const [intervals, plannedWorkout] = await Promise.all([
          fetchActivityIntervals(activity.id, creds),
          fetchPlannedWorkout(dateStr, creds)
        ]);
        if (plannedWorkout) setHasPlan(true);
        const data = await getRideFeedback(activity, intervals, plannedWorkout, userGoal);
        setFeedback(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Something went wrong during analysis.");
      } finally {
        setLoading(false);
      }
    };
    fetchFeedback();
  }, [activity, creds, userGoal]);

  const load = activity.icu_training_load ?? activity.icu_tss ?? 0;
  
  // Duration formatting: Xh Ym
  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  const durationStr = formatDuration(activity.moving_time || 0);
  
  // Format Date & Time
  const dateObj = new Date(activity.start_date_local);
  const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // --- Dynamic Metrics Grid Logic ---
  
  interface MetricItem {
    label: string;
    value: string | number;
    icon: any;
    colorClass: string;
    bgClass: string;
    colSpan?: number;
  }

  const metrics: MetricItem[] = [
    { 
      label: 'TSS Load', 
      value: Math.round(load), 
      icon: TrendingUp, 
      colorClass: 'text-amber-400', 
      bgClass: 'bg-amber-500/10' 
    },
    { 
      label: 'Duration', 
      value: durationStr, 
      icon: Clock, 
      colorClass: 'text-blue-400', 
      bgClass: 'bg-blue-500/10' 
    }
  ];

  const avgWatts = activity.average_watts;
  const normWatts = activity.weighted_average_watts;

  if (activity.average_heartrate && activity.average_heartrate > 0) {
    const showNpInHr = normWatts && normWatts > 0;
    metrics.push({
      label: showNpInHr ? 'Avg HR / NP' : 'Avg HR',
      value: showNpInHr ? `${activity.average_heartrate} / ${Math.round(normWatts!)}` : activity.average_heartrate,
      icon: Heart,
      colorClass: 'text-rose-400',
      bgClass: 'bg-rose-500/10'
    });
  }

  if (avgWatts && avgWatts > 0) {
    metrics.push({
      label: 'Avg Power',
      value: `${Math.round(avgWatts)}W`,
      icon: Zap, 
      colorClass: 'text-purple-400',
      bgClass: 'bg-purple-500/10'
    });
  }

  if (activity.icu_intensity && activity.icu_intensity > 0) {
    metrics.push({
     label: 'Intensity',
     value: activity.icu_intensity.toFixed(2),
     icon: ActivityIcon,
     colorClass: 'text-emerald-400',
     bgClass: 'bg-emerald-500/10'
   });
 }

 const calories = activity.calories || (activity.icu_joules ? Math.round(activity.icu_joules / 1000) : 0);
 const ef = activity.icu_efficiency_factor || (normWatts && activity.average_heartrate && activity.average_heartrate > 0 ? normWatts / activity.average_heartrate : 0);

 if (calories > 0) {
   metrics.push({
     label: 'Calories',
     value: `${calories}`,
     icon: Flame,
     colorClass: 'text-orange-400',
     bgClass: 'bg-orange-500/10'
   });
 }

 if (ef > 0) {
   metrics.push({
     label: 'Efficiency',
     value: ef.toFixed(2),
     icon: Zap,
     colorClass: 'text-cyan-400',
     bgClass: 'bg-cyan-500/10'
   });
 }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 animate-in slide-in-from-bottom duration-300 h-[100dvh] max-w-[450px] mx-auto overflow-hidden">
      
      <div 
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 mt-2"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button 
          onClick={onClose} 
          className="w-10 h-10 rounded-full bg-slate-900/50 backdrop-blur-md flex items-center justify-center hover:bg-slate-800 transition-colors border border-white/5 text-white"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
        
        <div 
          className="relative px-5 pb-6 bg-gradient-to-b from-cyan-900/40 to-slate-950 border-b border-white/5"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}
        >
           <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
             <div className="absolute top-[-50%] left-[-20%] w-[140%] h-[140%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent opacity-50 blur-3xl pointer-events-none"></div>
           </div>

           <div className="relative z-10">
             <div className="flex items-center gap-2 mb-1.5">
               <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                 {dateStr} <span className="text-slate-600 mx-1">•</span> {timeStr}
               </span>
               {hasPlan && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider">
                  <CalendarCheck size={10} /> Planned
                </span>
               )}
             </div>
             
             <h1 className="text-xl font-bold text-white mb-4 leading-tight">{activity.name}</h1>

             <div className="grid grid-cols-2 gap-2">
               {metrics.map((m, idx) => (
                 <div key={idx} className={`bg-slate-900/60 backdrop-blur rounded-2xl p-2.5 border border-white/5 flex items-center gap-2.5 ${m.colSpan === 2 ? 'col-span-2' : ''}`}>
                   <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${m.bgClass} ${m.colorClass}`}>
                     <m.icon size={16} fill={m.icon === Zap || m.icon === Heart || m.icon === Flame ? "currentColor" : "none"} />
                   </div>
                   <div>
                     <p className="text-base font-bold text-white leading-none">{m.value}</p>
                     <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{m.label}</p>
                   </div>
                 </div>
               ))}
             </div>
           </div>
        </div>

        <div className="px-5 pt-6 space-y-6">
          {loading ? (
             <div className="flex flex-col items-center justify-center py-12 text-center animate-pulse">
               <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center mb-4 ring-1 ring-cyan-500/40">
                 <Sparkles size={20} className="text-cyan-400" />
               </div>
               <p className="text-sm font-medium text-slate-300">Analyzing Performance...</p>
               <p className="text-[11px] text-slate-500 mt-1">Comparing against your training goals</p>
             </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-red-500/5 rounded-3xl border border-red-500/10 mx-5">
               <AlertCircle className="text-red-400 mb-2" size={24} />
               <p className="text-sm font-bold text-red-200">Analysis Failed</p>
               <p className="text-xs text-red-400/60 mt-1 px-8">{error}</p>
               <button onClick={onClose} className="mt-6 px-6 py-2 bg-white/5 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition-all uppercase tracking-widest">Return to Rides</button>
            </div>
          ) : feedback ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="bg-gradient-to-br from-slate-900 to-slate-900/50 p-5 rounded-2xl border border-white/5 relative overflow-hidden">
                <Quote className="absolute top-4 right-4 text-white/5 transform rotate-180" size={40} />
                <h3 className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                   <Sparkles size={12} /> Coach Summary
                </h3>
                <p className="text-slate-200 text-sm leading-relaxed italic font-light relative z-10">
                  "{feedback.summary || 'No summary available.'}"
                </p>
              </div>

              <div>
                <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-3 px-1">
                  Performance Highlights
                </h3>
                <div className="space-y-2">
                  {feedback.highlights && Array.isArray(feedback.highlights) && feedback.highlights.length > 0 ? feedback.highlights.map((h, i) => (
                    <div key={i} className="flex gap-3 p-3 bg-white/5 rounded-xl border border-white/5 items-start">
                      <div className="mt-0.5 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <CheckCircle size={10} className="text-emerald-400" />
                      </div>
                      <p className="text-[13px] text-slate-300 leading-snug">{h}</p>
                    </div>
                  )) : (
                    <p className="text-xs text-slate-500 px-1 italic">No specific highlights identified.</p>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5">
                <h3 className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                  <TrendingUp size={12} /> Analysis
                </h3>
                <p className="text-[13px] text-slate-400 leading-relaxed">
                  {feedback.metrics_analysis || 'Metrics analysis not generated.'}
                </p>
              </div>

              <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 p-5 rounded-2xl border border-cyan-500/20">
                <h3 className="text-white text-[10px] font-bold uppercase tracking-widest mb-2 opacity-80">
                  Next Steps
                </h3>
                <p className="text-sm font-medium text-white leading-relaxed">
                  {feedback.recommendations || 'Rest and recover for your next session.'}
                </p>
              </div>

            </div>
          ) : (
            <div className="text-center py-10 opacity-40">
              <p className="text-xs">Awaiting data...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
