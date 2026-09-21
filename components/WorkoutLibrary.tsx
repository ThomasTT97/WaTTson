import React, { useState, useMemo } from 'react';
import { 
  Search, Clock, Zap, BookOpen, Calendar, Check, Loader2, ArrowRight, 
  ChevronDown, ChevronRight, X, Activity 
} from 'lucide-react';
import { LibraryWorkout, WORKOUT_LIBRARY } from '../services/workoutLibrary';
import { IntervalsCredentials } from '../types';
import { uploadWorkout } from '../services/intervalsService';
import { 
  isEnduranceWorkout, 
  VisualProfileChart, 
  GroupedWorkoutStepsList, 
  calculateWorkoutAverageWatts 
} from './StepLabel';

interface WorkoutLibraryProps {
  ftp: number;
  creds: IntervalsCredentials;
  onApplyAsSuggestion: (workout: LibraryWorkout) => void;
  onClose: () => void;
}

export const WorkoutLibrary: React.FC<WorkoutLibraryProps> = ({
  ftp = 250,
  creds,
  onApplyAsSuggestion,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Track expanded categories - all collapsed by default
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Recovery': false,
    'Endurance': false,
    'Tempo/Sweet Spot': false,
    'Threshold': false,
    'VO2 Max': false,
    'Anaerobic': false,
  });

  const [selectedWorkout, setSelectedWorkout] = useState<LibraryWorkout | null>(null);
  const [actionTab, setActionTab] = useState<'today' | 'schedule'>('today');

  const [uploadDate, setUploadDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  // List of categories in order
  const categories: LibraryWorkout['category'][] = [
    'Recovery',
    'Endurance',
    'Tempo/Sweet Spot',
    'Threshold',
    'VO2 Max',
    'Anaerobic'
  ];

  // Group workouts by category and apply search filter
  const groupedWorkouts = useMemo(() => {
    const groups: Record<string, LibraryWorkout[]> = {};
    categories.forEach(cat => {
      groups[cat] = [];
    });

    WORKOUT_LIBRARY.forEach(w => {
      const matchesSearch = !searchTerm || 
        w.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        w.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (matchesSearch && groups[w.category]) {
        groups[w.category].push(w);
      }
    });

    return groups;
  }, [searchTerm]);

  // If search matches are found, auto-expand categories that have workouts
  React.useEffect(() => {
    if (searchTerm) {
      const newExpanded: Record<string, boolean> = {};
      categories.forEach(cat => {
        newExpanded[cat] = (groupedWorkouts[cat] || []).length > 0;
      });
      setExpandedCategories(newExpanded);
    }
  }, [searchTerm, groupedWorkouts]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

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
      onClose(); // Go back to main menu
    }, 1200);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Recovery': return 'text-emerald-400 bg-white/[0.03] border-white/10';
      case 'Endurance': return 'text-blue-400 bg-white/[0.03] border-white/10';
      case 'Tempo/Sweet Spot': return 'text-amber-400 bg-white/[0.03] border-white/10';
      case 'Threshold': return 'text-orange-400 bg-white/[0.03] border-white/10';
      case 'VO2 Max': return 'text-rose-400 bg-white/[0.03] border-white/10';
      case 'Anaerobic': return 'text-purple-400 bg-white/[0.03] border-white/10';
      default: return 'text-slate-400 bg-white/[0.03] border-white/10';
    }
  };

  const formatDisplayDuration = (mins: number, category?: string, title?: string) => {
    const isEndurance = category === 'Endurance' || (title && title.toLowerCase().includes('endurance'));
    if (isEndurance) {
      if (mins % 60 === 0) return `${mins / 60}H`;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}H${m > 0 ? (m < 10 ? `0${m}` : m) : ''}` : `${m} MIN`;
    }
    return `${mins} MIN`;
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
        <input 
          type="text"
          placeholder="Search by category, name, intervals..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-white/[0.02] border border-white/[0.08] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors"
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Expandable Categories List */}
      <div className="space-y-2">
        {categories.map(category => {
          const list = groupedWorkouts[category] || [];
          const isExpanded = !!expandedCategories[category];
          const hasWorkouts = list.length > 0;

          // Hide empty categories during search
          if (searchTerm && !hasWorkouts) return null;

          return (
            <div 
              key={category} 
              className={`rounded-xl border transition-all overflow-hidden ${
                isExpanded 
                  ? 'bg-white/[0.02] border-white/[0.1]' 
                  : 'bg-white/[0.01] border-white/[0.06] hover:border-white/10'
              }`}
            >
              {/* Category Bar */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 flex items-center justify-between transition-colors focus:outline-none cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider border ${getCategoryColor(category)}`}>
                    {category}
                  </span>
                  <span className="text-[9.5px] font-medium text-slate-400 font-mono">
                    ({list.length})
                  </span>
                </div>
                <div className="text-slate-400 hover:text-white transition-colors">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              </button>

              {/* Workout Titles Under Expanded Category */}
              {isExpanded && (
                <div className="border-t border-white/[0.06] bg-black/20 divide-y divide-white/[0.04]">
                  {hasWorkouts ? (
                    list.map(workout => (
                      <button
                        key={workout.id}
                        onClick={() => {
                          setSelectedWorkout(workout);
                          setActionTab('today');
                        }}
                        className="w-full px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <span className="text-xs text-white font-medium tracking-normal hover:text-slate-200">
                          {workout.title}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider bg-white/[0.03] px-2 py-0.5 rounded border border-white/5">
                            {formatDisplayDuration(workout.duration_minutes, workout.category, workout.title)}
                          </span>
                          <span className="text-[9px] text-amber-400 font-mono">
                            {workout.tss} TSS
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2.5 text-center text-[10px] text-slate-400 font-medium">
                      No matches in this category
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unified Workout Visualization Modal Card */}
      {selectedWorkout && (
        <div 
          className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => {
            setSelectedWorkout(null);
            setUploadError(null);
          }}
        >
          <div 
            className="bg-[#0c0e15] border-t sm:border border-white/10 w-full sm:max-w-md h-[92dvh] sm:h-auto sm:max-h-[88dvh] rounded-none sm:rounded-2xl p-5 shadow-2xl flex flex-col overflow-hidden relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-3 pb-2.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span className={`px-2 py-0.5 rounded-md border font-bold text-[9px] tracking-wider uppercase shrink-0 ${getCategoryColor(selectedWorkout.category)}`}>
                  {selectedWorkout.category}
                </span>
                <h3 className="text-sm font-bold text-white uppercase truncate">
                  {selectedWorkout.title}
                </h3>
              </div>
              <button 
                onClick={() => {
                  setSelectedWorkout(null);
                  setUploadError(null);
                }} 
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 space-y-3">
              {/* Compact Metrics Strip */}
              {(() => {
                const avgWatts = calculateWorkoutAverageWatts(
                  selectedWorkout.workout_steps,
                  ftp || 250,
                  ftp || 250,
                  {
                    duration: selectedWorkout.duration_minutes,
                    focus: selectedWorkout.title,
                    intensity: selectedWorkout.intensity,
                    tss: selectedWorkout.tss
                  }
                );

                return (
                  <div className="grid grid-cols-3 gap-2 p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={10} className="text-slate-400" /> Duration
                      </span>
                      <span className="text-xs font-bold text-white mt-0.5 font-mono">
                        {selectedWorkout.category === 'Endurance' || selectedWorkout.title.toLowerCase().includes('endurance')
                          ? formatDisplayDuration(selectedWorkout.duration_minutes, selectedWorkout.category, selectedWorkout.title)
                          : `${selectedWorkout.duration_minutes} MIN`}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center border-x border-white/[0.06]">
                      <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Zap size={10} fill="currentColor" className="text-amber-400" /> Load
                      </span>
                      <span className="text-xs font-bold text-amber-400 mt-0.5 font-mono">
                        {selectedWorkout.tss} TSS
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Activity size={10} className="text-emerald-400" /> Target
                      </span>
                      <span className="text-xs font-bold text-emerald-400 mt-0.5 font-mono">
                        {avgWatts ? `${avgWatts}W` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Description quote */}
              {selectedWorkout.description && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-2.5 text-center">
                  <p className="text-xs text-slate-300 leading-relaxed font-normal">
                    "{selectedWorkout.description}"
                  </p>
                </div>
              )}

              {/* Standardized Visual Profile and Intervals Cards */}
              {selectedWorkout.workout_steps && selectedWorkout.workout_steps.length > 0 && (
                <div className="space-y-2">
                  <VisualProfileChart 
                    steps={selectedWorkout.workout_steps}
                    currentFtp={ftp || undefined}
                  />
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 space-y-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block border-b border-white/[0.06] pb-1">
                      Intervals
                    </span>
                    <GroupedWorkoutStepsList 
                      steps={selectedWorkout.workout_steps}
                      currentFtp={ftp || undefined}
                      fontSize="sm"
                    />
                  </div>
                </div>
              )}

              {/* Unified Action Tabs */}
              <div className="border-t border-white/[0.06] pt-3 space-y-2.5">
                <div className="flex p-0.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <button
                    onClick={() => setActionTab('today')}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      actionTab === 'today'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Apply To Today
                  </button>
                  <button
                    onClick={() => setActionTab('schedule')}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      actionTab === 'schedule'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Schedule Calendar
                  </button>
                </div>

                {/* Tab Contents */}
                {actionTab === 'today' ? (
                  <div className="animate-in fade-in duration-150">
                    <button
                      onClick={handleApplySuggestion}
                      className="w-full py-2.5 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {appliedSuccess ? (
                        <>
                          <Check size={12} /> Applied Successfully!
                        </>
                      ) : (
                        <>
                          Set as Today's Suggested Workout <ArrowRight size={11} />
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 animate-in fade-in duration-150">
                    <div className="flex gap-2 items-center">
                      <input
                        type="date"
                        value={uploadDate}
                        onChange={e => setUploadDate(e.target.value)}
                        className="bg-white/[0.02] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/20 font-medium max-w-[130px]"
                      />
                      
                      <button
                        onClick={handleUploadToIntervals}
                        disabled={isUploading}
                        className="flex-1 py-2 bg-white hover:bg-slate-200 disabled:opacity-30 text-slate-950 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="animate-spin" size={10} /> Syncing...
                          </>
                        ) : uploadSuccess ? (
                          <>
                            <Check size={10} /> Synced!
                          </>
                        ) : (
                          <>
                            Upload to Calendar
                          </>
                        )}
                      </button>
                    </div>

                    {uploadError && (
                      <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-400 font-medium leading-tight text-center">
                        {uploadError}
                      </div>
                    )}
                    {uploadSuccess && (
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-400 font-medium leading-tight text-center">
                        ✓ Successfully added to Intervals.icu!
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
