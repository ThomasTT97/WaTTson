
import React, { useEffect, useState } from 'react';
import { Activity, IntervalsCredentials, CoachingFeedback } from '../types';
import { getRideFeedback } from '../services/geminiService';
import { fetchActivityIntervals, fetchPlannedWorkout } from '../services/intervalsService';
import { X, Sparkles, Activity as ActivityIcon, CheckCircle, Info, Loader2, ArrowLeft, CalendarCheck } from 'lucide-react';

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

  useEffect(() => {
    const fetchFeedback = async () => {
      setLoading(true);
      try {
        // Extract date YYYY-MM-DD
        const dateStr = activity.start_date_local.split('T')[0];

        // 1. Fetch detailed lap data AND planned workout in parallel
        const [intervals, plannedWorkout] = await Promise.all([
          fetchActivityIntervals(activity.id, creds),
          fetchPlannedWorkout(dateStr, creds)
        ]);

        if (plannedWorkout) setHasPlan(true);
        
        // 2. Analyze combined data with Goal context
        const data = await getRideFeedback(activity, intervals, plannedWorkout, userGoal);
        setFeedback(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchFeedback();
  }, [activity, creds, userGoal]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 animate-in slide-in-from-bottom duration-300 max-w-[450px] mx-auto overflow-hidden">
      {/* Navbar */}
      <div className="p-5 flex items-center gap-4 bg-slate-900/50 border-b border-white/5">
        <button onClick={onClose} className="p-2 -ml-2 hover:bg-slate-800 rounded-full transition-colors">
          <ArrowLeft size={24} className="text-white" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white truncate">{activity.name}</h2>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">AI Performance Review</p>
            {hasPlan && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wider">
                <CalendarCheck size={10} /> Plan Detected
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
        {loading ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400 px-8 text-center">
            <div className="relative mb-6">
              <div className="w-16 h-16 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
              <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400" size={24} />
            </div>
            <p className="text-lg font-medium text-white mb-2">Analyzing Your Effort</p>
            <p className="text-sm leading-relaxed text-slate-500">
              Comparing your ride data against {hasPlan ? 'the planned workout' : 'your goals'} and calculating compliance...
            </p>
          </div>
        ) : feedback ? (
          <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            <section className="bg-cyan-500/5 p-6 rounded-3xl border border-cyan-500/10">
              <div className="flex items-center gap-2 mb-4 text-cyan-400">
                <Info size={18} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Summary</span>
              </div>
              <p className="text-slate-200 leading-relaxed text-lg font-light italic">
                "{feedback.summary}"
              </p>
            </section>

            <section>
              <h3 className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                <CheckCircle size={14} /> Key Observations
              </h3>
              <div className="space-y-3">
                {feedback.highlights.map((h, i) => (
                  <div key={i} className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <p className="text-sm text-slate-300 leading-relaxed">{h}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                <ActivityIcon size={14} /> Metric Deep Dive
              </h3>
              <div className="p-5 bg-slate-900 border border-white/5 rounded-2xl text-sm text-slate-400 leading-relaxed font-light">
                {feedback.metrics_analysis}
              </div>
            </section>

            <section className="bg-gradient-to-br from-cyan-600 to-blue-700 p-6 rounded-3xl shadow-xl shadow-cyan-950/20">
              <h3 className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-3">
                Next Training Block
              </h3>
              <p className="text-white leading-relaxed font-medium">
                {feedback.recommendations}
              </p>
            </section>
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-red-400">Unable to generate feedback at this moment.</p>
            <button onClick={onClose} className="mt-4 px-6 py-2 bg-slate-800 rounded-xl text-sm">Close</button>
          </div>
        )}
      </div>
    </div>
  );
};
