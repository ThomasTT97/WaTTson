import React from "react";

interface StepLabelProps {
  label: string;
  target_pct?: number;
  target_watts?: number;
  currentFtp?: number;
  originalFtp?: number;
}

const formatLabel = (str: string): string => {
  // Replace things like "10m", "10 m", "10 mins", "10 min", "10 minute", "10 minutes"
  // with "10 min" consistently.
  let cleaned = str.replace(/(\d+)\s*(?:minutes|minute|mins|min|m)\b/gi, "$1 min");
  
  // Remove "recovery" word case-insensitively, keeping the preceding content clean
  // and handle things like "5 min 150w recovery" -> "5 min 150w"
  cleaned = cleaned.replace(/\s*\brecovery\b/gi, "").trim();
  
  // Remove "Warmup:", "Cooldown:", "Intervals:" labels
  cleaned = cleaned.replace(/\b(warmup|cooldown|intervals):\s*/gi, "").trim();

  // Ensure we collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ");

  return cleaned;
};

export const scaleLabelWatts = (label: string, currentFtp?: number, originalFtp?: number): string => {
  if (!currentFtp || !originalFtp || currentFtp === originalFtp) return label;
  const ratio = currentFtp / originalFtp;
  // Matches digits followed optionally by spaces and w/W, ensuring it's a power unit
  return label.replace(/\b(\d+)\s*([wW])\b/g, (match, wattsStr, unit) => {
    const watts = parseInt(wattsStr, 10);
    if (isNaN(watts)) return match;
    const scaled = Math.round(watts * ratio);
    return `${scaled}${unit}`;
  });
};

export const StepLabel: React.FC<StepLabelProps> = ({ label, target_pct, target_watts, currentFtp, originalFtp }) => {
  // Determine effective original FTP if missing
  const effOriginalFtp = originalFtp || (target_pct && target_pct > 0 && target_watts ? Math.round(target_watts / target_pct) : 250);
  
  // Format the label first
  let formattedLabel = formatLabel(label);
  
  // Dynamically scale power values inside the label
  if (currentFtp && effOriginalFtp && currentFtp !== effOriginalFtp) {
    formattedLabel = scaleLabelWatts(formattedLabel, currentFtp, effOriginalFtp);
  }

  // Ensure target power is visible if we have it but it's not in the label
  let effectiveWatts = target_watts;
  if (!effectiveWatts && target_pct && currentFtp) {
    effectiveWatts = Math.round(target_pct * currentFtp);
  } else if (target_watts && currentFtp && effOriginalFtp && currentFtp !== effOriginalFtp) {
     effectiveWatts = Math.round(target_watts * (currentFtp / effOriginalFtp));
  }

  if (effectiveWatts && effectiveWatts > 0 && !/\d+\s*[wW]\b/.test(formattedLabel) && !formattedLabel.includes('+')) {
    formattedLabel = `${formattedLabel} @ ${effectiveWatts}w`;
  }

  // Matches "3 times: 10 min 304w + 5 min 180w", "3x: 10 min 304w + 5 min 180w", etc.
  // Regex explains: optional leading number, word "times" or "x", followed by colon, and then details
  const match = formattedLabel.match(/^(\d+)\s*(?:times|x)\s*:\s*(.+)$/i) || 
                formattedLabel.match(/^(\d+)\s*x\s+(.+)$/i);

  if (match) {
    const multiplier = match[1];
    const rest = match[2];
    
    // Split the rest by "+"
    const parts = rest.split(/\s*\+\s*/);

    return (
      <div className="flex flex-col gap-1 text-left py-0.5">
        <span className="text-emerald-400 font-extrabold text-[12px] uppercase tracking-wider block">
          {multiplier}x:
        </span>
        <div className="pl-3 border-l-2 border-emerald-500/20 ml-1 space-y-1">
          {parts.map((part, pIdx) => (
            <div key={pIdx} className="text-slate-200 font-semibold text-[13px] leading-snug">
              {part.trim()}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Also check if there's no times/x but has " + "
  if (formattedLabel.includes(" + ")) {
    const parts = formattedLabel.split(/\s*\+\s*/);
    return (
      <div className="flex flex-col gap-1 text-left py-0.5">
        <div className="pl-2 border-l border-white/10 space-y-1">
          {parts.map((part, pIdx) => (
            <div key={pIdx} className="text-slate-200 font-semibold text-[13px] leading-snug">
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
    
    if (aWatts > 0 && bWatts > 0 && Math.abs(aWatts - bWatts) > 2) return false;
    if (aPct > 0 && bPct > 0 && Math.abs(aPct - bPct) > 0.01) return false;
    
    // Check numbers in label
    const numsA = (a.label || '').match(/\d+/g) || [];
    const numsB = (b.label || '').match(/\d+/g) || [];
    if (numsA.join(',') !== numsB.join(',')) return false;
    
    // Check if one is recovery and the other is work
    const isRecA = /rec|rest|easy/i.test(a.label || '');
    const isRecB = /rec|rest|easy/i.test(b.label || '');
    if (isRecA !== isRecB) return false;
    
    return true;
  };

  while (i < n) {
    let bestL = 0;
    let bestK = 0; // number of full repetitions
    let bestP = 0; // number of steps in partial repetition at the end
    let bestScore = 0; // we want to maximize the number of steps grouped: (K * L) + P

    // We search for repeating patterns of length L (1 to 3) starting at i.
    for (let L = 1; L <= 3; L++) {
      if (i + L > n) continue;
      
      const pattern = steps.slice(i, i + L);
      
      // Count full consecutive matches of 'pattern'
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

      // Check for partial match at the end
      let P = 0;
      const remStart = i + K * L;
      while (remStart + P < n && P < L) {
        if (stepsMatch(steps[remStart + P], pattern[P])) {
          P++;
        } else {
          break;
        }
      }

      // Total steps spanned by this candidate group
      const totalSpanned = K * L + P;
      
      // A group is valid if:
      // - L = 1: K >= 2 (at least 2 identical consecutive steps)
      // - L > 1: K >= 2, or (K === 1 and P >= 1) which means we have at least 2 instances of the first element in the pattern.
      const isValidGroup = L === 1 ? (K >= 2) : (K >= 2 || (K === 1 && P >= 1));

      if (isValidGroup && totalSpanned > bestScore) {
        bestL = L;
        bestK = K;
        bestP = P;
        bestScore = totalSpanned;
      }
    }

    if (bestScore > 0) {
      // We found a group!
      const pattern = steps.slice(i, i + bestL);
      const multiplier = bestP > 0 ? bestK + 1 : bestK;
      
      grouped.push({
        isGroup: true,
        multiplier,
        steps: pattern
      });
      
      i += bestScore;
    } else {
      // Just a single step
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

interface GroupedWorkoutStepsListProps {
  steps: any[];
  currentFtp?: number;
  originalFtp?: number;
  fontSize?: 'sm' | 'base';
}

export const GroupedWorkoutStepsList: React.FC<GroupedWorkoutStepsListProps> = ({
  steps,
  currentFtp,
  originalFtp,
  fontSize = 'sm'
}) => {
  const grouped = groupWorkoutSteps(steps);
  const isSm = fontSize === 'sm';
  const textClass = isSm ? 'text-[13px]' : 'text-[14px]';

  return (
    <div className="space-y-4">
      {grouped.map((item, idx) => {
        if (item.isGroup && item.steps) {
          return (
            <div key={idx} className="flex flex-col gap-1.5">
              {/* Group Header */}
              <div className="flex items-center gap-2 mb-0.5">
                <span className="inline-block px-2 py-0.5 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider rounded shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                  {item.multiplier}X
                </span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                  Interval Set
                </span>
              </div>
              
              {/* Indented Group Items */}
              <div className="pl-3.5 border-l border-emerald-500/20 ml-1.5 space-y-3 py-1">
                {item.steps.map((step, sIdx) => {
                  return (
                    <div key={sIdx} className={`flex items-start justify-between gap-4 ${textClass} font-bold group/item`}>
                      <div className="flex items-start gap-2.5 text-slate-300 min-w-0 flex-1">
                        <div className="w-1 h-1 rounded-full bg-emerald-500/40 mt-1.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1 text-left">
                          <StepLabel 
                            label={step.label}
                            target_pct={step.target_pct}
                            target_watts={step.target_watts}
                            currentFtp={currentFtp}
                            originalFtp={originalFtp}
                          />
                        </div>
                      </div>
                      {step.target_watts && (
                        <span className="text-emerald-500/60 font-extrabold uppercase tracking-wider text-[8px] bg-emerald-500/5 px-1.5 py-0.5 rounded flex-shrink-0 italic group-hover/item:text-emerald-400 group-hover/item:bg-emerald-500/10 transition-colors hidden">
                          Interval
                        </span>
                      )}
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
          const absoluteIndex = item.originalIndex ?? steps.indexOf(step);

          return (
            <div key={idx} className={`flex items-start justify-between gap-4 ${textClass} font-bold group`}>
              <div className="flex items-start gap-2.5 text-slate-300 min-w-0 flex-1">
                <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] mt-1.5 flex-shrink-0" />
                <div className="min-w-0 flex-1 text-left">
                  <StepLabel 
                    label={step.label}
                    target_pct={step.target_pct}
                    target_watts={step.target_watts}
                    currentFtp={currentFtp}
                    originalFtp={originalFtp}
                  />
                </div>
              </div>
              {step.target_watts && (
                <span className="text-emerald-400 font-extrabold uppercase tracking-wider text-[9px] bg-emerald-500/10 px-2 py-0.5 rounded flex-shrink-0 italic hidden">
                  {getStepPhaseLabel(absoluteIndex, steps.length, step.label)}
                </span>
              )}
            </div>
          );
        }
      })}
    </div>
  );
};
