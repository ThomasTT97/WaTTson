import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, X, TrendingUp, Clock, Zap, Calendar, Activity as ActivityIcon } from 'lucide-react';
import { Activity as ActivityType } from '../types';
import { generateMonthlyInsights, MonthlyReportData } from '../services/geminiService';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface MonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activities: ActivityType[];
  ftp: number | null;
}

export const MonthlyReportModal: React.FC<MonthlyReportModalProps> = ({
  isOpen,
  onClose,
  activities,
  ftp
}) => {
  const [insights, setInsights] = useState<MonthlyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const stats = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    const recent = activities.filter(a => new Date(a.start_date_local) >= thirtyDaysAgo);
    
    const totalSeconds = recent.reduce((acc, a) => acc + (a.moving_time || 0), 0);
    const totalHours = Math.round(totalSeconds / 360) / 10;
    
    const totalLoad = Math.round(recent.reduce((acc, a) => acc + (a.icu_training_load || a.icu_tss || 0), 0));
    
    const longestRideSeconds = Math.max(0, ...recent.map(a => a.moving_time || 0));
    const longestRideHours = Math.round(longestRideSeconds / 360) / 10;

    // Daily load for chart
    const loadByDate = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      loadByDate.set(d.toISOString().split('T')[0], 0);
    }
    
    recent.forEach(a => {
      const d = a.start_date_local.split('T')[0];
      if (loadByDate.has(d)) {
        loadByDate.set(d, loadByDate.get(d)! + (a.icu_training_load || a.icu_tss || 0));
      }
    });

    const chartData = Array.from(loadByDate.entries()).map(([date, load]) => ({
      date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      load
    }));

    return {
      totalHours,
      totalLoad,
      activityCount: recent.length,
      longestRideHours,
      chartData
    };
  }, [activities]);

  useEffect(() => {
    if (isOpen && activities.length > 0 && !insights) {
      const fetchInsights = async () => {
        setIsLoading(true);
        try {
          const res = await generateMonthlyInsights(activities, ftp || undefined);
          setInsights(res);
        } catch (e) {
          console.error(e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchInsights();
    }
  }, [isOpen, activities, ftp, insights]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 top-16 bottom-16 bg-slate-900 border border-slate-700 rounded-3xl z-50 overflow-hidden flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white italic tracking-tight">Monthly Report</h2>
                  <p className="text-xs text-slate-400 font-medium">Last 30 Days Overview</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto hide-scrollbar p-5 space-y-6">
              
              {/* Key Figures */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={14} className="text-cyan-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Time</span>
                  </div>
                  <span className="text-2xl font-black italic text-white">{stats.totalHours}<span className="text-sm text-slate-500 not-italic ml-1">h</span></span>
                </div>
                
                <div className="glass-card p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} className="text-amber-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Load (TSS)</span>
                  </div>
                  <span className="text-2xl font-black italic text-white">{stats.totalLoad}</span>
                </div>

                <div className="glass-card p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <ActivityIcon size={14} className="text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Activities</span>
                  </div>
                  <span className="text-2xl font-black italic text-white">{stats.activityCount}</span>
                </div>

                <div className="glass-card p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar size={14} className="text-purple-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Longest</span>
                  </div>
                  <span className="text-2xl font-black italic text-white">{stats.longestRideHours}<span className="text-sm text-slate-500 not-italic ml-1">h</span></span>
                </div>
              </div>

              {/* Chart */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1">Daily Load</span>
                <div className="h-40 glass-card rounded-2xl border border-white/5 p-4 bg-slate-950/30">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.chartData}>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                        itemStyle={{ color: '#38bdf8', fontWeight: 'bold' }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="load" 
                        stroke="#38bdf8" 
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: '#38bdf8', stroke: '#0f172a', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* AI Insights */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1">Coach's Analysis</span>
                <div className="glass-card rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-3">
                      <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
                      <span className="text-xs text-blue-400/70 font-medium">Analyzing your month...</span>
                    </div>
                  ) : insights ? (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {insights.summary}
                      </p>
                      
                      {insights.improvements && Array.isArray(insights.improvements) && insights.improvements.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Key Achievements</span>
                          <ul className="space-y-2">
                            {insights.improvements.map((imp, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                                <span className="text-blue-400 mt-1 shrink-0">•</span>
                                <span>{imp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">Analysis unavailable.</p>
                  )}
                </div>
              </div>
              
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
