import React from "react";

interface StepLabelProps {
  label: string;
  target_pct?: number;
  target_watts?: number;
  currentFtp?: number;
  originalFtp?: number;
}

export const sanitizeStepLabel = (label: string): string => {
  if (!label) return '';
  let cleaned = label;
  
  // Remove repetition numbers like "Rep 1", "Rep #1", "#1", "Set 1", "Interval 1", "Lap 1"
  cleaned = cleaned.replace(/\b(?:rep|set|interval|lap)\s*#?\d+\b/gi, '');
  cleaned = cleaned.replace(/#\d+/g, '');

  // Remove duplicate percentages and FTP patterns like "@ 88% FTP (88% FTP)", "(88% FTP) (88% FTP)", "@ 88% FTP @ 88% FTP"
  cleaned = cleaned.replace(/@?\s*(\d+%\s*FTP)\s*(\(\s*\1\s*\)|\1|@\s*\1)/gi, '($1)');
  cleaned = cleaned.replace(/\(\s*(\d+%\s*FTP)\s*\)\s*\(\s*\1\s*\)/gi, '($1)');
  cleaned = cleaned.replace(/(\(\d+%\s*FTP\))\s*\1+/gi, '$1');
  cleaned = cleaned.replace(/(\d+%\s*FTP)\s+\1+/gi, '$1');
  cleaned = cleaned.replace(/@\s*(\d+%\s*FTP)/gi, '($1)');
  cleaned = cleaned.replace(/\(\s*\(\s*(\d+%\s*FTP)\s*\)\s*\)/gi, '($1)');

  // Remove duplicate @ Xw occurrences or @ followed by @
  cleaned = cleaned.replace(/(@\s*\d+\s*[wW])\s*@\s*\d+\s*[wW]/gi, '$1');
  cleaned = cleaned.replace(/@\s*@+/g, '@');

  // Remove duplicate percentage when next to each other e.g. "(88% FTP) (88% FTP)"
  cleaned = cleaned.replace(/\((\d+%\s*FTP)\)\s*\((\d+%\s*FTP)\)/gi, '($1)');

  // Standardize duration wording
  cleaned = cleaned.replace(/(\d+)\s*(?:minutes|minute|mins|min|m)\b/gi, '$1 min');

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
};

const formatLabel = (str: string): string => {
  let cleaned = sanitizeStepLabel(str);
  
  // Remove "recovery" word if duplicated, keeping preceding content clean
  cleaned = cleaned.replace(/\s*\brecovery\b/gi, "").trim();
  
  // Remove "Warmup:", "Cooldown:", "Intervals:" prefixes
  cleaned = cleaned.replace(/\b(warmup|cooldown|intervals):\s*/gi, "").trim();

  // Ensure we collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ");

  return cleaned;
};

export const scaleLabelWatts = (label: string, currentFtp?: number, originalFtp?: number): string => {
  if (!currentFtp || !originalFtp || currentFtp === originalFtp) return label;
  const ratio = currentFtp / originalFtp;
  return label.replace(/\b(\d+)\s*([wW])\b/g, (match, wattsStr, unit) => {
    const watts = parseInt(wattsStr, 10);
    if (isNaN(watts)) return match;
    const scaled = Math.round(watts * ratio);
    return `${scaled}${unit.toUpperCase()}`;
  });
};

export const StepLabel: React.FC<StepLabelProps> = ({ label, target_pct, target_watts, currentFtp, originalFtp }) => {
  const effOriginalFtp = originalFtp || (target_pct && target_pct > 0 && target_watts ? Math.round(target_watts / target_pct) : 250);
  
  let formattedLabel = formatLabel(label);
  
  if (currentFtp && effOriginalFtp && currentFtp !== effOriginalFtp) {
    formattedLabel = scaleLabelWatts(formattedLabel, currentFtp, effOriginalFtp);
  }

  let effectiveWatts = target_watts;
  if (!effectiveWatts && target_pct && currentFtp) {
    effectiveWatts = Math.round(target_pct * currentFtp);
  } else if (target_watts && currentFtp && effOriginalFtp && currentFtp !== effOriginalFtp) {
    effectiveWatts = Math.round(target_watts * (currentFtp / effOriginalFtp));
  }

  if (effectiveWatts && effectiveWatts > 0 && !/\b\d+\s*[wW]\b/.test(formattedLabel) && !formattedLabel.includes('+')) {
    formattedLabel = `${formattedLabel} @ ${effectiveWatts}W`;
  } else {
    // Normalize wattage casing to uppercase W
    formattedLabel = formattedLabel.replace(/\b(\d+)\s*w\b/g, '$1W');
  }

  // Handle explicit "3x: ..." or "3 times: ..." strings
  const match = formattedLabel.match(/^(\d+)\s*(?:times|x)\s*:\s*(.+)$/i) || 
                formattedLabel.match(/^(\d+)\s*x\s+(.+)$/i);

  if (match) {
    const multiplier = match[1];
    const rest = match[2];
    const parts = rest.split(/\s*\+\s*/);

    return (
      <div className="flex flex-col gap-1 text-left py-0.5">
        <span className="text-emerald-400 font-bold text-[10.5px] uppercase tracking-wider block">
          {multiplier}× REPEAT:
        </span>
        <div className="pl-3 border-l-2 border-emerald-500/30 ml-1 space-y-1">
          {parts.map((part, pIdx) => (
            <div key={pIdx} className="text-slate-200 font-medium text-[11.5px] leading-snug">
              {part.trim()}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (formattedLabel.includes(" + ")) {
    const parts = formattedLabel.split(/\s*\+\s*/);
    return (
      <div className="flex flex-col gap-1 text-left py-0.5">
        <div className="pl-2 border-l border-white/10 space-y-1">
          {parts.map((part, pIdx) => (
            <div key={pIdx} className="text-slate-200 font-medium text-[11.5px] leading-snug">
              {part.trim()}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <span className="break-words leading-tight">{formattedLabel}</span>;
};

export const getStepPhaseLabel = (sIdx: number, totalSteps: number, label: string): string => {
  return "";
};

export interface GroupedStep {
  isGroup: boolean;
  multiplier?: number;
  steps?: any[];
  singleStep?: any;
  originalIndex?: number;
}

export const groupWorkoutSteps = (steps: any[]): GroupedStep[] => {
  if (!steps || steps.length === 0) return [];

  const grouped: GroupedStep[] = [];
  const n = steps.length;
  let i = 0;

  const stepsMatch = (a: any, b: any) => {
    if (!a || !b) return false;
    
    // Must have same duration
    if (a.duration !== b.duration) return false;
    
    // Check power
    const aWatts = a.target_watts || 0;
    const bWatts = b.target_watts || 0;
    const aPct = a.target_pct || 0;
    const bPct = b.target_pct || 0;
    
    if (aWatts > 0 && bWatts > 0 && Math.abs(aWatts - bWatts) > 3) return false;
    if (aPct > 0 && bPct > 0 && Math.abs(aPct - bPct) > 0.02) return false;
    
    // Clean label comparison
    const cleanA = sanitizeStepLabel(a.label || '');
    const cleanB = sanitizeStepLabel(b.label || '');
    if (cleanA !== cleanB) {
      // Check if one is recovery and the other is work
      const isRecA = /rec|rest|easy|active/i.test(cleanA);
      const isRecB = /rec|rest|easy|active/i.test(cleanB);
      if (isRecA !== isRecB) return false;
    }
    
    return true;
  };

  while (i < n) {
    let bestL = 0;
    let bestK = 0;
    let bestP = 0;
    let bestScore = 0;

    for (let L = 1; L <= 3; L++) {
      if (i + L > n) continue;
      
      const pattern = steps.slice(i, i + L);
      
      let K = 1;
      while (i + (K + 1) * L <= n) {
        let match = true;
        for (let j = 0; j < L; j++) {
          if (!stepsMatch(steps[i + K * L + j], pattern[j])) {
            match = false;
            break;
          }
        }
        if (match) {
          K++;
        } else {
          break;
        }
      }

      let P = 0;
      const remStart = i + K * L;
      while (remStart + P < n && P < L) {
        if (stepsMatch(steps[remStart + P], pattern[P])) {
          P++;
        } else {
          break;
        }
      }

      const totalSpanned = K * L + P;
      const isValidGroup = L === 1 ? (K >= 2) : (K >= 2 || (K === 1 && P >= 1));

      if (isValidGroup && totalSpanned > bestScore) {
        bestL = L;
        bestK = K;
        bestP = P;
        bestScore = totalSpanned;
      }
    }

    if (bestScore > 0) {
      const pattern = steps.slice(i, i + bestL);
      const multiplier = bestP > 0 ? bestK + 1 : bestK;
      
      grouped.push({
        isGroup: true,
        multiplier,
        steps: pattern
      });
      
      i += bestScore;
    } else {
      grouped.push({
        isGroup: false,
        singleStep: steps[i],
        originalIndex: i
      });
      i++;
    }
  }

  return grouped;
};

// Helper to determine intensity color dot/class based on step power
const getStepIntensity = (step: any, currentFtp: number = 250) => {
  const targetPct = step.target_pct || (step.target_watts ? step.target_watts / currentFtp : 0.65);
  if (targetPct >= 1.20) {
    return {
      dot: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]',
      border: 'border-rose-500/30',
      badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      label: 'Anaerobic'
    };
  } else if (targetPct >= 1.05) {
    return {
      dot: 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)]',
      border: 'border-orange-500/30',
      badgeBg: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      label: 'VO2Max'
    };
  } else if (targetPct >= 0.88) {
    return {
      dot: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]',
      border: 'border-amber-400/30',
      badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      label: 'Threshold/SweetSpot'
    };
  } else if (targetPct >= 0.75) {
    return {
      dot: 'bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]',
      border: 'border-blue-400/30',
      badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      label: 'Tempo'
    };
  } else if (targetPct >= 0.55) {
    return {
      dot: 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.5)]',
      border: 'border-sky-400/30',
      badgeBg: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      label: 'Endurance'
    };
  } else {
    return {
      dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]',
      border: 'border-emerald-400/30',
      badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      label: 'Easy/Rec'
    };
  }
};

interface GroupedWorkoutStepsListProps {
  steps: any[];
  currentFtp?: number;
  originalFtp?: number;
  fontSize?: 'sm' | 'base';
}

export const GroupedWorkoutStepsList: React.FC<GroupedWorkoutStepsListProps> = ({
  steps,
  currentFtp = 250,
  originalFtp,
  fontSize = 'sm'
}) => {
  const grouped = groupWorkoutSteps(steps);

  return (
    <div className="space-y-2.5 text-left">
      {grouped.map((item, idx) => {
        if (item.isGroup && item.steps) {
          return (
            <div key={idx} className="flex flex-col gap-1.5 my-1">
              {/* Group Header Badge (e.g. 2X or 3X) */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[10px] font-black uppercase tracking-wider rounded-md">
                  {item.multiplier}×
                </span>
                <span className="text-[10px] font-bold text-emerald-400/90 uppercase tracking-wider">
                  Interval Set ({item.multiplier} Rounds)
                </span>
              </div>
              
              {/* Indented Group Container */}
              <div className="pl-3 border-l-2 border-emerald-500/30 ml-2 space-y-1.5 py-0.5">
                {item.steps.map((step, sIdx) => {
                  const intensity = getStepIntensity(step, currentFtp);
                  return (
                    <div key={sIdx} className="flex items-center justify-between gap-2.5 text-xs py-0.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${intensity.dot} shrink-0`} />
                        <div className="min-w-0 flex-1 text-left text-slate-200 text-[11.5px]">
                          <StepLabel 
                            label={step.label}
                            target_pct={step.target_pct}
                            target_watts={step.target_watts}
                            currentFtp={currentFtp}
                            originalFtp={originalFtp}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        } else {
          // Single Step
          const step = item.singleStep;
          if (!step) return null;
          const intensity = getStepIntensity(step, currentFtp);

          return (
            <div key={idx} className="flex items-center justify-between gap-2.5 text-xs py-0.5">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className={`w-1.5 h-1.5 rounded-full ${intensity.dot} shrink-0`} />
                <div className="min-w-0 flex-1 text-left text-slate-200 text-[11.5px]">
                  <StepLabel 
                    label={step.label}
                    target_pct={step.target_pct}
                    target_watts={step.target_watts}
                    currentFtp={currentFtp}
                    originalFtp={originalFtp}
                  />
                </div>
              </div>
            </div>
          );
        }
      })}
    </div>
  );
};

export const isEnduranceWorkout = (workout: any): boolean => {
  if (!workout) return false;
  const title = (workout.title || workout.focus || workout.summary || '').toLowerCase();
  const category = (workout.category || '').toLowerCase();
  const intensity = (workout.intensity || '').toLowerCase();
  
  const contrib = (workout.goal_contribution || '').toLowerCase();
  const steps = workout.workout_steps || workout.steps || [];
  const hasHighIntensity = steps.some((s: any) => {
    if (s.target_pct && s.target_pct > 0.85) return true;
    const l = (s.label || '').toLowerCase();
    return l.includes('vo2') || l.includes('threshold') || l.includes('sprint') || l.includes('anaerobic');
  });

  return (
    title.includes('endurance') || 
    title.includes('steady') || 
    category.includes('endurance') ||
    category.includes('easy') ||
    intensity === 'easy' ||
    (steps.length > 0 && !hasHighIntensity && (contrib.includes('endurance') || title.includes('recovery')))
  );
};

interface VisualProfileChartProps {
  steps: any[];
  currentFtp?: number;
  originalFtp?: number;
}

export const VisualProfileChart: React.FC<VisualProfileChartProps> = ({ steps, currentFtp, originalFtp }) => {
  if (!steps || steps.length === 0) return null;
  const effFtp = currentFtp || 250;
  const baseFtp = originalFtp || 250;
  const totalWorkoutDur = steps.reduce((sum, s) => sum + (s.duration || 0), 0) || 1;

  return (
    <div className="space-y-1.5 text-left w-full">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest block">
          Visual Profile
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[8.5px] font-medium text-slate-500 uppercase tracking-wider">
            {totalWorkoutDur}m
          </span>
          {currentFtp && (
            <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">
              FTP: {currentFtp}W
            </span>
          )}
        </div>
      </div>
      <div className="w-full bg-[#06080e] border border-white/[0.06] rounded-xl p-2.5 flex items-end h-14 gap-[2px] relative overflow-hidden">
        {/* Subtle FTP 100% threshold reference line */}
        <div 
          className="absolute left-2.5 right-2.5 border-b border-dashed border-white/10 pointer-events-none z-10"
          style={{ bottom: `${Math.max(12, Math.min(100, ((1.0 - 0.40) / (1.35 - 0.40)) * 85 + 15))}%` }}
        />

        {steps.map((step, idx) => {
          const widthPct = (step.duration / totalWorkoutDur) * 100;
          const minPct = 0.40;
          const maxPct = 1.35;
          const targetPct = step.target_pct || (step.target_watts ? step.target_watts / baseFtp : 0.65);
          const watts = Math.round(targetPct * effFtp);
          const heightPct = Math.max(14, Math.min(100, ((targetPct - minPct) / (maxPct - minPct)) * 85 + 15));
          
          let colorClass = 'bg-slate-600';
          if (targetPct < 0.55) {
            colorClass = 'bg-emerald-500/60';
          } else if (targetPct < 0.75) {
            colorClass = 'bg-sky-500/70';
          } else if (targetPct < 0.88) {
            colorClass = 'bg-blue-500/80';
          } else if (targetPct < 1.05) {
            colorClass = 'bg-amber-400';
          } else if (targetPct < 1.20) {
            colorClass = 'bg-orange-500';
          } else {
            colorClass = 'bg-rose-500';
          }
          
          return (
            <div 
              key={idx} 
              style={{ width: `${widthPct}%`, height: `${heightPct}%` }}
              className={`rounded-[1.5px] transition-all relative group/bar ${colorClass} hover:brightness-125`}
              title={`${step.label || 'Step'} (${step.duration}m @ ${watts}W • ${Math.round(targetPct * 100)}% FTP)`}
            />
          );
        })}
      </div>
    </div>
  );
};
