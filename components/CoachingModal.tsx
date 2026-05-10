import React, { useEffect, useState } from 'react';
import { Activity, IntervalsCredentials, CoachingFeedback } from '../types';
import { getRideFeedback } from '../services/geminiService';
import { fetchActivityIntervals, fetchPlannedWorkout } from '../services/intervalsService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  ArrowLeft, 
  Zap,
  Clock,
  Heart,
  TrendingUp,
  Flame,
  Target,
  Trophy,
  Activity as ActivityIcon,
  ChevronRight
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
        const data = await getRideFeedback(activity, intervals, plannedWorkout, userGoal);
        setFeedback(data);
      } catch (err: any) {
        setError(err.message || "Engine analysis failed.");
      } finally {
        setLoading(false);
      }
    };
    fetchFeedback();
  }, [activity, creds, userGoal]);

  const dateObj = new Date(activity.start_date_local);
  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const metrics = [
    { label: 'Duration', value: formatDuration(activity.moving_time || activity.elapsed_time || 0), icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { 
      label: 'Performance', 
      value: `${Math.round(activity.average_watts ?? activity.icu_average_watts ?? 0)}w ${Math.round(activity.average_heartrate || 0)}bpm`, 
      icons: [Zap, Heart], 
      color: 'text-emerald-400', 
      bg: 'bg-emerald-500/10' 
    },
    { label: 'Distance', value: `${activity.distance ? (Math.round(activity.distance / 100) / 10) : 0}km`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'TSS', value: String(Math.round(activity.icu_training_load || activity.icu_tss || activity.training_load || 0)), icon: Target, color: 'text-amber-400', bg: 'bg-amber-500/10' }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 }
    }
  } as const;

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[200] flex flex-col bg-[#05070a]/95 backdrop-blur-3xl h-[100dvh] max-w-[450px] mx-auto overflow-hidden shadow-2xl"
      id="coaching-modal"
    >
      {/* Decorative Background Flare */}
      <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[40%] bg-emerald-500/5 blur-[120px] pointer-events-none" />
      
      {/* Header */}
      <div 
        className="relative z-20 flex items-center justify-between px-6 py-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={onClose} 
          className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          id="back-button"
        >
          <ArrowLeft size={20} />
        </motion.button>
        <div className="text-center">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="w-11" />
      </div>

      <div 
        className="flex-1 overflow-y-auto custom-scrollbar px-4 relative z-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 3rem)' }}
      >
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="mt-6 mb-10"
        >
          <motion.div variants={itemVariants}>
            <h1 className="text-[1.85rem] font-bold text-white italic mb-1 leading-tight uppercase tracking-tighter">
              {activity.name}
            </h1>
            <div className="flex items-center gap-2 mb-8">
               <div className="h-0.5 w-8 bg-emerald-500 rounded-full" />
               <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em]">{activity.type}</p>
            </div>
          </motion.div>
          
          <motion.div variants={itemVariants} className="grid grid-cols-4 gap-2 mb-8">
            {metrics.map((m: any, i) => (
              <div key={i} className="glass-card rounded-xl p-3 flex flex-col items-center justify-center border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group text-center min-h-[90px]">
                <div className={`h-6 rounded-lg flex items-center justify-center mb-2 px-1.5 ${m.bg} ${m.color} group-hover:scale-110 transition-transform`}>
                  {m.icons ? (
                    <div className="flex items-center gap-0.5">
                      {m.icons.map((Icon: any, idx: number) => (
                        <Icon key={idx} size={10} fill={Icon === Zap || Icon === Heart || Icon === Flame ? "currentColor" : "none"} />
                      ))}
                    </div>
                  ) : (
                    <m.icon size={11} fill={m.icon === Zap || m.icon === Heart || m.icon === Flame ? "currentColor" : "none"} />
                  )}
                </div>
                <span className="block text-[14px] font-bold text-white tracking-tighter leading-none italic mb-1">{m.value}</span>
                <span className="block text-[7px] font-black text-slate-500 uppercase tracking-[0.05em]">
                  {m.label === 'Performance' ? 'PWR/HR' : m.label === 'Duration' ? 'DUR' : m.label === 'Calories' ? 'KCAL' : m.label}
                </span>
              </div>
            ))}
          </motion.div>

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-10 text-center"
              >
                <div className="relative w-8 h-8 mb-4">
                  <div className="absolute inset-0 border-2 border-emerald-500/10 rounded-full"></div>
                  <div className="absolute inset-0 border-2 border-t-emerald-500 rounded-full animate-spin"></div>
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Analyzing</p>
              </motion.div>
            ) : error ? (
              <motion.div 
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 text-center glass-card rounded-2xl border-rose-500/20 bg-rose-500/5"
              >
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest leading-none">Analysis Blocked</p>
                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">{error}</p>
              </motion.div>
            ) : feedback && (
              <motion.div 
                key="content"
                variants={containerVariants}
                className="space-y-4"
              >
                <motion.div 
                  variants={itemVariants}
                  className="glass-card p-6 rounded-[2rem] relative overflow-hidden bg-gradient-to-br from-white/[0.03] to-transparent border-white/10"
                >
                   <div className="flex items-center gap-2 mb-4">
                     <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                       <Sparkles size={11} className="text-emerald-400" />
                     </div>
                     <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Coach's Insight</h3>
                   </div>
                   <p className="text-[1.05rem] text-white leading-relaxed italic font-medium tracking-tight">
                     "{feedback.summary}"
                   </p>
                </motion.div>
 
                <motion.div 
                  variants={itemVariants}
                  className="glass-card p-6 rounded-[2rem] border-white/5 bg-white/[0.01]"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Target size={11} className="text-amber-400" />
                    </div>
                    <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">Progression Path</h3>
                  </div>
                  
                  <div className="bg-slate-950/60 p-5 rounded-[1.5rem] border border-white/5 relative overflow-hidden group">
                    <p className="text-[13px] text-slate-300 leading-relaxed relative z-10">{feedback.goal_contribution}</p>
                    
                    <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest italic">
                        <Trophy size={11} className="text-emerald-400" /> {userGoal || 'Peak Performance'}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Bottom Glow */}
      <div className="absolute bottom-[-5%] left-[-10%] w-[120%] h-[20%] bg-indigo-500/5 blur-[80px] pointer-events-none" />
    </motion.div>
  );
};