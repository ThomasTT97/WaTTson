import React, { useEffect, useState } from 'react';
import { Activity, Wellness, WeeklyBriefing, RecoveryAdvice } from '../types';
import { getRecoveryAdvice } from '../services/geminiService';
import { X, Sparkles, Moon, Utensils, Activity as ActivityIcon, Heart, RefreshCw, Loader2, Check } from 'lucide-react';

interface RecoveryAdviceModalProps {
  activities: Activity[];
  wellness: Wellness[];
  userGoal?: string;
  weeklyBriefing: WeeklyBriefing | null;
  onClose: () => void;
}

export const RecoveryAdviceModal: React.FC<RecoveryAdviceModalProps> = ({
  activities,
  wellness,
  userGoal = "Increase endurance",
  weeklyBriefing,
  onClose
}) => {
  const [advice, setAdvice] = useState<RecoveryAdvice | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAdvice = async (force = false) => {
    if (force) setIsRefreshing(true);
    else setLoading(true);

    try {
      // Clear cache if force refreshing
      if (force) {
        localStorage.removeItem(`wattson_recovery_advice_${userGoal}`);
      }
      const data = await getRecoveryAdvice(activities, wellness, userGoal, weeklyBriefing);
      setAdvice(data);
    } catch (err) {
      console.error("Failed to fetch recovery advice:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdvice();
  }, [activities, wellness, userGoal, weeklyBriefing]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#05070a]/95 backdrop-blur-3xl flex flex-col animate-in slide-in-from-bottom duration-300 md:max-w-[480px] md:mx-auto md:shadow-2xl overflow-hidden">
      
      {/* Header */}
      <div 
        className="flex-none flex items-center justify-between pb-3 px-6 border-b border-white/5 bg-transparent"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl glass-card flex flex-shrink-0 items-center justify-center shadow-inner relative overflow-hidden border border-white/10">
             <ActivityIcon size={18} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white italic tracking-tight leading-none uppercase">
              Recovery Advice
            </h2>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 items-center">
          <button 
            onClick={() => fetchAdvice(true)}
            disabled={loading || isRefreshing}
            className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-emerald-400 border border-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
            title="Refresh Advice"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin text-emerald-400" : ""} />
          </button>
          
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-slate-500 border border-white/10 active:scale-95 transition-all"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar space-y-4">
        
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-center">
            <Loader2 size={28} className="text-emerald-400 animate-spin mb-4" />
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Analyzing recovery engine...</p>
          </div>
        ) : advice ? (
          <div className="space-y-4 animate-in fade-in duration-500">
            
            {/* Score Ring Hero */}
            <div className="glass-card p-4 rounded-2xl border border-emerald-500/10 bg-gradient-to-r from-slate-950 via-slate-900/30 to-slate-950 relative overflow-hidden flex items-center gap-4">
              <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                {/* Outer ring */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="4"
                    fill="transparent"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="#10b981"
                    strokeWidth="4"
                    fill="transparent"
                    strokeDasharray={175}
                    strokeDashoffset={175 - (175 * advice.score) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-black text-white italic font-mono">{advice.score}</span>
                  <span className="text-[6px] font-black uppercase text-slate-500 tracking-wider">READINESS</span>
                </div>
              </div>

              <div>
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block mb-0.5">
                  Coach Summary
                </span>
                <p className="text-xs text-slate-300 font-medium leading-relaxed italic">
                  "{advice.summary}"
                </p>
              </div>
            </div>

            {/* Key Metrics list */}
            <div className="grid grid-cols-2 gap-2">
              {advice.key_metrics.map((metric, idx) => {
                const isGood = metric.status === 'good';
                const isWarning = metric.status === 'warning';
                
                const statusColor = isGood 
                  ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' 
                  : isWarning 
                    ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' 
                    : 'text-slate-400 border-white/5 bg-white/5';

                return (
                  <div key={idx} className={`border p-2.5 rounded-xl flex flex-col justify-center min-h-[56px] ${statusColor}`}>
                    <span className="text-[7px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{metric.label}</span>
                    <span className="text-xs font-black italic tracking-tight">{metric.value}</span>
                  </div>
                );
              })}
            </div>

            {/* Section: Food & Hydration */}
            <div className="glass-card p-3.5 rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/40 to-slate-950/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                  <Utensils size={12} />
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Food & Hydration</h3>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                {advice.food_advice}
              </p>
            </div>

            {/* Section: Sleep & Rest */}
            <div className="glass-card p-3.5 rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/40 to-slate-950/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Moon size={12} />
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Sleep & Rest Guidelines</h3>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                {advice.sleep_advice}
              </p>
            </div>

            {/* Section: Active Recovery Activities */}
            <div className="glass-card p-3.5 rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/40 to-slate-950/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <ActivityIcon size={12} />
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Recovery Protocol</h3>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                {advice.activity_advice}
              </p>
            </div>

          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-20 text-center opacity-40">
            <p className="text-xs text-slate-400">Unable to load recovery advice. Please check your data logs.</p>
          </div>
        )}

      </div>
    </div>
  );
};
