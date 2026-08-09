import React, { useState, useMemo } from 'react';
import { Search, Clock, Zap, BookOpen, Calendar, Check, Loader2, ArrowRight, ChevronDown, ChevronRight, ChevronLeft, BarChart2, Plus, Sparkles } from 'lucide-react';
import { LibraryWorkout, WORKOUT_LIBRARY } from '../services/workoutLibrary';
import { IntervalsCredentials } from '../types';
import { uploadWorkout } from '../services/intervalsService';
import { createCustomWorkoutRequest } from '../services/geminiService';
import { isEnduranceWorkout } from './StepLabel';

interface WorkoutLibraryProps {
  ftp: number;
  creds: IntervalsCredentials;
  onApplyAsSuggestion: (workout: LibraryWorkout) => void;
  onClose: () => void;
  userGoal?: string;
}

export const WorkoutLibrary: React.FC<WorkoutLibraryProps> = ({
  ftp = 250,
  creds,
  onApplyAsSuggestion,
  onClose,
  userGoal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Custom Workout Request State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

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
  const [showDetailedSteps, setShowDetailedSteps] = useState(false);
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

  // Group repeated steps inside the selected workout to avoid long repetitive lists
  const groupedSteps = useMemo(() => {
    if (!selectedWorkout) return [];
    
    const steps = selectedWorkout.workout_steps;
    const result: {
      id: string;
      type: 'single' | 'repeated';
      reps?: number;
      steps?: { label: string; duration: number; target_pct: number }[];
      step?: { label: string; duration: number; target_pct: number };
    }[] = [];
    
    let i = 0;
    const n = steps.length;

    const stepsMatch = (s1: any, s2: any) => {
      return s1.duration === s2.duration && 
             Math.round(s1.target_pct * 100) === Math.round(s2.target_pct * 100);
    };

    const cleanLabel = (label: string) => {
      return label.replace(/\s+\d+\/\d+/g, '').replace(/\s+\d+$/g, '').trim();
    };

    while (i < n) {
      let foundPattern = false;
      // Check pattern lengths from 3 down to 1 (e.g. work/recovery pairs)
      for (let L = 3; L >= 1; L--) {
        if (i + L * 2 <= n) {
          const candidate = steps.slice(i, i + L);
          
          let reps = 1;
          while (i + (reps + 1) * L <= n) {
            const nextSegment = steps.slice(i + reps * L, i + (reps + 1) * L);
            let match = true;
            for (let j = 0; j < L; j++) {
              if (!stepsMatch(candidate[j], nextSegment[j])) {
                match = false;
                break;
              }
            }
            if (match) {
              reps++;
            } else {
              break;
            }
          }

          const minReps = L === 1 ? 3 : 2;
          if (reps >= minReps) {
            result.push({
              id: `group-${i}-${L}-${reps}`,
              type: 'repeated',
              reps,
              steps: candidate.map(s => ({
                label: cleanLabel(s.label),
                duration: s.duration,
                target_pct: s.target_pct
              }))
            });
            i += reps * L;
            foundPattern = true;
            break;
          }
        }
      }

      if (!foundPattern) {
        result.push({
          id: `single-${i}`,
          type: 'single',
          step: steps[i]
        });
        i++;
      }
    }

    return result;
  }, [selectedWorkout]);

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
      onClose(); // Go back to settings main menu
    }, 1200);
  };

  const handleGenerateCustomWorkout = async () => {
    if (!customPrompt.trim()) return;
    setIsGeneratingCustom(true);
    setCustomError(null);
    try {
      const customWorkout = await createCustomWorkoutRequest(customPrompt, ftp, userGoal);
      // Select newly generated custom workout directly
      setSelectedWorkout(customWorkout);
      setShowCreateModal(false);
      setCustomPrompt('');
      setShowDetailedSteps(true);
      setActionTab('today');
    } catch (err: any) {
      setCustomError(err.message || 'Failed to create workout. Please try again.');
    } finally {
      setIsGeneratingCustom(false);
    }
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

  // Helper to get overall workout duration
  const totalWorkoutDur = selectedWorkout 
    ? selectedWorkout.workout_steps.reduce((sum, s) => sum + s.duration, 0)
    : 0;

  // View 1: Workout List Catalog
  if (!selectedWorkout) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Request Custom Workout Banner/Card */}
        <div className="bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Sparkles size={18} className="animate-pulse" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-white uppercase tracking-wider italic truncate">Request Custom Workout</h4>
                <p className="text-[10px] text-slate-400 font-medium truncate">Ask waTTson to create a specific workout session for you</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(!showCreateModal)}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus size={13} /> {showCreateModal ? 'Close' : 'Request'}
            </button>
          </div>

          {showCreateModal && (
            <div className="pt-2 border-t border-white/10 space-y-3 animate-in slide-in-from-top-2 duration-200">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Describe your desired workout (e.g. '4x8m Over-Unders at 105%/95% FTP', '3x15m Sweet Spot with 3m rest', or 'Pyramid 1-2-3-4-3-2-1m VO2max')..."
                rows={2.5}
                className="w-full bg-[#0a0d14] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/40 font-medium resize-none shadow-inner"
              />

              {/* Quick suggestion chips */}
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Quick Examples:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '4x8m Over-Unders (105%/95% FTP)',
                    '3x15m Sweet Spot (90% FTP)',
                    '4x4m Norwegian VO2Max',
                    'Pyramid 1-2-3-4-3-2-1m Intervals'
                  ].map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => setCustomPrompt(idea)}
                      className="text-[9.5px] font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/5 transition-all text-left"
                    >
                      + {idea}
                    </button>
                  ))}
                </div>
              </div>

              {customError && (
                <p className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">
                  {customError}
                </p>
              )}

              <button
                onClick={handleGenerateCustomWorkout}
                disabled={isGeneratingCustom || !customPrompt.trim()}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
              >
                {isGeneratingCustom ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-slate-950" />
                    <span>waTTson is generating your workout...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    <span>Generate & Open Workout</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Expandable Categories List */}
        <div className="space-y-2.5">
          {categories.map(category => {
            const list = groupedWorkouts[category] || [];
            const isExpanded = !!expandedCategories[category];
            const hasWorkouts = list.length > 0;

            // Hide empty categories during search
            if (searchTerm && !hasWorkouts) return null;

            return (
              <div 
                key={category} 
                className={`rounded-2xl border transition-all overflow-hidden ${
                  isExpanded 
                    ? 'bg-slate-950/40 border-white/10 shadow-lg' 
                    : 'bg-slate-950/20 border-white/5 hover:border-white/10'
                }`}
              >
                {/* Category Bar */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-4.5 py-3.5 flex items-center justify-between transition-colors focus:outline-none"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${getCategoryColor(category)}`}>
                      {category}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                      ({list.length})
                    </span>
                  </div>
                  <div className="text-slate-500 hover:text-white transition-colors">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                {/* Workout Titles Under Expanded Category */}
                {isExpanded && (
                  <div className="border-t border-white/5 bg-slate-950/10 divide-y divide-white/5 animate-in slide-in-from-top-1 duration-200">
                    {hasWorkouts ? (
                      list.map(workout => (
                        <button
                          key={workout.id}
                          onClick={() => {
                            setSelectedWorkout(workout);
                            setShowDetailedSteps(false);
                            setActionTab('today');
                          }}
                          className="w-full px-5 py-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-between gap-4"
                        >
                          <span className="text-xs text-white font-extrabold tracking-tight uppercase hover:text-blue-400">
                            {workout.title}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded-md">
                              {workout.duration_minutes}m
                            </span>
                            <span className="text-[9px] text-amber-500 font-black italic">
                              {workout.tss} TSS
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-5 py-3 text-center text-[10px] text-slate-600 font-semibold uppercase tracking-widest">
                        No matches in this category
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // View 2: Detailed Workout Screen (Page)
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Detail Back Button */}
      <button 
        onClick={() => {
          setSelectedWorkout(null);
          setUploadError(null);
        }}
        className="flex items-center gap-1.5 text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-wider bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/5 transition-all active:scale-95 self-start"
      >
        <ChevronLeft size={14} />
        Back to Catalog
      </button>

      <div className="glass-card rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden p-5 space-y-5">
        {/* Title & Category Badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className={`px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border inline-block ${getCategoryColor(selectedWorkout.category)}`}>
              {selectedWorkout.category}
            </span>
            <h3 className="text-base font-black text-white uppercase tracking-tight italic leading-snug">
              {selectedWorkout.title}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
          {selectedWorkout.description}
        </p>

        {/* Workout Key Stats */}
        <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-4 border border-white/5">
          <div className="flex flex-col items-center justify-center text-center border-r border-white/5">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-wider mb-0.5">Duration</span>
            <div className="flex items-center gap-1.5 text-sm font-black text-white uppercase">
              <Clock size={13} className="text-blue-400 shrink-0" /> {selectedWorkout.duration_minutes} Mins
            </div>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-wider mb-0.5">Stress Load</span>
            <div className="flex items-center gap-1.5 text-sm font-black text-amber-400 italic uppercase">
              <Zap size={13} fill="currentColor" className="shrink-0" /> {selectedWorkout.tss} TSS
            </div>
          </div>
        </div>

        {/* VISUAL WORKOUT PROFILE (Highly intuitive bar chart) */}
        <div className="space-y-1.5">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Visual Profile</span>
          <div className="w-full bg-slate-950/80 border border-white/5 rounded-xl p-3 flex items-end h-20 gap-[2px]">
            {selectedWorkout.workout_steps.map((step, idx) => {
              const widthPct = (step.duration / totalWorkoutDur) * 100;
              // Scale target_pct from 0.40 (height 15%) to 1.35 (height 100%)
              const minPct = 0.40;
              const maxPct = 1.35;
              const heightPct = Math.max(12, Math.min(100, ((step.target_pct - minPct) / (maxPct - minPct)) * 85 + 15));
              
              // Color based on target_pct
              let colorClass = 'bg-slate-700';
              if (step.target_pct < 0.55) {
                colorClass = 'bg-emerald-500/60';
              } else if (step.target_pct < 0.75) {
                colorClass = 'bg-blue-500/70';
              } else if (step.target_pct < 0.90) {
                colorClass = 'bg-amber-500/80';
              } else if (step.target_pct < 1.05) {
                colorClass = 'bg-orange-500';
              } else {
                colorClass = 'bg-rose-500';
              }
              
              return (
                <div 
                  key={idx} 
                  style={{ width: `${widthPct}%`, height: `${heightPct}%` }}
                  className={`rounded-[1.5px] transition-all relative group/bar ${colorClass}`}
                  title={`${step.label} (${step.duration}m @ ${Math.round(step.target_pct * 100)}%)`}
                />
              );
            })}
          </div>
        </div>

        {/* Collapsible Steps List */}
        {!isEnduranceWorkout(selectedWorkout) && (
          <div className="border-t border-white/5 pt-4">
            <button 
              onClick={() => setShowDetailedSteps(!showDetailedSteps)}
              className="w-full flex items-center justify-between text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest"
            >
              <span>{showDetailedSteps ? 'Hide detailed steps' : 'Show detailed steps'}</span>
              <ChevronDown size={12} className={`transition-transform duration-200 ${showDetailedSteps ? 'rotate-180' : ''}`} />
            </button>

            {showDetailedSteps && (
              <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1 animate-in slide-in-from-top-1 duration-150">
                {groupedSteps.map((group) => {
                  if (group.type === 'repeated' && group.steps) {
                    return (
                      <div key={group.id} className="border border-blue-500/10 bg-blue-500/5 rounded-2xl p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 px-1">
                          <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest font-mono bg-blue-500/10 px-2 py-0.5 rounded-md">
                            {group.reps}x Repeat Block
                          </span>
                        </div>
                        <div className="pl-3.5 border-l border-white/10 space-y-1.5">
                          {group.steps.map((subStep, subIdx) => {
                            const watts = Math.round(subStep.target_pct * ftp);
                            return (
                              <div key={subIdx} className="flex items-center justify-between px-3 py-1.5 bg-slate-900/40 rounded-xl text-[10px]">
                                <span className="text-slate-200 font-semibold truncate pr-2">{subStep.label}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[8.5px] text-slate-500 font-mono">
                                    {subStep.duration < 1 ? `${Math.round(subStep.duration * 60)}s` : `${subStep.duration}m`}
                                  </span>
                                  <span className="text-blue-400 font-extrabold font-mono">{watts}W</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  } else if (group.type === 'single' && group.step) {
                    const watts = Math.round(group.step.target_pct * ftp);
                    return (
                      <div key={group.id} className="flex items-center justify-between px-3.5 py-2 bg-slate-900/60 rounded-xl border border-white/5 text-[10.5px]">
                        <span className="text-white font-semibold truncate pr-2">{group.step.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] text-slate-500 font-mono">
                            {group.step.duration < 1 ? `${Math.round(group.step.duration * 60)}s` : `${group.step.duration}m`}
                          </span>
                          <span className="text-emerald-400 font-extrabold font-mono">{watts}W</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Unified Action Tabs */}
        <div className="border-t border-white/5 pt-4 space-y-4">
          <div className="flex p-0.5 rounded-xl bg-slate-950/60 border border-white/5">
            <button
              onClick={() => setActionTab('today')}
              className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                actionTab === 'today'
                  ? 'bg-blue-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Apply To Today
            </button>
            <button
              onClick={() => setActionTab('schedule')}
              className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                actionTab === 'schedule'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
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
                className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-xl shadow-blue-500/10"
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
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={uploadDate}
                  onChange={e => setUploadDate(e.target.value)}
                  className="bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-emerald-500/30 font-semibold max-w-[130px]"
                />
                
                <button
                  onClick={handleUploadToIntervals}
                  disabled={isUploading}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-slate-950 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-lg shadow-emerald-500/10"
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
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[9px] text-rose-400 font-semibold leading-tight text-center">
                  {uploadError}
                </div>
              )}
              {uploadSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-400 font-semibold leading-tight text-center">
                  ✓ Successfully added to Intervals.icu!
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
