import React, { useEffect, useState } from 'react';
import { Activity, Wellness, WeeklyBriefing, RecoveryAdvice } from '../types';
import { getRecoveryAdvice } from '../services/geminiService';
import { X, Sparkles, Moon, Utensils, Activity as ActivityIcon, Heart, RefreshCw, Loader2, Check, TrendingUp, Zap } from 'lucide-react';

interface RecoveryAdviceModalProps {
  activities: Activity[];
  wellness: Wellness[];
  userGoal?: string;
  weeklyBriefing: WeeklyBriefing | null;
  stats: { ctl: number; atl: number; form: number };
  onClose: () => void;
}

export const RecoveryAdviceModal: React.FC<RecoveryAdviceModalProps> = ({
  activities,
  wellness,
  userGoal = "Increase endurance",
  weeklyBriefing,
  stats,
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
            
            {/* 3-column PMC metrics */}
            <div className="grid grid-cols-3 gap-2">
              {/* Fitness / CTL */}
              <div className="glass-card p-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-slate-900/30 to-slate-950/20 text-center min-h-[58px] group hover:border-white/10 transition-all">
                <div className="absolute top-0 right-0 w-8 h-8 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
                <div className="flex items-center gap-1 text-blue-400">
                  <TrendingUp size={9} strokeWidth={2.5} />
                  <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-400">Fitness</span>
                </div>
                <div className="mt-0.5">
                  <span className="text-xl font-black italic tracking-tight text-white font-mono">{stats.ctl}</span>
                </div>
              </div>

              {/* Fatigue / ATL */}
              <div className="glass-card p-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-slate-900/30 to-slate-950/20 text-center min-h-[58px] group hover:border-white/10 transition-all">
                <div className="absolute top-0 right-0 w-8 h-8 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
                <div className="flex items-center gap-1 text-amber-400">
                  <Zap size={9} strokeWidth={2.5} fill="currentColor" />
                  <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-400">Fatigue</span>
                </div>
                <div className="mt-0.5">
                  <span className="text-xl font-black italic tracking-tight text-white font-mono">{stats.atl}</span>
                </div>
              </div>

              {/* Form / TSB */}
              <div className="glass-card p-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-slate-900/30 to-slate-950/20 text-center min-h-[58px] group hover:border-white/10 transition-all">
                <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
                <div className="flex items-center gap-1 text-emerald-400">
                  <ActivityIcon size={9} strokeWidth={2.5} />
                  <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-400">Form</span>
                </div>
                <div className="mt-0.5 flex flex-col items-center">
                  <span className={`text-xl font-black italic tracking-tight font-mono leading-none ${stats.form >= 5 ? 'text-emerald-400' : stats.form < -25 ? 'text-rose-400' : stats.form < -10 ? 'text-amber-400' : 'text-slate-200'}`}>
                    {stats.form > 0 ? `+${stats.form}` : stats.form}
                  </span>
                </div>
              </div>
            </div>

            {/* Advice Sections */}
            <div className="space-y-3 pt-2">
              <div className="glass-card p-4 rounded-2xl border border-white/5 bg-slate-900/40">
                <div className="flex items-center gap-2 mb-2 text-emerald-400">
                  <Moon size={16} />
                  <h3 className="font-bold text-sm uppercase tracking-wider">Sleep & Rest</h3>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{advice.sleep_advice}</p>
              </div>

              <div className="glass-card p-4 rounded-2xl border border-white/5 bg-slate-900/40">
                <div className="flex items-center gap-2 mb-2 text-blue-400">
                  <Utensils size={16} />
                  <h3 className="font-bold text-sm uppercase tracking-wider">Food & Hydration</h3>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{advice.food_advice}</p>
              </div>

              <div className="glass-card p-4 rounded-2xl border border-white/5 bg-slate-900/40">
                <div className="flex items-center gap-2 mb-2 text-rose-400">
                  <Heart size={16} />
                  <h3 className="font-bold text-sm uppercase tracking-wider">Recovery Protocols</h3>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{advice.activity_advice}</p>
              </div>
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
