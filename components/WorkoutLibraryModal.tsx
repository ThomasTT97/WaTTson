import React, { useState, useMemo } from 'react';
import { X, Search, Clock, Zap, BookOpen, Calendar, Check, Loader2, ArrowRight } from 'lucide-react';
import { LibraryWorkout, WORKOUT_LIBRARY } from '../services/workoutLibrary';
import { IntervalsCredentials } from '../types';
import { uploadWorkout } from '../services/intervalsService';

interface WorkoutLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  ftp: number;
  creds: IntervalsCredentials;
  onApplyAsSuggestion: (workout: LibraryWorkout) => void;
}

export const WorkoutLibraryModal: React.FC<WorkoutLibraryModalProps> = ({
  isOpen,
  onClose,
  ftp = 250,
  creds,
  onApplyAsSuggestion
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedWorkout, setSelectedWorkout] = useState<LibraryWorkout | null>(null);
  const [uploadDate, setUploadDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  // Categories list
  const categories = ['All', 'Recovery', 'Endurance', 'Tempo/Sweet Spot', 'Threshold', 'VO2 Max', 'Anaerobic'];

  // Filter workouts
  const filteredWorkouts = useMemo(() => {
    return WORKOUT_LIBRARY.filter(w => {
      const matchesCategory = activeCategory === 'All' || w.category === activeCategory;
      const matchesSearch = w.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            w.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchTerm, activeCategory]);

  if (!isOpen) return null;

  // Format Intervals.icu plain-text format
  const getIntervalsText = (workout: LibraryWorkout) => {
    return workout.workout_steps.map(step => {
      const durStr = step.duration < 1 
        ? `${Math.round(step.duration * 60)}s` 
        : `${Math.round(step.duration)}m`;
      const pctStr = `${Math.round(step.target_pct * 100)}%`;
      return `- ${step.label} ${durStr} ${pctStr}`;
    }).join('\n');
  };

  const handleUploadToIntervals = async () => {
    if (!selectedWorkout) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const workoutText = getIntervalsText(selectedWorkout);
      await uploadWorkout(creds, {
        name: selectedWorkout.title,
        description: selectedWorkout.description,
        date: uploadDate,
        type: 'Ride',
        moving_time: selectedWorkout.duration_minutes * 60,
        icu_training_load: selectedWorkout.tss,
        workout_text: workoutText
      });
      setUploadSuccess(true);
      setTimeout(() => {
        setUploadSuccess(false);
      }, 3000);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload workout to Intervals.icu");
    } finally {
      setIsUploading(false);
    }
  };

  const handleApplySuggestion = () => {
    if (!selectedWorkout) return;
    onApplyAsSuggestion(selectedWorkout);
    setAppliedSuccess(true);
    setTimeout(() => {
      setAppliedSuccess(false);
      setSelectedWorkout(null);
      onClose();
    }, 1500);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Recovery': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'Endurance': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'Tempo/Sweet Spot': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'Threshold': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'VO2 Max': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'Anaerobic': return 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="glass-card w-full max-w-lg rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shadow-inner">
              <BookOpen size={20} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white italic tracking-tight leading-none mb-1">Workout Library</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Browse and schedule curated workouts</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Categories Tab Bar */}
        <div className="px-6 py-3 border-b border-white/5 bg-slate-950/20 overflow-x-auto whitespace-nowrap custom-scrollbar flex gap-1.5 shrink-0">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                activeCategory === category
                  ? 'bg-blue-500 text-slate-950 border-blue-600 shadow-md font-extrabold'
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="p-4 px-6 border-b border-white/5 bg-slate-950/10 shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search by workout name or focus..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[#07090e] border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/40 font-semibold"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3.5 text-slate-500 hover:text-white text-xs font-semibold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Content Panel (List vs Detail) */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/10">
          {!selectedWorkout ? (
            /* Workouts Grid/List */
            filteredWorkouts.length > 0 ? (
              <div className="space-y-3">
                {filteredWorkouts.map(workout => (
                  <div
                    key={workout.id}
                    onClick={() => setSelectedWorkout(workout)}
                    className="p-4 rounded-xl border border-white/5 bg-slate-950/40 hover:bg-slate-900/50 hover:border-white/10 transition-all cursor-pointer group flex flex-col gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border w-fit ${getCategoryColor(workout.category)}`}>
                          {workout.category}
                        </span>
                        <h4 className="text-xs font-black text-white uppercase group-hover:text-blue-400 transition-colors">
                          {workout.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1 text-[10px] font-black text-slate-400">
                          <Clock size={12} className="text-blue-400" /> {workout.duration_minutes}m
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-black text-amber-500 italic">
                          <Zap size={12} fill="currentColor" /> {workout.tss} TSS
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      {workout.description}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">No Workouts Found</p>
                <p className="text-[11px] text-slate-600">Try adjusting your filters or search term</p>
              </div>
            )
          ) : (
            /* Workout Detail View */
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              {/* Back Button */}
              <button
                onClick={() => {
                  setSelectedWorkout(null);
                  setUploadError(null);
                }}
                className="inline-flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-wider transition-colors"
              >
                ← Back to library
              </button>

              <div className="p-5 rounded-2xl border border-white/10 bg-slate-950/60 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <span className={`inline-block px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border w-fit ${getCategoryColor(selectedWorkout.category)}`}>
                    {selectedWorkout.category}
                  </span>
                  <h3 className="text-base font-black text-white uppercase tracking-tight italic">
                    {selectedWorkout.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {selectedWorkout.description}
                  </p>
                </div>

                <div className="flex items-center gap-6 border-y border-white/5 py-3">
                  <div className="flex items-center gap-1.5 text-xs font-black text-white">
                    <Clock size={14} className="text-blue-400" /> {selectedWorkout.duration_minutes} MINUTES
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-400 italic">
                    <Zap size={14} fill="currentColor" /> {selectedWorkout.tss} TSS
                  </div>
                </div>

                {/* Steps List */}
                <div className="space-y-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Workout Steps ({selectedWorkout.workout_steps.length})</span>
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                    {selectedWorkout.workout_steps.map((step, idx) => {
                      const watts = Math.round(step.target_pct * ftp);
                      const pctStr = `${Math.round(step.target_pct * 100)}%`;
                      return (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 bg-slate-900/60 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 bg-white/5 rounded-full flex items-center justify-center text-[9px] font-bold text-slate-400">{idx + 1}</span>
                            <span className="text-xs text-white font-bold">{step.label}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-slate-500 font-bold">{step.duration < 1 ? `${Math.round(step.duration * 60)}s` : `${step.duration}m`}</span>
                            <span className="text-xs text-emerald-400 font-black tracking-tighter">{watts}W <span className="text-[9px] text-slate-500 font-normal">({pctStr})</span></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Local planning actions */}
                <div className="border-t border-white/5 pt-4 space-y-3.5">
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleApplySuggestion}
                      className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-xl shadow-blue-500/10"
                    >
                      {appliedSuccess ? (
                        <>
                          <Check size={14} /> Applied!
                        </>
                      ) : (
                        <>
                          Select as Today's Suggested Workout <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-slate-500 font-medium text-center leading-relaxed">
                      This will replace today's suggested workout on the Overview page and sync directly with your planning engine.
                    </p>
                  </div>
                </div>

                {/* Intervals.icu schedule sync actions */}
                <div className="border-t border-white/5 pt-4 space-y-3">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Calendar size={12} className="text-emerald-400" /> Schedule on Intervals.icu
                  </span>
                  
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={uploadDate}
                      onChange={e => setUploadDate(e.target.value)}
                      className="bg-[#07090e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-semibold"
                    />
                    
                    <button
                      onClick={handleUploadToIntervals}
                      disabled={isUploading}
                      className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10 cursor-pointer"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="animate-spin" size={12} /> Syncing...
                        </>
                      ) : uploadSuccess ? (
                        <>
                          <Check size={12} /> Synced!
                        </>
                      ) : (
                        <>
                          Upload to Calendar
                        </>
                      )}
                    </button>
                  </div>

                  {uploadError && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-400 font-semibold leading-tight">
                      {uploadError}
                    </div>
                  )}
                  {uploadSuccess && (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-400 font-semibold leading-tight text-center">
                      ✓ Successfully added to your Intervals.icu calendar!
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
