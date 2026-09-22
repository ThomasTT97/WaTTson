import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

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

  // Convert minutes to short "m"
  cleaned = cleaned.replace(/(\d+)\s*(?:minutes|minute|mins|min)\b/gi, '$1m');

  // Shorten wordy cycling jargon into clean, concise interval labels
  cleaned = cleaned.replace(/\baerobic\s+warmup(?:\s+with\s+openers)?\b/gi, 'Warm-up');
  cleaned = cleaned.replace(/\bwarmup\s+with\s+openers\b/gi, 'Warm-up');
  cleaned = cleaned.replace(/\bprogressive\s+warmup\b/gi, 'Warm-up');
  cleaned = cleaned.replace(/\baerobic\s+warmup\b/gi, 'Warm-up');
  cleaned = cleaned.replace(/\bwarmup\b/gi, 'Warm-up');
  cleaned = cleaned.replace(/\bwarm\s+up\b/gi, 'Warm-up');
  cleaned = cleaned.replace(/\bspinning\s+cooldown\b/gi, 'Cool-down');
  cleaned = cleaned.replace(/\bcooldown\s+spin\b/gi, 'Cool-down');
  cleaned = cleaned.replace(/\beasy\s+cooldown\b/gi, 'Cool-down');
  cleaned = cleaned.replace(/\bcooldown\b/gi, 'Cool-down');
  cleaned = cleaned.replace(/\bcool\s+down\b/gi, 'Cool-down');
  cleaned = cleaned.replace(/\bunder\s+(?:block|effort|threshold)\b/gi, 'Under');
  cleaned = cleaned.replace(/\bover\s+(?:surge|block|effort|threshold)\b/gi, 'Over');
  cleaned = cleaned.replace(/\b(?:rest|recovery|easy)\s+spin\b/gi, 'Recovery');
  cleaned = cleaned.replace(/\bactive\s+recovery\b/gi, 'Recovery');
  cleaned = cleaned.replace(/\bthreshold\s+(?:block|effort|rep)\b/gi, 'Threshold');
  cleaned = cleaned.replace(/\bvo2(?:max)?\s*(?:rep|block|effort)\b/gi, 'VO2 Max');
  cleaned = cleaned.replace(/\bsweet\s*spot\s*(?:block|effort|rep)\b/gi, 'Sweet Spot');
  cleaned = cleaned.replace(/\btempo\s+(?:block|effort|rep)\b/gi, 'Tempo');
  cleaned = cleaned.replace(/\bendurance\s+(?:spin|effort|ride|steady)\b/gi, 'Endurance');

  // Remove duplicate percentages and FTP patterns like "@ 88% FTP (88% FTP)", "(88% FTP) (88% FTP)", "@ 88% FTP @ 88% FTP"
  cleaned = cleaned.replace(/@?\s*(\d+%\s*FTP)\s*(\(\s*\1\s*\)|\1|@\s*\1)/gi, '($1)');
  cleaned = cleaned.replace(/\(\s*(\d+%\s*FTP)\s*\)\s*\(\s*\1\s*\)/gi, '($1)');
  cleaned = cleaned.replace(/(\(\d+%\s*FTP\))\s*\1+/gi, '$1');
  cleaned = cleaned.replace(/(\d+%\s*FTP)\s+\1+/gi, '$1');
  cleaned = cleaned.replace(/@\s*(\d+%\s*FTP)/gi, '($1)');
  cleaned = cleaned.replace(/\(\s*\(\s*(\d+%\s*FTP)\s*\)\s*\)/gi, '($1)');

  // Shorten (XX% FTP) to (XX%)
  cleaned = cleaned.replace(/\((\d+%)\s*FTP\)/gi, '($1)');

  // Remove duplicate @ Xw occurrences or @ followed by @
  cleaned = cleaned.replace(/(@\s*\d+\s*[wW])\s*@\s*\d+\s*[wW]/gi, '$1');
  cleaned = cleaned.replace(/@\s*@+/g, '@');

  // Remove duplicate percentage when next to each other
  cleaned = cleaned.replace(/\((\d+%)\)\s*\((\d+%)\)/gi, '($1)');

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

  // If label has percentage before watts, e.g. "3m Under (95%) @ 285W", rearrange cleanly to "3m Under @ 285W (95%)"
  formattedLabel = formattedLabel.replace(/\((\d+%)\)\s*@\s*(\d+[wW])/gi, '@ $2 ($1)');

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
  isCompoundGroup?: boolean;
  multiplier?: number;
  innerMultiplier?: number;
  steps?: any[];
  recoveryBetweenSets?: any;
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

    for (let L = 1; L <= 4; L++) {
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

  // Pass 2: Detect compound repeating sets
  // e.g. [Group G (3 rounds), Recovery R, Group G (3 rounds), Recovery R, Group G (3 rounds)]
  // => Compound Group (3 sets of 3 rounds w/ R recovery between sets)
  const isRecovery = (step: any) => {
    if (!step) return false;
    const clean = (step.label || '').toLowerCase();
    const pct = step.target_pct || 0;
    return /rec|rest|spin|easy|recover/i.test(clean) || (pct > 0 && pct <= 0.65);
  };

  const groupsMatch = (g1: GroupedStep, g2: GroupedStep) => {
    if (!g1.isGroup || !g2.isGroup) return false;
    if (g1.multiplier !== g2.multiplier) return false;
    if (!g1.steps || !g2.steps || g1.steps.length !== g2.steps.length) return false;
    for (let s = 0; s < g1.steps.length; s++) {
      if (!stepsMatch(g1.steps[s], g2.steps[s])) return false;
    }
    return true;
  };

  const finalGrouped: GroupedStep[] = [];
  let j = 0;
  while (j < grouped.length) {
    const item = grouped[j];
    
    // Check if item is a group and could be the start of a compound set
    if (item.isGroup && item.steps && j + 2 < grouped.length) {
      const candidateRest = grouped[j + 1];
      const nextGroup = grouped[j + 2];

      if (!candidateRest.isGroup && candidateRest.singleStep && isRecovery(candidateRest.singleStep) && groupsMatch(item, nextGroup)) {
        // We found at least 2 identical groups separated by recovery
        let setK = 2;
        let p = j + 2; // currently pointing at nextGroup
        const restStep = candidateRest.singleStep;

        while (p + 2 < grouped.length) {
          const subsequentRest = grouped[p + 1];
          const subsequentGroup = grouped[p + 2];
          if (!subsequentRest.isGroup && subsequentRest.singleStep && 
              stepsMatch(subsequentRest.singleStep, restStep) && 
              groupsMatch(item, subsequentGroup)) {
            setK++;
            p += 2;
          } else {
            break;
          }
        }

        finalGrouped.push({
          isGroup: true,
          isCompoundGroup: true,
          multiplier: setK,
          innerMultiplier: item.multiplier,
          steps: item.steps,
          recoveryBetweenSets: restStep
        });

        // Advance j past all spanned groups and separating rests
        j = p + 1;
        continue;
      }
    }

    finalGrouped.push(item);
    j++;
  }

  return finalGrouped;
};

export interface IntervalBulletItem {
  text: string;
  isRest?: boolean;
}

export interface IntervalBulletGroup {
  header?: string;
  bullets: IntervalBulletItem[];
}

export interface MinimalistPrescription {
  groups: IntervalBulletGroup[];
  intervalLines: string[];
  footnote: string;
}

export const getMinimalistPrescription = (
  steps: any[],
  currentFtp: number = 250,
  originalFtp?: number
): MinimalistPrescription => {
  if (!steps || steps.length === 0) {
    return {
      groups: [{ bullets: [{ text: 'Rest Day' }] }],
      intervalLines: ['Rest Day'],
      footnote: ''
    };
  }

  const effFtp = currentFtp || originalFtp || 250;

  const getWatts = (s: any): number => {
    if (s.target_watts && s.target_watts > 0) {
      if (originalFtp && currentFtp && originalFtp !== currentFtp) {
        return Math.round(s.target_watts * (currentFtp / originalFtp));
      }
      return Math.round(s.target_watts);
    }
    if (s.target_pct && s.target_pct > 0) {
      return Math.round(s.target_pct * effFtp);
    }
    return 0;
  };

  const isRecovery = (s: any): boolean => {
    if (!s) return false;
    const l = (s.label || '').toLowerCase();
    const pct = s.target_pct || (s.target_watts ? s.target_watts / effFtp : 0);
    return /rec|rest|spin|easy|recover/i.test(l) || (pct > 0 && pct <= 0.65);
  };

  // Detect Warm-up & Cool-down to keep the main intervals clean
  let warmupMins = 0;
  let cooldownMins = 0;

  let startIndex = 0;
  let endIndex = steps.length - 1;

  if (steps.length > 1) {
    const first = steps[0];
    const isWarmup = /warm|open/i.test(first.label || '') || ((first.target_pct || (first.target_watts ? first.target_watts / effFtp : 0)) <= 0.65 && !/interval|rep|set/i.test(first.label || ''));
    if (isWarmup) {
      warmupMins = first.duration || 0;
      startIndex = 1;
    }

    const last = steps[steps.length - 1];
    const isCooldown = /cool|spin|easy/i.test(last.label || '') || ((last.target_pct || (last.target_watts ? last.target_watts / effFtp : 0)) <= 0.60 && !/interval|rep|set/i.test(last.label || ''));
    if (isCooldown && endIndex >= startIndex) {
      cooldownMins = last.duration || 0;
      endIndex = steps.length - 2;
    }
  }

  const grouped = groupWorkoutSteps(steps);
  const groups: IntervalBulletGroup[] = [];
  const intervalLines: string[] = [];

  // 1. Check for compound groups (e.g. 3 sets x 3 rounds of 3m Under / 1m Over)
  const compoundGroups = grouped.filter(g => g.isGroup && g.isCompoundGroup && g.steps && g.steps.length > 0);
  if (compoundGroups.length > 0) {
    compoundGroups.forEach(cg => {
      const bullets: IntervalBulletItem[] = [];

      cg.steps!.forEach(s => {
        const dur = s.duration || 1;
        const w = getWatts(s);
        const l = (s.label || '').toLowerCase();
        const isOver = /over|surge/i.test(l);
        const isUnder = /under/i.test(l);
        const tag = isOver ? ' (Over)' : isUnder ? ' (Under)' : '';
        const wattStr = w > 0 ? ` @ ${w}W` : '';
        bullets.push({ text: `${dur}m${wattStr}${tag}` });
      });

      if (cg.recoveryBetweenSets && cg.recoveryBetweenSets.duration) {
        bullets.push({
          text: `${cg.recoveryBetweenSets.duration}m rest between sets`,
          isRest: true
        });
      }

      const headerText = `${cg.multiplier} sets × ${cg.innerMultiplier} rounds:`;
      groups.push({
        header: headerText,
        bullets
      });

      // Backward-compatible single line string
      const sub = bullets.filter(b => !b.isRest).map(b => b.text).join(' + ');
      intervalLines.push(`${cg.multiplier} sets × ${cg.innerMultiplier} × (${sub})`);
    });
  } else {
    // 2. Check for regular repeating groups (e.g. 3 x 15m @ 300W)
    const regularGroups = grouped.filter(g => g.isGroup && !g.isCompoundGroup && g.steps && g.steps.length > 0);
    if (regularGroups.length > 0) {
      regularGroups.forEach(rg => {
        const mult = rg.multiplier || 1;
        const bullets: IntervalBulletItem[] = [];

        if (rg.steps!.length === 2) {
          const [s1, s2] = rg.steps!;
          const isRec1 = isRecovery(s1);
          const isRec2 = isRecovery(s2);
          const workStep = isRec1 && !isRec2 ? s2 : s1;
          const recStep = isRec1 && !isRec2 ? s1 : (isRec2 ? s2 : null);

          const dur = workStep.duration || 1;
          const w = getWatts(workStep);
          const wattStr = w > 0 ? ` @ ${w}W` : '';
          const l = (workStep.label || '').toLowerCase();
          const tag = /over/i.test(l) ? ' (Over)' : /under/i.test(l) ? ' (Under)' : '';

          bullets.push({ text: `${mult} × ${dur}m${wattStr}${tag}` });
          if (recStep && recStep.duration) {
            bullets.push({
              text: `${recStep.duration}m rest between intervals`,
              isRest: true
            });
          }

          intervalLines.push(`${mult} × ${dur}m${wattStr}`);
        } else if (rg.steps!.length === 1) {
          const s = rg.steps![0];
          const dur = s.duration || 1;
          const w = getWatts(s);
          const wattStr = w > 0 ? ` @ ${w}W` : '';
          bullets.push({ text: `${mult} × ${dur}m${wattStr}` });
          intervalLines.push(`${mult} × ${dur}m${wattStr}`);
        } else {
          rg.steps!.forEach(s => {
            const dur = s.duration || 1;
            const w = getWatts(s);
            const isRec = isRecovery(s);
            const wattStr = w > 0 ? ` @ ${w}W` : '';
            bullets.push({
              text: `${mult} × ${dur}m${wattStr}`,
              isRest: isRec
            });
          });
          intervalLines.push(`${mult} × intervals`);
        }

        groups.push({ bullets });
      });
    }
  }

  // 3. If no interval groups were detected, look at single work steps (e.g. Steady Endurance, Tempo, single block)
  if (groups.length === 0) {
    const mainWorkSteps = steps.slice(startIndex, endIndex + 1);
    const bullets: IntervalBulletItem[] = [];

    if (mainWorkSteps.length === 1) {
      const s = mainWorkSteps[0];
      const dur = s.duration || 1;
      const w = getWatts(s);
      const text = w > 0 ? `${dur}m @ ${w}W` : `${dur}m`;
      bullets.push({ text });
      intervalLines.push(text);
    } else if (mainWorkSteps.length > 1) {
      const nonRecovery = mainWorkSteps.filter(s => !isRecovery(s));
      if (nonRecovery.length > 0) {
        nonRecovery.forEach(s => {
          const dur = s.duration || 1;
          const w = getWatts(s);
          const text = w > 0 ? `${dur}m @ ${w}W` : `${dur}m`;
          bullets.push({ text });
          intervalLines.push(text);
        });
      } else {
        const totalDur = mainWorkSteps.reduce((acc, s) => acc + (s.duration || 0), 0);
        bullets.push({ text: `${totalDur}m Recovery` });
        intervalLines.push(`${totalDur}m Recovery`);
      }
    } else {
      const totalDur = steps.reduce((acc, s) => acc + (s.duration || 0), 0);
      bullets.push({ text: `${totalDur}m Ride` });
      intervalLines.push(`${totalDur}m Ride`);
    }

    groups.push({ bullets });
  }

  // Assemble footnote (Warm-up & Cool-down)
  const footnoteParts: string[] = [];
  if (warmupMins > 0) footnoteParts.push(`${warmupMins}m warm-up`);
  if (cooldownMins > 0) footnoteParts.push(`${cooldownMins}m cool-down`);

  return {
    groups,
    intervalLines,
    footnote: footnoteParts.join(' • ')
  };
};

// Backward-compatible string summary helper
export const getWorkoutIntervalSummary = (steps: any[], currentFtp: number = 250): string => {
  const prescription = getMinimalistPrescription(steps, currentFtp);
  if (prescription.intervalLines.length > 0) {
    const main = prescription.intervalLines.join(' • ');
    return prescription.footnote ? `${main} (${prescription.footnote})` : main;
  }
  return '';
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
  const [showBreakdown, setShowBreakdown] = useState(false);
  const prescription = getMinimalistPrescription(steps, currentFtp, originalFtp);
  const grouped = groupWorkoutSteps(steps);

  return (
    <div className="space-y-2.5 text-left">
      {/* Minimalist Interval Prescription Bullets */}
      <div className="space-y-2">
        {prescription.groups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            {group.header && (
              <div className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                {group.header}
              </div>
            )}
            <div className="space-y-1">
              {group.bullets.map((b, bIdx) => (
                <div key={bIdx} className="flex items-center gap-2">
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      b.isRest
                        ? 'bg-slate-500'
                        : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                    }`}
                  />
                  <span
                    className={`text-[13px] sm:text-[14px] leading-snug tracking-tight ${
                      b.isRest
                        ? 'text-slate-400 font-medium text-[12px]'
                        : 'text-white font-bold'
                    }`}
                  >
                    {b.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {prescription.footnote && (
          <p className="text-[10.5px] text-slate-400/80 font-medium pt-0.5 leading-normal">
            {prescription.footnote}
          </p>
        )}
      </div>

      {/* Subtle collapsible detailed breakdown */}
      {steps && steps.length > 1 && (
        <div className="pt-1.5 border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer select-none py-0.5"
          >
            <span>{showBreakdown ? 'Hide full step breakdown' : 'Show full step breakdown'}</span>
            <ChevronDown 
              size={12} 
              className={`transform transition-transform duration-200 ${showBreakdown ? 'rotate-180 text-emerald-400' : ''}`} 
            />
          </button>

          {showBreakdown && (
            <div className="mt-2 pl-2.5 border-l border-white/10 space-y-1.5 py-1">
              {grouped.map((item, idx) => {
                if (item.isCompoundGroup && item.steps) {
                  return (
                    <div key={idx} className="py-1">
                      <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                        {item.multiplier}× Sets of {item.innerMultiplier}× Rounds:
                      </div>
                      <div className="pl-2 border-l border-emerald-500/20 space-y-1">
                        {item.steps.map((step, sIdx) => {
                          const intensity = getStepIntensity(step, currentFtp);
                          return (
                            <div key={sIdx} className="flex items-center gap-2 text-xs text-slate-300">
                              <div className={`w-1.5 h-1.5 rounded-full ${intensity.dot} shrink-0`} />
                              <StepLabel 
                                label={step.label}
                                target_pct={step.target_pct}
                                target_watts={step.target_watts}
                                currentFtp={currentFtp}
                                originalFtp={originalFtp}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                } else if (item.isGroup && item.steps) {
                  return (
                    <div key={idx} className="py-1">
                      <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                        {item.multiplier}× Rounds:
                      </div>
                      <div className="pl-2 border-l border-emerald-500/20 space-y-1">
                        {item.steps.map((step, sIdx) => {
                          const intensity = getStepIntensity(step, currentFtp);
                          return (
                            <div key={sIdx} className="flex items-center gap-2 text-xs text-slate-300">
                              <div className={`w-1.5 h-1.5 rounded-full ${intensity.dot} shrink-0`} />
                              <StepLabel 
                                label={step.label}
                                target_pct={step.target_pct}
                                target_watts={step.target_watts}
                                currentFtp={currentFtp}
                                originalFtp={originalFtp}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                } else {
                  const step = item.singleStep;
                  if (!step) return null;
                  const intensity = getStepIntensity(step, currentFtp);
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-300 py-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${intensity.dot} shrink-0`} />
                      <StepLabel 
                        label={step.label}
                        target_pct={step.target_pct}
                        target_watts={step.target_watts}
                        currentFtp={currentFtp}
                        originalFtp={originalFtp}
                      />
                    </div>
                  );
                }
              })}
            </div>
          )}
        </div>
      )}
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

export const calculateWorkoutAverageWatts = (
  steps: any[] | undefined,
  currentFtp: number = 250,
  originalFtp?: number,
  fallbackTarget?: { duration?: number; focus?: string; intensity?: string; tss?: number; load_target?: number }
): number | null => {
  const effFtp = currentFtp || 250;
  const baseFtp = originalFtp || effFtp;

  if (steps && steps.length > 0) {
    let totalWattDuration = 0;
    let totalDuration = 0;

    for (const step of steps) {
      const dur = step.duration || 0;
      if (dur <= 0) continue;

      let stepWatts = 0;
      if (typeof step.target_pct === 'number' && step.target_pct > 0) {
        stepWatts = step.target_pct * effFtp;
      } else if (typeof step.target_watts === 'number' && step.target_watts > 0) {
        stepWatts = step.target_watts * (effFtp / baseFtp);
      } else {
        const label = (step.label || '').toLowerCase();
        const wattsMatch = label.match(/(\d+)\s*w\b/);
        const pctMatch = label.match(/(\d+)%\s*(?:ftp)?/);

        if (wattsMatch) {
          stepWatts = parseInt(wattsMatch[1], 10) * (effFtp / baseFtp);
        } else if (pctMatch) {
          stepWatts = (parseInt(pctMatch[1], 10) / 100) * effFtp;
        } else if (label.includes('warm') || label.includes('cool') || label.includes('recovery') || label.includes('rest') || label.includes('spin')) {
          stepWatts = 0.50 * effFtp;
        } else if (label.includes('endurance') || label.includes('zone 2') || label.includes('z2')) {
          stepWatts = 0.67 * effFtp;
        } else if (label.includes('tempo')) {
          stepWatts = 0.82 * effFtp;
        } else if (label.includes('threshold') || label.includes('under') || label.includes('over')) {
          stepWatts = 0.98 * effFtp;
        } else if (label.includes('vo2')) {
          stepWatts = 1.15 * effFtp;
        } else {
          stepWatts = 0.65 * effFtp;
        }
      }

      totalWattDuration += dur * stepWatts;
      totalDuration += dur;
    }

    if (totalDuration > 0) {
      return Math.round(totalWattDuration / totalDuration);
    }
  }

  if (fallbackTarget) {
    const f = (fallbackTarget.focus || '').toLowerCase();
    const i = (fallbackTarget.intensity || '').toLowerCase();
    if (f.includes('rest') || i === 'rest') return null;

    const tss = fallbackTarget.tss || fallbackTarget.load_target;
    const durMins = fallbackTarget.duration;

    if (tss && tss > 0 && durMins && durMins > 0) {
      const hours = durMins / 60;
      const IF = Math.sqrt(tss / (hours * 100));
      const avgFactor = f.includes('endurance') || f.includes('recovery') ? 0.98 : 0.93;
      return Math.round(IF * effFtp * avgFactor);
    }

    if (f.includes('endurance') || f.includes('base') || f.includes('aerobic') || f.includes('zone 2') || f.includes('z2')) {
      return Math.round(effFtp * 0.67);
    }
    if (f.includes('recovery') || f.includes('recup') || f.includes('spin') || f.includes('flush')) {
      return Math.round(effFtp * 0.52);
    }
    if (f.includes('tempo')) {
      return Math.round(effFtp * 0.80);
    }
    if (f.includes('sweet spot') || f.includes('sst')) {
      return Math.round(effFtp * 0.88);
    }
    if (f.includes('threshold') || f.includes('ftp')) {
      return Math.round(effFtp * 0.95);
    }
    if (f.includes('vo2')) {
      return Math.round(effFtp * 0.90);
    }
    if (f.includes('anaerobic') || f.includes('sprint')) {
      return Math.round(effFtp * 0.82);
    }
    return Math.round(effFtp * 0.68);
  }

  return null;
};
