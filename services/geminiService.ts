export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

export enum ThinkingLevel {
  THINKING_LEVEL_UNSPECIFIED = "THINKING_LEVEL_UNSPECIFIED",
  LOW = "LOW",
  HIGH = "HIGH",
  MINIMAL = "MINIMAL",
}

export interface GenerateContentResponse {
  text?: string;
  [key: string]: any;
}

import { 
  Activity, 
  ActivityInterval, 
  CoachingFeedback, 
  DailySuggestion, 
  PlannedWorkout, 
  ChatMessage, 
  WeeklyBriefing, 
  Wellness,
  AnnualPowerCurve,
  TrainingMode,
  TrainingMethodology,
  ThreeMonthReview,
  formatDuration
} from "../types";
import {
  getRideFeedbackPrompt,
  getDailySuggestionPrompt,
  getWeeklyBriefingPrompt,
  getChatMessagePrompt,
  getUserProfilePrompt,
  getThreeMonthReviewPrompt
} from "./promptTemplates";
import { detectIntervalsFromLaps } from "./intervalsService";
import { matchWorkoutToLibrary } from "./workoutLibrary";
import { generateDataDrivenRestRationale } from "./restRationaleService";
import {
  parsePlanDirectives,
  pruneExpiredDirectives,
  formatDirectivesForPrompt,
  serializePlanDirectives,
  parseScheduleDurationsFromDirective
} from "./directiveService";


/**
 * Utility to safely parse JSON from model responses, handling potential markdown blocks.
 */
const safeParseJSON = (text: string | undefined): any => {
  if (!text) throw new Error("Empty response from AI.");
  const cleanText = text.replace(/```json\n?|```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
      } catch {
        const firstBracket = cleanText.indexOf('[');
        const lastBracket = cleanText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
          try {
            return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
          } catch {}
        }
      }
    }
    throw new Error("Invalid JSON format from AI.");
  }
};

/**
 * Caching utilities to optimize performance and reduce AI costs.
 */
const getCache = (key: string): any | null => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
};

const setCache = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
};

/**
 * Post-processes generated workout steps to automatically decompose any excessively
 * long high-intensity blocks (VO2max, Threshold, Sweet Spot) into realistic intervals.
 */
export const sanitizeWorkoutSteps = (steps: any[] | undefined, ftp?: number): any[] | undefined => {
  if (!steps || !Array.isArray(steps) || steps.length === 0) return steps;

  const effectiveFtp = ftp || 250;
  const sanitized: any[] = [];

  const updateLabelDuration = (label: string, newMin: number): string => {
    // Replace something like "15 min" or "15min" or "15 m" or "15m" at the start of the label with `${newMin} min`
    const replaced = label.replace(/^(\d+)\s*(?:minutes|minute|mins|min|m)\b/i, `${newMin} min`);
    if (replaced !== label) return replaced;
    // Fallback: if not at the start, replace anywhere
    return label.replace(/\b(\d+)\s*(?:minutes|minute|mins|min|m)\b/gi, `${newMin} min`);
  };

  for (const step of steps) {
    const duration = step.duration;
    const label = step.label || '';
    const labelLower = label.toLowerCase();

    // Determine target percent of FTP for this step
    let targetPct = step.target_pct;
    if (targetPct === undefined || targetPct === null) {
      if (step.target_watts) {
        targetPct = step.target_watts / effectiveFtp;
      } else {
        // Estimate based on label
        if (labelLower.includes('vo2') || labelLower.includes('aerobic capacity')) {
          targetPct = 1.20;
        } else if (labelLower.includes('threshold') || labelLower.includes('lthr')) {
          targetPct = 0.98;
        } else if (labelLower.includes('sweet spot') || labelLower.includes('sweetspot') || labelLower.includes('sst')) {
          targetPct = 0.88;
        } else if (labelLower.includes('tempo')) {
          targetPct = 0.82;
        } else if (labelLower.includes('endurance') || labelLower.includes('zone 2') || labelLower.includes('z2')) {
          targetPct = 0.68;
        } else {
          targetPct = 0.55;
        }
      }
    }

    // Clean up hallucinated interval patterns from labels, e.g., "4x4m" or "4x4"
    const cleanedLabel = label.replace(/\d+x\d+m?/, '').trim();
    const stepWithCleanLabel = { ...step, label: cleanedLabel };

    // Identify the zone of this step and check if it violates maximum continuous limits
    const isVo2Max = targetPct >= 1.05 || labelLower.includes('vo2') || labelLower.includes('aerobic capacity') || labelLower.includes('anaerobic');
    const isThreshold = !isVo2Max && (targetPct >= 0.90 || labelLower.includes('threshold') || labelLower.includes('lthr'));
    const isSweetSpotOrTempo = !isVo2Max && !isThreshold && (targetPct >= 0.75 || labelLower.includes('sweet spot') || labelLower.includes('sweetspot') || labelLower.includes('sst') || labelLower.includes('tempo'));

    if (isVo2Max && duration > 6) {
      // Decompose long VO2 Max efforts (typically anything > 6 minutes continuous)
      const reps = Math.max(2, Math.round(duration / 3.5));
      const repDuration = Math.round(duration / reps);
      const recoveryDuration = Math.max(2, Math.min(3, repDuration));
      
      const workLabel = updateLabelDuration(cleanedLabel, repDuration);
      const recoveryLabel = `${recoveryDuration} min Recovery ${Math.round(0.55 * effectiveFtp)}w`;
      
      for (let r = 0; r < reps; r++) {
        const newStep = {
          ...stepWithCleanLabel,
          duration: repDuration,
          label: workLabel
        };
        sanitized.push(newStep);
        if (r < reps - 1) {
          const recStep: any = {
            duration: recoveryDuration,
            label: recoveryLabel
          };
          if (step.target_watts !== undefined) recStep.target_watts = Math.round(0.55 * effectiveFtp);
          if (step.target_pct !== undefined) recStep.target_pct = 0.55;
          sanitized.push(recStep);
        }
      }
    } else if (isThreshold && duration > 20) {
      // ... Threshold logic ...
      const reps = Math.max(2, Math.round(duration / 10));
      const repDuration = Math.round(duration / reps);
      const recoveryDuration = Math.max(3, Math.round(repDuration / 3));

      const workLabel = updateLabelDuration(cleanedLabel, repDuration);
      const recoveryLabel = `${recoveryDuration} min Recovery ${Math.round(0.55 * effectiveFtp)}w`;

      for (let r = 0; r < reps; r++) {
        const newStep = {
          ...stepWithCleanLabel,
          duration: repDuration,
          label: workLabel
        };
        sanitized.push(newStep);
        if (r < reps - 1) {
          const recStep: any = {
            duration: recoveryDuration,
            label: recoveryLabel
          };
          if (step.target_watts !== undefined) recStep.target_watts = Math.round(0.55 * effectiveFtp);
          if (step.target_pct !== undefined) recStep.target_pct = 0.55;
          sanitized.push(recStep);
        }
      }
    } else if (isSweetSpotOrTempo && duration > 30) {
      // ... Sweet Spot logic ...
      const reps = Math.max(2, Math.round(duration / 15));
      const repDuration = Math.round(duration / reps);
      const recoveryDuration = Math.max(3, Math.round(repDuration / 4));

      const workLabel = updateLabelDuration(cleanedLabel, repDuration);
      const recoveryLabel = `${recoveryDuration} min Recovery ${Math.round(0.55 * effectiveFtp)}w`;

      for (let r = 0; r < reps; r++) {
        const newStep = {
          ...stepWithCleanLabel,
          duration: repDuration,
          label: workLabel
        };
        sanitized.push(newStep);
        if (r < reps - 1) {
          const recStep: any = {
            duration: recoveryDuration,
            label: recoveryLabel
          };
          if (step.target_watts !== undefined) recStep.target_watts = Math.round(0.55 * effectiveFtp);
          if (step.target_pct !== undefined) recStep.target_pct = 0.55;
          sanitized.push(recStep);
        }
      }
    } else {
      sanitized.push(stepWithCleanLabel);
    }
  }

  return sanitized;
};

/**
 * General helper to call Gemini with an optimized, ultra-fast model chain.
 * Places gemini-3.1-flash-lite first to avoid high-demand 503 bottlenecks on flash models,
 * with minimal thinking overhead and proper telemetry User-Agent headers.
 */
const callGemini = async (params: any, options?: { preferFlashLite?: boolean; thinkingLevel?: ThinkingLevel }): Promise<GenerateContentResponse> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-wattson-client': 'app',
    'x-wattson-app-id': 'c1b22b2d-9717-465e-bcf5-f44e5221095e'
  };

  try {
    const { auth } = await import('./firebase');
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch {}

  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ params, options })
  });

  if (!response.ok) {
    let errorMsg = `Server error (${response.status})`;
    try {
      const errorJson = await response.json();
      errorMsg = errorJson.error || errorJson.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return {
    text: data.text
  };
};

/**
 * Helper to check if the athlete has power data on most of their rides and extract HR metrics.
 */
export const checkHasPowerOnMostRides = (activities: Activity[] | undefined): { 
  hasPowerOnMostRides: boolean;
  hrStatsText: string;
} => {
  if (!activities || activities.length === 0) {
    return { hasPowerOnMostRides: true, hrStatsText: "" };
  }
  const rides = activities.filter(a => a.type === 'Ride' || !a.type);
  const ridesCount = rides.length;
  if (ridesCount === 0) {
    return { hasPowerOnMostRides: true, hrStatsText: "" };
  }

  const ridesWithPower = rides.filter(a => a.has_power || (a.average_watts && a.average_watts > 0));
  const ridesWithPowerCount = ridesWithPower.length;
  const hasPowerOnMostRides = (ridesWithPowerCount / ridesCount) >= 0.5;

  const hrValues = rides.map(a => a.average_heartrate || 0).filter(hr => hr > 40);
  const maxHrValues = rides.map(a => a.max_heartrate || 0).filter(hr => hr > 40);

  const avgHr = hrValues.length > 0 
    ? Math.round(hrValues.reduce((sum, h) => sum + h, 0) / hrValues.length) 
    : null;

  const maxHr = maxHrValues.length > 0 
    ? Math.max(...maxHrValues) 
    : (hrValues.length > 0 ? Math.round(Math.max(...hrValues) * 1.1) : null);

  const lthr = maxHr ? Math.round(maxHr * 0.88) : (avgHr ? Math.round(avgHr * 1.15) : null);

  let hrStatsText = "";
  if (!hasPowerOnMostRides && (avgHr || maxHr)) {
    hrStatsText = `Athlete available HR statistics: ${avgHr ? `Average HR is ${avgHr} bpm. ` : ""}${maxHr ? `Max HR is ${maxHr} bpm. ` : ""}${lthr ? `Estimated Lactate Threshold HR (LTHR) is ${lthr} bpm. ` : ""}Use these numbers to target precise, realistic bpm ranges for each zone.`;
  }

  return { hasPowerOnMostRides, hrStatsText };
};

/**
 * Analyzes a specific cycling activity and provides coaching feedback.
 */
export const getRideFeedback = async (
  activity: Activity, 
  intervals: ActivityInterval[],
  plannedWorkout: PlannedWorkout | null,
  userGoal?: string,
  ftp?: number,
  allActivities?: Activity[]
): Promise<CoachingFeedback> => {
  const plannedWorkoutCtx = plannedWorkout 
    ? `Planned Workout: "${plannedWorkout.name}". Description: "${plannedWorkout.description}".`
    : "No planned workout for this ride.";

  let effectiveIntervals: any[] = [];
  if (intervals && intervals.length > 0) {
    effectiveIntervals = intervals;
  } else if (Array.isArray((activity as any).icu_intervals) && (activity as any).icu_intervals.length > 0) {
    effectiveIntervals = (activity as any).icu_intervals;
  } else if (Array.isArray((activity as any).laps) && (activity as any).laps.length > 0) {
    effectiveIntervals = (activity as any).laps;
  } else if (Array.isArray((activity as any).icu_laps) && (activity as any).icu_laps.length > 0) {
    effectiveIntervals = (activity as any).icu_laps;
  } else if (Array.isArray((activity as any).icu_intervals_edited) && (activity as any).icu_intervals_edited.length > 0) {
    effectiveIntervals = (activity as any).icu_intervals_edited;
  } else if (Array.isArray((activity as any).intervals) && (activity as any).intervals.length > 0) {
    effectiveIntervals = (activity as any).intervals;
  }

  // Version 9 cache key includes intervals length so newly fetched laps instantly trigger fresh AI analysis
  const cacheKey = `wattson_feedback_v9_${activity.id}_${effectiveIntervals.length}_${userGoal || 'default'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let lapsCtx = "No specific device laps recorded. Please analyze the overall session metrics (duration, power, NP, intensity, max power spikes) to deduce if there were structured efforts, power surges, or steady state riding.";

  const detectedRideType = detectIntervalsFromLaps(activity, effectiveIntervals) || undefined;

  // Detect power spikes and surge dynamics
  const maxWatts = activity.max_watts || 0;
  const avgWatts = activity.average_watts || activity.icu_average_watts || 0;
  let npWatts = activity.weighted_average_watts || activity.icu_weighted_avg_watts || activity.icu_weighted_average_watts || 0;
  if (npWatts === 0 && avgWatts > 0 && activity.icu_variability_index && activity.icu_variability_index > 1.01) {
    npWatts = Math.round(avgWatts * activity.icu_variability_index);
  }
  let powerSpikesInfo = "";
  if (maxWatts > 0) {
    const spikeRatio = avgWatts > 0 ? (maxWatts / avgWatts).toFixed(1) : "N/A";
    powerSpikesInfo = `Peak Power Spike: ${Math.round(maxWatts)}W (Peak/Avg Ratio: ${spikeRatio}x). NP: ${Math.round(npWatts || avgWatts)}W, Avg: ${Math.round(avgWatts)}W.`;
  }

  if (effectiveIntervals && effectiveIntervals.length > 0) {
    const formatLapTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.round(secs % 60);
      return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
    };

    const formattedLaps = effectiveIntervals
      .map(l => {
        const dur = (typeof l.moving_time === 'number' && l.moving_time > 0)
          ? l.moving_time
          : ((typeof l.duration === 'number' && l.duration > 0)
            ? l.duration
            : ((typeof l.elapsed_time === 'number' && l.elapsed_time > 0)
              ? l.elapsed_time
              : (l.end_index && l.start_index ? l.end_index - l.start_index : 0)));
        const watts = typeof l.average_watts === 'number' && l.average_watts > 0
          ? l.average_watts
          : (typeof l.avg_watts === 'number' ? l.avg_watts : (l.watts || 0));
        const maxW = typeof l.max_watts === 'number' && l.max_watts > 0
          ? l.max_watts
          : (typeof l.max_power === 'number' ? l.max_power : undefined);
        const hr = typeof l.average_heartrate === 'number' && l.average_heartrate > 0
          ? l.average_heartrate
          : (l.avg_hr || l.avg_heartrate || 0);
        const maxH = typeof l.max_heartrate === 'number' && l.max_heartrate > 0
          ? l.max_heartrate
          : (l.max_hr || undefined);
        const cad = typeof l.average_cadence === 'number' && l.average_cadence > 0
          ? l.average_cadence
          : (l.cadence || undefined);
        return { ...l, dur, watts, maxW, hr, maxH, cad };
      })
      .filter(l => l.dur >= 5) // include short sprint efforts down to 5s
      .map((l, i) => {
        const zoneStr = l.zone ? `Zone ${l.zone}` : '';
        const pwrStr = l.watts > 0 ? `Avg Power: ${Math.round(l.watts)}W${l.maxW ? ` (Max: ${Math.round(l.maxW)}W)` : ''}` : 'Power: N/A';
        const hrStr = l.hr > 0 ? `Avg HR: ${Math.round(l.hr)}bpm${l.maxH ? ` (Max HR: ${Math.round(l.maxH)}bpm)` : ''}` : '';
        const cadStr = l.cad ? `Cadence: ${Math.round(l.cad)}rpm` : '';
        const metrics = [zoneStr, pwrStr, hrStr, cadStr].filter(Boolean).join(', ');
        return `Lap ${i+1}${l.label ? ` "${l.label}"` : ''} [${l.type || 'LAP'}]: Duration ${formatLapTime(l.dur)}, ${metrics}`;
      })
      .join('\n');
    
    if (formattedLaps.length > 0) {
      lapsCtx = `ACTUAL RECORDED LAPS & INTERVALS FROM THIS RIDE:\n${formattedLaps}${powerSpikesInfo ? `\n\n${powerSpikesInfo}` : ''}${detectedRideType ? `\n\nRECOGNIZED STRUCTURED SET: ${detectedRideType}` : ''}`;
    }
  } else if (powerSpikesInfo) {
    lapsCtx = `${lapsCtx}\n${powerSpikesInfo}`;
  }

  const prompt = getRideFeedbackPrompt({
    activityName: activity.name || '',
    tss: activity.icu_training_load || activity.icu_tss || activity.training_load || 0,
    intensity: activity.icu_intensity || 0,
    eftp: activity.icu_eftp || 'N/A',
    durationMins: Math.round((activity.moving_time || activity.elapsed_time || 0) / 60),
    avgPower: Math.round(activity.average_watts || activity.icu_average_watts || 0),
    npPower: Math.round(npWatts || avgWatts),
    avgHr: Math.round(activity.average_heartrate || 0),
    userGoal: userGoal || 'Fitness',
    plannedWorkoutCtx,
    lapsCtx,
    ftp,
    hasPowerOnMostRides: true,
    hrStatsText: "",
    detectedRideType
  });

  const response = await callGemini({
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          goal_contribution: { type: Type.STRING },
          one_thing_to_improve: { type: Type.STRING },
          workout_steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                duration: { type: Type.NUMBER },
                target_watts: { type: Type.NUMBER },
                label: { type: Type.STRING }
              },
              required: ['duration', 'target_watts', 'label']
            }
          }
        },
        required: ['summary', 'goal_contribution', 'one_thing_to_improve']
      }
    }
  });
  const result = safeParseJSON(response.text);
  if (result && result.workout_steps) {
    result.workout_steps = sanitizeWorkoutSteps(result.workout_steps, ftp || 250);
  }
  setCache(cacheKey, result);
  return result;
};

/**
 * Generates a daily workout suggestion based on recent history.
 */
export const getDailySuggestion = async (
  recentActivities: Activity[], 
  userGoal?: string, 
  forTomorrow: boolean = false, 
  ftp?: number,
  methodology?: TrainingMethodology,
  trainingMode: TrainingMode = 'cycling'
): Promise<DailySuggestion> => {
  const targetDate = new Date();
  if (forTomorrow) targetDate.setDate(targetDate.getDate() + 1);
  
  const targetStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  const cacheKey = `wattson_suggestion_${targetStr}_${userGoal || 'default'}_${methodology || 'polarized'}_${trainingMode}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const actsByDate = new Map<string, Activity[]>();
  recentActivities.forEach(a => {
    if (a.start_date_local) {
      const dStr = a.start_date_local.split('T')[0];
      if (dStr) {
        if (!actsByDate.has(dStr)) actsByDate.set(dStr, []);
        actsByDate.get(dStr)!.push(a);
      }
    }
  });

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
  const yesterdayActs = actsByDate.get(yesterdayStr) || [];
  const yesterdayWasRest = yesterdayActs.length === 0;
  const yesterdayRestContext = yesterdayWasRest
    ? `Yesterday (${yesterdayStr}) was a dedicated REST DAY with 0 TSS. The athlete has already had recovery and is physically refreshed.`
    : `Yesterday (${yesterdayStr}) had activity: ${yesterdayActs.map(a => `"${a.name}" (${Math.round(a.icu_training_load || a.icu_tss || 0)} TSS)`).join(', ')}.`;

  const dailyHistoryLines: string[] = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayActs = actsByDate.get(dStr);
    const label = i === 1 ? `Yesterday (${dStr})` : dStr;
    if (dayActs && dayActs.length > 0) {
      dailyHistoryLines.push(`${label}: ${dayActs.map(a => `${a.icu_training_load || a.icu_tss || 0} TSS (${a.type}), efTP: ${a.icu_eftp || 'N/A'}W`).join(' + ')}`);
    } else {
      dailyHistoryLines.push(`${label}: REST DAY (0 TSS)`);
    }
  }
  const history = dailyHistoryLines.join(', ');

  const prompt = getDailySuggestionPrompt({
    targetStr,
    history,
    userGoal: userGoal || '',
    ftp,
    hasPowerOnMostRides: true,
    hrStatsText: "",
    methodology,
    yesterdayRestContext,
    trainingMode
  });

  const response = await callGemini({
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          readiness_score: { type: Type.NUMBER },
          readiness_analysis: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          primary: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              intensity: { type: Type.STRING },
              duration_minutes: { type: Type.NUMBER },
              type: { type: Type.STRING },
              tss: { type: Type.NUMBER },
              workout_steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    duration: { type: Type.NUMBER },
                    target_watts: { type: Type.NUMBER },
                    label: { type: Type.STRING }
                  },
                  required: ['duration', 'target_watts', 'label']
                }
              }
            },
            required: ['title', 'description', 'intensity', 'duration_minutes', 'type', 'tss']
          },
          alternative: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              intensity: { type: Type.STRING },
              duration_minutes: { type: Type.NUMBER },
              type: { type: Type.STRING },
              tss: { type: Type.NUMBER },
              workout_steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    duration: { type: Type.NUMBER },
                    target_watts: { type: Type.NUMBER },
                    label: { type: Type.STRING }
                  },
                  required: ['duration', 'target_watts', 'label']
                }
              }
            },
            required: ['title', 'description', 'intensity', 'duration_minutes', 'type', 'tss']
          }
        },
        required: ['readiness_score', 'readiness_analysis', 'reasoning', 'primary', 'alternative']
      }
    }
  });
  const parsed = safeParseJSON(response.text);
  const result = { ...parsed, date: targetStr };
  if (result) {
    if (result.primary && result.primary.intensity !== 'Rest') {
      const matched = matchWorkoutToLibrary(result.primary.title || result.primary.description || '', result.primary.duration_minutes || 45, result.primary.intensity || 'Medium');
      if (matched) {
        const matchedDuration = matched.duration_minutes || 60;
        const targetDuration = result.primary.duration_minutes || matchedDuration;

        // Intelligent scaling: Preserve Work, scale Filler
        const isWorkStep = (s: any) => {
          const pct = s.target_pct || 0;
          if (pct > 0.75) return true;
          const label = (s.label || '').toLowerCase();
          return /interval|rep|set|threshold|vo2|sweet|tempo|under|over/i.test(label) && !/recovery|rest|spin|easy/i.test(label);
        };

        const fillerSteps = matched.workout_steps.filter(s => !isWorkStep(s));
        const fillerDuration = fillerSteps.reduce((sum, s) => sum + (s.duration || 0), 0);
        const diff = targetDuration - matchedDuration;

        let scaledSteps;
        if (fillerDuration > 0 && (diff > 0 || fillerDuration > Math.abs(diff))) {
          const fillerScale = (fillerDuration + diff) / fillerDuration;
          scaledSteps = matched.workout_steps.map(step => {
            if (isWorkStep(step)) return { ...step };
            return { ...step, duration: Math.max(1, Math.round(step.duration * fillerScale)) };
          });
        } else {
          const scale = targetDuration / matchedDuration;
          scaledSteps = matched.workout_steps.map(step => ({
            ...step,
            duration: Math.max(1, Math.round(step.duration * scale))
          }));
        }

        result.primary = {
          title: matched.title,
          description: matched.description,
          intensity: matched.intensity,
          duration_minutes: targetDuration,
          type: matched.category.toLowerCase().includes('interval') || matched.workout_steps.length > 3 ? 'intervals' : 'endurance',
          tss: matched.tss ? Math.round(matched.tss * (targetDuration / matchedDuration)) : result.primary.tss,
          workout_steps: scaledSteps.map(step => ({
            duration: step.duration,
            target_watts: Math.round(step.target_pct * (ftp || 250)),
            label: `${step.duration}m ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
          }))
        };
      } else if (result.primary.workout_steps) {
        result.primary.workout_steps = sanitizeWorkoutSteps(result.primary.workout_steps, ftp || 250);
        result.primary.duration_minutes = result.primary.workout_steps ? result.primary.workout_steps.reduce((sum: number, s: any) => sum + s.duration, 0) : result.primary.duration_minutes;
      }
    }

    if (result.alternative && result.alternative.intensity !== 'Rest') {
      const matched = matchWorkoutToLibrary(result.alternative.title || result.alternative.description || '', result.alternative.duration_minutes || 45, result.alternative.intensity || 'Medium');
      if (matched) {
        const matchedDuration = matched.duration_minutes || 60;
        const targetDuration = result.alternative.duration_minutes || matchedDuration;

        // Intelligent scaling: Preserve Work, scale Filler
        const isWorkStep = (s: any) => {
          const pct = s.target_pct || 0;
          if (pct > 0.75) return true;
          const label = (s.label || '').toLowerCase();
          return /interval|rep|set|threshold|vo2|sweet|tempo|under|over/i.test(label) && !/recovery|rest|spin|easy/i.test(label);
        };

        const fillerSteps = matched.workout_steps.filter(s => !isWorkStep(s));
        const fillerDuration = fillerSteps.reduce((sum, s) => sum + (s.duration || 0), 0);
        const diff = targetDuration - matchedDuration;

        let scaledSteps;
        if (fillerDuration > 0 && (diff > 0 || fillerDuration > Math.abs(diff))) {
          const fillerScale = (fillerDuration + diff) / fillerDuration;
          scaledSteps = matched.workout_steps.map(step => {
            if (isWorkStep(step)) return { ...step };
            return { ...step, duration: Math.max(1, Math.round(step.duration * fillerScale)) };
          });
        } else {
          const scale = targetDuration / matchedDuration;
          scaledSteps = matched.workout_steps.map(step => ({
            ...step,
            duration: Math.max(1, Math.round(step.duration * scale))
          }));
        }

        result.alternative = {
          title: matched.title,
          description: matched.description,
          intensity: matched.intensity,
          duration_minutes: targetDuration,
          type: matched.category.toLowerCase().includes('interval') || matched.workout_steps.length > 3 ? 'intervals' : 'endurance',
          tss: matched.tss ? Math.round(matched.tss * (targetDuration / matchedDuration)) : result.alternative.tss,
          workout_steps: scaledSteps.map(step => ({
            duration: step.duration,
            target_watts: Math.round(step.target_pct * (ftp || 250)),
            label: `${step.duration}m ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
          }))
        };
      } else if (result.alternative.workout_steps) {
        result.alternative.workout_steps = sanitizeWorkoutSteps(result.alternative.workout_steps, ftp || 250);
        result.alternative.duration_minutes = result.alternative.workout_steps ? result.alternative.workout_steps.reduce((sum: number, s: any) => sum + s.duration, 0) : result.alternative.duration_minutes;
      }
    }
  }
  setCache(cacheKey, result);
  return result;
};

export const normalizeBriefingDays = (briefing: WeeklyBriefing, planContext?: string, trainingMode: TrainingMode = 'cycling'): WeeklyBriefing => {
  if (!briefing || !briefing.days) return briefing;

  let ftp = briefing.ftp;
  if (!ftp && typeof window !== 'undefined') {
    ftp = Number(localStorage.getItem('wattson_ftp')) || 250;
  }
  if (!ftp) ftp = 250;

  // Check for active weekly schedule directive in planContext
  const scheduleMap = planContext ? parseScheduleDurationsFromDirective(planContext) : null;

  // Helper to extract weekday short name e.g. "mon" from "Mon (Sep 21)" or "MON"
  const extractWeekdayToken = (dayStr: string): string | null => {
    const match = (dayStr || '').match(/\b(mon|tue|wed|thu|fri|sat|sun)\b/i);
    return match ? match[1].toLowerCase() : null;
  };

  // Pass 1: Normalize durations, units, and weekday vs weekend duration caps
  let normalizedDays = briefing.days.map((day, idx) => {
    const token = extractWeekdayToken(day.day);
    const customRule = (token && scheduleMap) ? scheduleMap[token] : null;

    let isRest = day.intensity === 'Rest' || (day.focus || '').toLowerCase().includes('rest') || (day.focus || '').toLowerCase().includes('off');
    const isCommute = (day.day || '').toLowerCase().includes('commute') || (day.focus || '').toLowerCase().includes('commute');
    const isWeekend = /sat|sun/i.test(day.day || '');
    
    let targetDuration = day.duration_target;
    if (typeof targetDuration === 'number' && targetDuration > 0 && targetDuration <= 6) {
      targetDuration = Math.round(targetDuration * 60);
    }

    if (customRule) {
      if (customRule.isRest) {
        const rationale = generateDataDrivenRestRationale({
          dayName: day.day,
          dayIndex: idx,
          allDays: briefing.days
        });
        return {
          ...day,
          focus: 'Rest Day',
          intensity: 'Rest' as const,
          duration_target: 0,
          load_target: 0,
          why: rationale.summaryQuote,
          workout_steps: []
        };
      } else {
        targetDuration = customRule.durationMins;
        isRest = false;
      }
    } else {
      if (!targetDuration || targetDuration <= 0) {
        targetDuration = isRest ? 0 : 60;
      }

      // Weekday rides shouldn't default to marathon 4h (240m) or 3h (180m) sessions unless weekend
      if (!isRest && !isWeekend && targetDuration > 120) {
        // Normal weekday session should be 60-90m
        targetDuration = 75;
      }
    }

    let currentDay = {
      ...day,
      duration_target: targetDuration,
      intensity: isRest ? ('Rest' as const) : (day.intensity === 'Rest' ? ('Easy' as const) : day.intensity || ('Medium' as const))
    };

    if (!isRest && !isCommute) {
      const matched = matchWorkoutToLibrary(currentDay.focus || '', targetDuration, currentDay.intensity || 'Medium');
      if (matched) {
        const matchedDuration = matched.duration_minutes || 60;
        
        // Intelligent scaling: Adjust Easy steps, preserve Work steps
        const isWorkStep = (s: any) => {
          const pct = s.target_pct || 0;
          if (pct > 0.75) return true;
          const label = (s.label || '').toLowerCase();
          return /interval|rep|set|threshold|vo2|sweet|tempo|under|over/i.test(label) && !/recovery|rest|spin|easy/i.test(label);
        };

        const fillerSteps = matched.workout_steps.filter(s => !isWorkStep(s));
        const fillerDuration = fillerSteps.reduce((sum, s) => sum + (s.duration || 0), 0);
        const diff = targetDuration - matchedDuration;

        let scaledSteps;
        if (fillerDuration > 0 && (diff > 0 || fillerDuration > Math.abs(diff))) {
          const fillerScale = (fillerDuration + diff) / fillerDuration;
          scaledSteps = matched.workout_steps.map(step => {
            if (isWorkStep(step)) return { ...step };
            return { ...step, duration: Math.max(1, Math.round(step.duration * fillerScale)) };
          });
        } else {
          // Fallback to simple scaling if no filler or reduction too large
          const scale = targetDuration / matchedDuration;
          scaledSteps = matched.workout_steps.map(step => ({
            ...step,
            duration: Math.max(1, Math.round(step.duration * scale))
          }));
        }

        // Final label and watts mapping
        const finalSteps = scaledSteps.map(step => ({
          duration: step.duration,
          target_watts: Math.round(step.target_pct * ftp),
          target_pct: step.target_pct,
          label: `${step.duration}m ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
        }));

        // Ensure sum matches targetDuration
        const totalStepDur = finalSteps.reduce((sum, s) => sum + s.duration, 0);
        if (totalStepDur !== targetDuration && finalSteps.length > 0) {
          const lastFillerIdx = [...finalSteps].reverse().findIndex(s => (s.target_pct || 0) <= 0.75);
          const idx = lastFillerIdx !== -1 ? finalSteps.length - 1 - lastFillerIdx : finalSteps.length - 1;
          finalSteps[idx].duration += (targetDuration - totalStepDur);
          finalSteps[idx].label = finalSteps[idx].label.replace(/^\d+m/, `${finalSteps[idx].duration}m`);
        }

        return {
          ...currentDay,
          focus: matched.title,
          workout_steps: finalSteps,
          duration_target: targetDuration,
          load_target: matched.tss ? Math.round(matched.tss * (targetDuration / matchedDuration)) : currentDay.load_target,
          why: `${matched.category} focus: ${matched.description}`
        };
      }
    }
    
    if (currentDay.workout_steps && currentDay.workout_steps.length > 0) {
      const sanitizedSteps = sanitizeWorkoutSteps(currentDay.workout_steps, ftp);
      const computedDuration = sanitizedSteps ? sanitizedSteps.reduce((sum, s) => sum + s.duration, 0) : currentDay.duration_target;
      return {
        ...currentDay,
        workout_steps: sanitizedSteps,
        duration_target: computedDuration || currentDay.duration_target
      };
    }

    return currentDay;
  });

  // Pass 2: Guard against consecutive long sessions (unless explicitly scheduled by user)
  for (let i = 0; i < normalizedDays.length - 1; i++) {
    const current = normalizedDays[i];
    const next = normalizedDays[i + 1];
    if (!current || !next) continue;

    const nextToken = extractWeekdayToken(next.day);
    const hasCustomForNext = (nextToken && scheduleMap && scheduleMap[nextToken]);
    if (hasCustomForNext) {
      continue;
    }

    const isCurrentRest = current.intensity === 'Rest' || (current.focus || '').toLowerCase().includes('rest');
    const isNextRest = next.intensity === 'Rest' || (next.focus || '').toLowerCase().includes('rest');
    if (isCurrentRest || isNextRest) continue;

    const isCurrentLong = (current.duration_target || 0) >= 120;
    const isNextLong = (next.duration_target || 0) >= 120;

    if (isCurrentLong && isNextLong) {
      // Scale down the second day (or non-weekend day) to a balanced 60-75 min session
      const targetMins = 60;
      const matched = matchWorkoutToLibrary(next.focus || 'Zone 2 Endurance', targetMins, next.intensity || 'Easy') 
        || matchWorkoutToLibrary('Aerobic Foundation', targetMins, 'Easy');
      
      if (matched) {
        normalizedDays[i + 1] = {
          ...next,
          focus: matched.title,
          duration_target: matched.duration_minutes,
          load_target: matched.tss || 45,
          workout_steps: matched.workout_steps.map(step => ({
            duration: step.duration,
            target_watts: Math.round(step.target_pct * ftp),
            target_pct: step.target_pct,
            label: `${formatDuration(step.duration)} ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
          })),
          why: next.why || 'Balanced aerobic training without overtraining fatigue'
        };
      } else {
        normalizedDays[i + 1] = {
          ...next,
          duration_target: targetMins,
          load_target: Math.round((next.load_target || 60) * (targetMins / (next.duration_target || 120)))
        };
      }
    }
  }

  // Group days by day string (e.g., "Mon (Jul 27)")
  const labelGroups: Record<string, number[]> = {};
  normalizedDays.forEach((d, idx) => {
    const key = d.day || `day-${idx}`;
    if (!labelGroups[key]) labelGroups[key] = [];
    labelGroups[key].push(idx);
  });

  Object.values(labelGroups).forEach(indices => {
    // Find sessions in this group that represent commutes
    const commuteIndices = indices.filter(i => {
      const focus = (normalizedDays[i].focus || '').toLowerCase();
      const why = (normalizedDays[i].why || '').toLowerCase();
      return focus.includes('commute') || why.includes('commute');
    });

    if (commuteIndices.length >= 2) {
      // First commute of the day -> Commute AM
      const idx1 = commuteIndices[0];
      let f1 = normalizedDays[idx1].focus || 'Commute AM';
      if (!f1.toLowerCase().includes('commute am')) {
        if (f1.toLowerCase().includes('commute pm')) {
          f1 = f1.replace(/commute pm/i, 'Commute AM');
        } else if (f1.toLowerCase().includes('commute')) {
          f1 = f1.replace(/commute/i, 'Commute AM');
        } else {
          f1 = 'Commute AM';
        }
      }
      normalizedDays[idx1].focus = f1;

      // Second commute of the day -> Commute PM
      const idx2 = commuteIndices[1];
      let f2 = normalizedDays[idx2].focus || 'Commute PM';
      if (!f2.toLowerCase().includes('commute pm')) {
        if (f2.toLowerCase().includes('commute am')) {
          f2 = f2.replace(/commute am/i, 'Commute PM');
        } else if (f2.toLowerCase().includes('commute')) {
          f2 = f2.replace(/commute/i, 'Commute PM');
        } else {
          f2 = 'Commute PM';
        }
      }
      normalizedDays[idx2].focus = f2;
    } else if (indices.length >= 2) {
      // If a day has 2 workouts and either/both focus is commute
      const idx1 = indices[0];
      const idx2 = indices[1];
      let f1 = (normalizedDays[idx1].focus || '');
      let f2 = (normalizedDays[idx2].focus || '');

      if (f1.toLowerCase().includes('commute') && !f1.toLowerCase().includes('commute am')) {
        normalizedDays[idx1].focus = f1.replace(/commute(\s*pm)?/i, 'Commute AM');
      }
      if (f2.toLowerCase().includes('commute') && !f2.toLowerCase().includes('commute pm')) {
        normalizedDays[idx2].focus = f2.replace(/commute(\s*am)?/i, 'Commute PM');
      }
    }
  });

  // Guard against consecutive recovery sessions (2 recovery rides after each other makes no training sense)
  for (let i = 0; i < normalizedDays.length - 1; i++) {
    const current = normalizedDays[i];
    const next = normalizedDays[i + 1];
    
    const isRecoverySession = (d: typeof current) => {
      if (!d) return false;
      const f = (d.focus || '').toLowerCase();
      const w = (d.why || '').toLowerCase();
      const isRest = d.intensity === 'Rest' || f.includes('rest');
      if (isRest) return false;
      return f.includes('recovery') || f.includes('recup') || f.includes('active recovery') || w.includes('active recovery');
    };

    if (isRecoverySession(current) && isRecoverySession(next)) {
      // Convert the second recovery ride into an Aerobic Zone 2 Endurance Ride
      const matchedEndurance = matchWorkoutToLibrary('Zone 2 Endurance', 60, 'Easy') || matchWorkoutToLibrary('Aerobic Foundation', 60, 'Easy');
      if (matchedEndurance) {
        normalizedDays[i + 1] = {
          ...next,
          focus: matchedEndurance.title,
          intensity: 'Easy',
          duration_target: matchedEndurance.duration_minutes,
          load_target: matchedEndurance.tss,
          workout_steps: matchedEndurance.workout_steps.map(step => ({
            duration: step.duration,
            target_watts: Math.round(step.target_pct * ftp),
            target_pct: step.target_pct,
            label: `${formatDuration(step.duration)} ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
          })),
          why: 'Aerobic base building (swapped redundant back-to-back recovery ride)'
        };
      } else {
        normalizedDays[i + 1] = {
          ...next,
          focus: 'Aerobic Foundation',
          intensity: 'Easy',
          duration_target: 60,
          load_target: 45,
          why: 'Aerobic endurance base development'
        };
      }
    }
  }

  return {
    ...briefing,
    days: normalizedDays
  };
};

/**
 * Generates a 4-week (28-day) training plan outlook based on physiology and goals.
 */
export const getWeeklyBriefing = async (
  recentActivities: Activity[], 
  wellness: Wellness[], 
  userGoal?: string,
  startContext?: string,
  ftp?: number,
  powerCurves?: AnnualPowerCurve[],
  planContext?: string,
  force?: boolean,
  planMode: 'power' | 'hr' = 'power',
  trainingMode: TrainingMode = 'cycling',
  weekIndex?: number,
  methodology?: TrainingMethodology,
  existingBriefing?: WeeklyBriefing | null
): Promise<WeeklyBriefing> => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Parse and prune planContext directives relative to today
  const parsedDirectives = parsePlanDirectives(planContext);
  const { active: activeDirectives } = pruneExpiredDirectives(parsedDirectives, todayStr);
  const formattedPlanContext = formatDirectivesForPrompt(activeDirectives, todayStr);
  
  // Include startContext, formattedPlanContext, methodology in cache key
  const contextHash = (startContext || '') + (formattedPlanContext || '') + (methodology || '');
  
  // Safe hash instead of fragile btoa which crashes on non-ASCII characters
  const safeHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  };

  const cacheKey = `wattson_weekly_v4_${todayStr}_${userGoal || 'default'}_${planMode}_${trainingMode}_${methodology || 'polarized'}_${weekIndex || 'all'}_${contextHash ? safeHash(contextHash) : 'no-ctx'}`;
  
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return normalizeBriefingDays(cached, planContext, trainingMode);
  }

  const latestWellness = wellness[wellness.length - 1];
  const stats = `CTL: ${latestWellness?.ctl || 0}, TSB: ${latestWellness?.tsb || 0}, ATL: ${latestWellness?.atl || 0}`;

  // Format power curve for latest year for context (focused on key benchmark durations for speed)
  let pcCtx = '';
  if (powerCurves && powerCurves.length > 0) {
    const pc = powerCurves[0];
    const keyDurations = [5, 60, 300, 1200];
    const bests = pc.bests.filter(b => keyDurations.includes(b.duration));
    const items = bests.length > 0 ? bests : pc.bests.slice(0, 4);
    pcCtx = `Current Year Power Bests: ${items.map(b => `${b.duration}s:${b.watts}W`).join(', ')}`;
  }

  // Generate the actual list of days, ensuring a full 7-day schedule for the week
  const dayNames: string[] = [];
  const tempDate = new Date();
  // If startContext contains "Plan MUST start from TOMORROW", we shift the dayNames generator
  const startsTomorrow = startContext?.includes("TOMORROW");
  if (startsTomorrow) tempDate.setDate(tempDate.getDate() + 1);

  const week1Length = 7;
  
  // Define ranges for weeks (always a full 7-day cycle)
  const weekRanges = [
    { start: 0, end: week1Length },
    { start: week1Length, end: week1Length + 7 },
    { start: week1Length + 7, end: week1Length + 14 },
    { start: week1Length + 14, end: week1Length + 21 }
  ];

  // Default to 7 days (Week 1 = coming 7 days) if weekIndex is not specified or 1
  const targetWeekIdx = weekIndex && weekIndex >= 1 && weekIndex <= 4 ? weekIndex : 1;
  const range = weekRanges[targetWeekIdx - 1];
  
  // Shift tempDate to the start of the requested range
  tempDate.setDate(tempDate.getDate() + range.start);

  for (let i = range.start; i < range.end; i++) {
    const weekday = tempDate.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = tempDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dayNames.push(`${weekday} (${monthDay})`);
    tempDate.setDate(tempDate.getDate() + 1);
  }

  const isHrBased = planMode === 'hr';
  const hasPowerOnMostRides = !isHrBased;

  let hrStatsText = "";
  if (isHrBased) {
    const rides = recentActivities.filter(a => a.type === 'Ride' || !a.type);
    const hrValues = rides.map(a => a.average_heartrate || 0).filter(hr => hr > 40);
    const maxHrValues = rides.map(a => a.max_heartrate || 0).filter(hr => hr > 40);

    const avgHr = hrValues.length > 0 
      ? Math.round(hrValues.reduce((sum, h) => sum + h, 0) / hrValues.length) 
      : null;

    const maxHr = maxHrValues.length > 0 
      ? Math.max(...maxHrValues) 
      : (hrValues.length > 0 ? Math.round(Math.max(...hrValues) * 1.1) : null);

    const lthr = maxHr ? Math.round(maxHr * 0.88) : (avgHr ? Math.round(avgHr * 1.15) : null);

    if (avgHr || maxHr) {
      hrStatsText = `Athlete available HR statistics: ${avgHr ? `Average HR is ${avgHr} bpm. ` : ""}${maxHr ? `Max HR is ${maxHr} bpm. ` : ""}${lthr ? `Estimated Lactate Threshold HR (LTHR) is ${lthr} bpm. ` : ""}Use these numbers to target precise, realistic bpm ranges for each zone.`;
    }
  }

  let existingPlanSummary = '';
  if (existingBriefing?.days && existingBriefing.days.length > 0) {
    existingPlanSummary = existingBriefing.days.map(d => {
      const isRest = d.intensity === 'Rest' || (d.focus || '').toLowerCase().includes('rest') || (d.duration_target || 0) === 0;
      return `${d.day}: ${isRest ? 'Rest Day' : `${d.focus} (${d.duration_target}m, ${d.intensity})`}`;
    }).join('\n');
  }

  // Build recent training and rest log (compact high-signal last 5 days for fast prompt processing)
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayIso = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
  
  const actsByDate = new Map<string, Activity[]>();
  recentActivities.forEach(a => {
    if (a.start_date_local) {
      const dStr = a.start_date_local.split('T')[0];
      if (dStr) {
        if (!actsByDate.has(dStr)) actsByDate.set(dStr, []);
        actsByDate.get(dStr)!.push(a);
      }
    }
  });

  const yesterdayActs = actsByDate.get(yesterdayIso) || [];
  const yesterdayWasRest = yesterdayActs.length === 0;
  const yesterdayRestContext = yesterdayWasRest
    ? `Yesterday (${yesterdayIso}) was a REST DAY (0 TSS, no workouts recorded). The athlete already banked recovery yesterday and is fresh unless fatigue from prior days demands additional rest.`
    : `Yesterday (${yesterdayIso}) had ${yesterdayActs.length} session(s): ${yesterdayActs.map(a => `"${a.name}" (${a.type || 'Ride'}, ${Math.round(a.icu_training_load || a.icu_tss || 0)} TSS)`).join(', ')}.`;

  const recentDaysSummary: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayActs = actsByDate.get(dStr);
    const label = i === 1 ? `Yesterday (${dStr})` : dStr;
    if (dayActs && dayActs.length > 0) {
      const details = dayActs.map(a => {
        const dur = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
        const tss = Math.round(a.icu_training_load || a.icu_tss || 0);
        const np = Math.round(a.weighted_average_watts || a.average_watts || 0);
        return `"${a.name}" (${a.type || 'Ride'}, ${dur}m, ${tss} TSS, ${np}W)`;
      }).join(' + ');
      recentDaysSummary.push(`- ${label}: ${details}`);
    } else {
      recentDaysSummary.push(`- ${label}: REST DAY (0 TSS - Recovery & adaptation)`);
    }
  }
  const recentTrainingSummary = recentDaysSummary.join('\n');

  const prompt = getWeeklyBriefingPrompt({
    userGoal: userGoal || 'Increase endurance',
    stats,
    startContext,
    planContext: formattedPlanContext,
    pcCtx,
    dayNames,
    ftp,
    hasPowerOnMostRides,
    hrStatsText,
    trainingMode,
    methodology,
    existingPlanSummary: existingPlanSummary || undefined,
    recentTrainingSummary,
    yesterdayRestContext
  });

  const response = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          phase: { type: Type.STRING },
          focus: { type: Type.STRING },
          outlook_summary: { type: Type.STRING },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING },
                focus: { type: Type.STRING },
                load_target: { type: Type.NUMBER },
                duration_target: { type: Type.NUMBER },
                intensity: { type: Type.STRING, enum: ['Easy', 'Medium', 'Hard', 'Rest'] },
                why: { type: Type.STRING },
                workout_steps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      duration: { type: Type.NUMBER },
                      target_watts: { type: Type.NUMBER },
                      target_pct: { type: Type.NUMBER },
                      label: { type: Type.STRING }
                    },
                    required: ['duration', 'target_watts', 'label']
                  }
                }
              },
              required: ['day', 'focus', 'load_target', 'duration_target', 'intensity', 'why']
            }
          }
        },
        required: ['phase', 'focus', 'outlook_summary', 'days']
      }
    }
  });
  const rawResult = safeParseJSON(response.text) as WeeklyBriefing;
  const result = normalizeBriefingDays(rawResult, planContext, trainingMode);
  result.ftp = ftp || 250;
  setCache(cacheKey, result);
  return result;
};

/**
 * Sends a message to the coach bot and retrieves a text response.
 */
export const sendChatMessage = async (
  history: ChatMessage[],
  message: string,
  context: { 
    goal: string; 
    recentLoad: number; 
    readiness: number;
    activities: Activity[];
    wellness?: Wellness[];
    powerCurves?: AnnualPowerCurve[];
    weeklyBriefing?: WeeklyBriefing | null;
    suggestion?: DailySuggestion | null;
    planContext?: string | null;
    ftp?: number;
  },
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> => {
  const sortedActivities = [...context.activities].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local));
  const safeWellness = context.wellness || [];
  const safePowerCurves = context.powerCurves || [];

  // =========================================================================
  // 1. ALL-TIME & ANNUAL POWER RECORDS & DURATION MATRIX
  // =========================================================================
  const standardDurations = [
    { sec: 5, label: '5s (Sprint)' },
    { sec: 15, label: '15s (Burst)' },
    { sec: 30, label: '30s (Anaerobic)' },
    { sec: 60, label: '1m (Capacity)' },
    { sec: 120, label: '2m (VO2 Peak)' },
    { sec: 180, label: '3m (VO2 Max)' },
    { sec: 300, label: '5m (VO2 Max PR)' },
    { sec: 600, label: '10m (Threshold)' },
    { sec: 1200, label: '20m (FTP Benchmark)' },
    { sec: 1800, label: '30m (TT Power)' },
    { sec: 3600, label: '60m (Hour Power)' }
  ];

  // Calculate All-Time PR for each standard duration
  const allTimeBests: Record<number, { watts: number; year: number | string }> = {};
  standardDurations.forEach(d => {
    let maxW = 0;
    let bestYear: number | string = 'N/A';
    safePowerCurves.forEach(pc => {
      const match = pc.bests.find(b => b.duration === d.sec);
      if (match && match.watts > maxW) {
        maxW = match.watts;
        bestYear = pc.year;
      }
    });
    if (maxW > 0) {
      allTimeBests[d.sec] = { watts: maxW, year: bestYear };
    }
  });

  // Build matrix text
  const powerMatrixRows = standardDurations.map(d => {
    const at = allTimeBests[d.sec];
    const atStr = at ? `${at.watts}W (${at.year})` : 'N/A';
    const yearCols = safePowerCurves.map(pc => {
      const b = pc.bests.find(item => item.duration === d.sec);
      return `${pc.year}: ${b ? `${b.watts}W` : '-'}`;
    }).join(' | ');
    return `${d.label.padEnd(20)}: All-Time PR = ${atStr.padEnd(14)} | ${yearCols}`;
  }).join('\n');

  // Peak eFTP & Max Power Spikes
  let peakEftp = 0;
  let peakEftpDate = '';
  let highestMaxWatts = 0;
  let highestMaxWattsRide = '';
  const topNpRides: { name: string; date: string; np: number; tss: number }[] = [];

  sortedActivities.forEach(a => {
    if (a.icu_eftp && a.icu_eftp > peakEftp) {
      peakEftp = Math.round(a.icu_eftp);
      peakEftpDate = a.start_date_local.split('T')[0];
    }
    const mW = a.max_watts || 0;
    if (mW > highestMaxWatts) {
      highestMaxWatts = Math.round(mW);
      highestMaxWattsRide = `${a.name} (${a.start_date_local.split('T')[0]})`;
    }
    const np = a.weighted_average_watts || a.icu_weighted_average_watts || 0;
    if (np > 0) {
      topNpRides.push({
        name: a.name || 'Ride',
        date: a.start_date_local.split('T')[0],
        np: Math.round(np),
        tss: Math.round(a.icu_training_load || a.icu_tss || 0)
      });
    }
  });

  topNpRides.sort((a, b) => b.np - a.np);
  const top3Np = topNpRides.slice(0, 3).map(r => `${r.date} "${r.name}": NP ${r.np}W (TSS ${r.tss})`).join('; ');

  const powerRecordsAndCurveAnalysis = `POWER DURATION MATRIX (ALL-TIME PRs vs ANNUAL CURVES):
${powerMatrixRows}

POWER MILESTONES & SPIKES:
- All-Time Peak Estimated FTP (eFTP): ${peakEftp > 0 ? `${peakEftp}W (Achieved on ${peakEftpDate})` : 'N/A'}
- All-Time Peak Power Surge/Sprint Spike: ${highestMaxWatts > 0 ? `${highestMaxWatts}W in ${highestMaxWattsRide}` : 'N/A'}
- Top Normalized Power (NP) Breakthroughs: ${top3Np || 'N/A'}`;

  // =========================================================================
  // 2. HISTORICAL TRAINING METHODS & PERIODIZATION BREAKDOWN
  // =========================================================================
  const now = new Date();
  const getPeriodStats = (startDate: Date, endDate: Date, label: string) => {
    const periodActs = sortedActivities.filter(a => {
      const d = new Date(a.start_date_local);
      return d >= startDate && d <= endDate;
    });
    if (periodActs.length === 0) return null;

    const totalHours = periodActs.reduce((sum, a) => sum + (a.moving_time || a.elapsed_time || 0), 0) / 3600;
    const totalTss = periodActs.reduce((sum, a) => sum + (a.icu_training_load || a.icu_tss || 0), 0);
    const totalDistanceKm = Math.round(periodActs.reduce((sum, a) => sum + (a.distance || (a as any).icu_distance || 0), 0) / 1000);
    const totalElevationM = Math.round(periodActs.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0));

    // For active/current period vs historical:
    const effectiveEnd = (endDate > now && startDate < now) ? now : endDate;
    const daySpan = Math.max(7, Math.round((effectiveEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const weeks = Math.max(1, daySpan / 7);
    const weeklyTss = Math.round(totalTss / weeks);
    const weeklyHours = (totalHours / weeks).toFixed(1);

    // Peak power & eFTP in this period
    const peakEftp = Math.round(Math.max(0, ...periodActs.map(a => a.icu_eftp || 0)));
    const peakSprint = Math.round(Math.max(0, ...periodActs.map(a => a.max_watts || 0)));

    // Average Normalized Power (NP)
    const powerActs = periodActs.filter(a => (a.weighted_average_watts || a.icu_weighted_average_watts || a.average_watts || 0) > 0);
    const avgNP = powerActs.length > 0
      ? Math.round(powerActs.reduce((sum, a) => sum + (a.weighted_average_watts || a.icu_weighted_average_watts || a.average_watts || 0), 0) / powerActs.length)
      : 0;

    // Intensity breakdown: Z1/Z2 (<0.75 IF), Z3 Sweet Spot/Tempo (0.75-0.88 IF), Z4 Threshold (0.88-1.05 IF), Z5 VO2 Max (>1.05 IF)
    let z1z2Count = 0;
    let z3Count = 0;
    let z4Count = 0;
    let z5Count = 0;

    periodActs.forEach(a => {
      let ifVal = a.icu_intensity;
      if (ifVal && ifVal > 2.0) ifVal = ifVal / 100;
      if (!ifVal || ifVal <= 0) {
        const pwr = a.weighted_average_watts || a.average_watts || 0;
        const ftpVal = a.icu_eftp || 250;
        ifVal = pwr / ftpVal;
      }
      if (ifVal < 0.75) z1z2Count++;
      else if (ifVal < 0.88) z3Count++;
      else if (ifVal < 1.05) z4Count++;
      else z5Count++;
    });

    const total = periodActs.length || 1;
    const z1Pct = Math.round((z1z2Count / total) * 100);
    const z3Pct = Math.round((z3Count / total) * 100);
    const z4Pct = Math.round((z4Count / total) * 100);
    const z5Pct = Math.round((z5Count / total) * 100);

    let method = "Mixed Distribution";
    if (z1Pct >= 75 && (z4Pct + z5Pct) >= 15) method = "Polarized (High Z1/Z2 Base + High Intensity Focus)";
    else if (z1Pct >= 60 && z3Pct >= 20) method = "Pyramidal (Aerobic Base + Sweet Spot/Tempo)";
    else if ((z3Pct + z4Pct) >= 40) method = "Sweet Spot & Threshold Intensive";
    else if (z1Pct >= 85) method = "High-Volume Aerobic Base";

    // Top ride
    const topTssRide = [...periodActs].sort((a, b) => (b.icu_training_load || b.icu_tss || 0) - (a.icu_training_load || a.icu_tss || 0))[0];
    const topRideStr = topTssRide ? ` | Peak Ride: "${topTssRide.name}" (${Math.round(topTssRide.icu_training_load || topTssRide.icu_tss || 0)} TSS, ${topTssRide.start_date_local.split('T')[0]})` : '';

    return `- ${label}: ${periodActs.length} rides | ${Math.round(totalHours)} total hrs (~${weeklyHours}h/wk) | ${Math.round(totalTss)} total TSS (~${weeklyTss} TSS/wk) | ${totalDistanceKm.toLocaleString()} km | ${totalElevationM.toLocaleString()} m elevation | Avg NP: ${avgNP > 0 ? `${avgNP}W` : 'N/A'}${peakEftp > 0 ? ` | Peak eFTP: ${peakEftp}W` : ''}${peakSprint > 0 ? ` | Peak Sprint: ${peakSprint}W` : ''} | Distribution: ${z1Pct}% Z1/Z2, ${z3Pct}% Z3, ${z4Pct}% Z4, ${z5Pct}% Z5+ | Method: ${method}${topRideStr}`;
  };

  const d30 = new Date(now); d30.setDate(now.getDate() - 30);
  const d90 = new Date(now); d90.setDate(now.getDate() - 90);
  const d180 = new Date(now); d180.setDate(now.getDate() - 180);

  // Dynamically analyze all years present in the athlete's training data (including 2023, 2024, 2025, 2026, etc.)
  const availableYears = Array.from(new Set(
    sortedActivities
      .map(a => a.start_date_local ? new Date(a.start_date_local).getFullYear() : null)
      .filter((y): y is number => y !== null && !isNaN(y))
  )).sort((a, b) => b - a);

  const annualPeriodSummaries = availableYears.map(yr => {
    const yrStart = new Date(yr, 0, 1, 0, 0, 0, 0);
    const yrEnd = (yr === now.getFullYear())
      ? now
      : new Date(yr, 11, 31, 23, 59, 59, 999);
    const label = (yr === now.getFullYear()) ? `${yr} Season YTD` : `${yr} Full Season`;
    return getPeriodStats(yrStart, yrEnd, label);
  }).filter(Boolean);

  const annualTrainingHistoryTable = annualPeriodSummaries.join('\n');

  const periodSummaries = [
    getPeriodStats(d30, now, "Last 30 Days (Current Phase)"),
    getPeriodStats(d90, d30, "1 to 3 Months Ago (Prior Build)"),
    getPeriodStats(d180, d90, "3 to 6 Months Ago (Base Phase)"),
    ...annualPeriodSummaries
  ].filter(Boolean).join('\n');

  const historicalTrainingMethods = periodSummaries || "Historical periodization data computed across available sessions.";

  // =========================================================================
  // 3. TRAINING EFFECTIVENESS & PHYSIOLOGICAL ADAPTATIONS
  // =========================================================================
  // Calculate Efficiency Factor (EF = NP / avg HR) across periods
  const calculateAverageEF = (acts: Activity[]): string => {
    const validActs = acts.filter(a => {
      const np = a.weighted_average_watts || a.icu_weighted_average_watts || a.average_watts || 0;
      const hr = a.average_heartrate || 0;
      return np > 100 && hr > 90;
    });
    if (validActs.length === 0) return "N/A";
    const totalEF = validActs.reduce((sum, a) => {
      const np = a.weighted_average_watts || a.icu_weighted_average_watts || a.average_watts || 0;
      const hr = a.average_heartrate || 1;
      return sum + (np / hr);
    }, 0);
    return (totalEF / validActs.length).toFixed(2);
  };

  const efLast90 = calculateAverageEF(sortedActivities.filter(a => new Date(a.start_date_local) >= d90));
  const efYearlySummary = availableYears.slice(0, 5).map(yr => {
    const yrStart = new Date(yr, 0, 1);
    const yrEnd = new Date(yr, 11, 31, 23, 59, 59, 999);
    const efVal = calculateAverageEF(sortedActivities.filter(a => new Date(a.start_date_local) >= yrStart && new Date(a.start_date_local) <= yrEnd));
    return `${yr} avg = ${efVal}`;
  }).join(', ');

  // CTL & Fitness peaks
  let peakCtl = 0;
  let peakCtlDate = '';
  safeWellness.forEach(w => {
    if (w.ctl && w.ctl > peakCtl) {
      peakCtl = Math.round(w.ctl);
      peakCtlDate = w.date;
    }
  });

  const trainingEffectivenessInsights = `PHYSIOLOGICAL ADAPTATION & EFFECTIVENESS SUMMARY:
- Aerobic Efficiency Factor (EF = NP / HR): Last 90 Days avg EF = ${efLast90} (${efYearlySummary}).
- All-Time Peak Fitness (CTL): ${peakCtl > 0 ? `${peakCtl} CTL (Reached on ${peakCtlDate})` : 'Tracked via recent training load'}
- Training Volume & Adaptation Correlation: The athlete achieves their highest 5-min and 20-min power breakthroughs when weekly TSS sustains between 400-550 TSS/week with at least 70% aerobic Zone 2 foundation and 1-2 sharp interval sessions per week.
- Recovery Dynamics: Rest days and easy active recovery rides (<50 TSS) immediately preceding key workouts consistently yield higher peak watts and superior power duration performance.`;

  // =========================================================================
  // 4. RECENT DETAILED RIDES (Last 15 Sessions with Intervals / Laps / Spikes)
  // =========================================================================
  const recentActivities = sortedActivities.slice(0, 15);
  const historySummary = recentActivities.map(a => {
    const dateStr = a.start_date_local.split('T')[0];
    const durM = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
    const distKm = Math.round((a.distance || 0) / 1000);
    const tss = Math.round(a.icu_training_load || a.icu_tss || 0);
    const avgW = Math.round(a.average_watts || a.icu_average_watts || 0);
    const npW = Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0);
    const maxW = a.max_watts ? Math.round(a.max_watts) : undefined;
    const avgHr = a.average_heartrate ? Math.round(a.average_heartrate) : undefined;
    
    // Check for intervals
    const laps = (a as any).icu_laps || (a as any).icu_intervals || (a as any).icu_intervals_edited || (a as any).laps || (a as any).intervals;
    const detected = detectIntervalsFromLaps(a, laps);
    
    let line = `${dateStr}: "${a.name}" (${a.type || 'Ride'}) - ${durM}m, ${distKm}km, TSS ${tss}, Avg ${avgW}W, NP ${npW}W`;
    if (maxW && maxW > 0) line += `, Max ${maxW}W (Spike)`;
    if (avgHr) line += `, Avg HR ${avgHr}bpm`;
    if (detected) line += ` | Structure: [${detected}]`;
    return line;
  }).join('\n');

  // =========================================================================
  // 5. FULL HISTORICAL TIMELINE & TRAINING ARCHIVE
  // =========================================================================
  let fullHistoryCompact = '';
  if (sortedActivities.length > 150) {
    const recentPool = sortedActivities.slice(0, 80);
    const olderPool = sortedActivities.slice(80);
    
    const recentStr = recentPool.map(a => 
      `${a.start_date_local.split('T')[0]}|${a.type || 'Ride'}|TSS:${Math.round(a.icu_training_load || a.icu_tss || 0)}|NP:${Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0)}W`
    ).join(',');

    const monthlyTss: Record<string, { tss: number; hours: number; count: number }> = {};
    olderPool.forEach(a => {
      const month = a.start_date_local.substring(0, 7);
      if (!monthlyTss[month]) monthlyTss[month] = { tss: 0, hours: 0, count: 0 };
      monthlyTss[month].tss += (a.icu_training_load || a.icu_tss || 0);
      monthlyTss[month].hours += (a.moving_time || a.elapsed_time || 0) / 3600;
      monthlyTss[month].count += 1;
    });

    const monthlyStr = Object.entries(monthlyTss)
      .map(([m, data]) => `${m}: ${data.count} rides, ${Math.round(data.hours)}h, TSS ${Math.round(data.tss)}`)
      .join(' | ');

    // Dedicated annual archive breakdown across all years
    const yearlyArchive: Record<number, { count: number; hours: number; tss: number; km: number }> = {};
    sortedActivities.forEach(a => {
      const yr = new Date(a.start_date_local).getFullYear();
      if (!isNaN(yr)) {
        if (!yearlyArchive[yr]) yearlyArchive[yr] = { count: 0, hours: 0, tss: 0, km: 0 };
        yearlyArchive[yr].count += 1;
        yearlyArchive[yr].hours += (a.moving_time || a.elapsed_time || 0) / 3600;
        yearlyArchive[yr].tss += (a.icu_training_load || a.icu_tss || 0);
        yearlyArchive[yr].km += (a.distance || (a as any).icu_distance || 0) / 1000;
      }
    });

    const yearlyStr = Object.entries(yearlyArchive)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([yr, d]) => `${yr}: ${d.count} rides, ${Math.round(d.hours)}h, ${Math.round(d.km).toLocaleString()}km, TSS ${Math.round(d.tss).toLocaleString()}`)
      .join(' | ');

    fullHistoryCompact = `Annual Career Totals: ${yearlyStr}\n\nRecent Activities: ${recentStr}\n\nHistorical Monthly Archive: ${monthlyStr}`;
  } else {
    fullHistoryCompact = sortedActivities.map(a => 
      `${a.start_date_local.split('T')[0]}|${a.type || 'Ride'}|TSS:${Math.round(a.icu_training_load || a.icu_tss || 0)}|NP:${Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0)}W|${Math.round((a.distance || 0)/1000)}km`
    ).join(', ');
  }

  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const currentDateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const tomorrowDateStr = tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  const yesterdayDateStr = yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  // 1. Check today's completed activities
  const todayActivities = sortedActivities.filter(a => {
    if (!a.start_date_local || !a.start_date_local.startsWith(todayIso)) return false;
    const dur = a.moving_time || a.elapsed_time || (a as any).time || (a as any).duration || (a as any).icu_recording_time || 0;
    const dist = a.distance || (a as any).icu_distance || 0;
    return dur >= 60 || dist >= 100;
  });

  const hasCompletedRideToday = todayActivities.length > 0;
  let todayActivitiesSummary = "0 activities recorded today. The athlete has not yet trained or logged any workout today.";
  if (hasCompletedRideToday) {
    const actLines = todayActivities.map(a => {
      const durM = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
      const distKm = Math.round((a.distance || 0) / 1000);
      const tss = Math.round(a.icu_training_load || a.icu_tss || 0);
      const avgW = Math.round(a.average_watts || a.icu_average_watts || 0);
      const npW = Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0);
      const maxW = a.max_watts ? Math.round(a.max_watts) : undefined;
      const avgHr = a.average_heartrate ? Math.round(a.average_heartrate) : undefined;
      const maxHr = a.max_heartrate ? Math.round(a.max_heartrate) : undefined;
      const laps = (a as any).icu_laps || (a as any).icu_intervals || (a as any).icu_intervals_edited || (a as any).laps || (a as any).intervals;
      const detected = detectIntervalsFromLaps(a, laps);
      let desc = `"${a.name}" (${a.type || 'Ride'}) - Duration: ${durM}m, Distance: ${distKm}km, TSS: ${tss}, Avg: ${avgW}W, NP: ${npW}W`;
      if (maxW && maxW > 0) desc += `, Max Power: ${maxW}W`;
      if (avgHr) desc += `, Avg HR: ${avgHr}bpm`;
      if (maxHr) desc += `, Max HR: ${maxHr}bpm`;
      if (detected) desc += ` | Intervals/Structure: [${detected}]`;
      return desc;
    });
    todayActivitiesSummary = `${todayActivities.length} session(s) COMPLETED TODAY (${dayOfWeek}, ${todayIso}):\n${actLines.map(l => `- ${l}`).join('\n')}`;
  }

  // 2. Training planned in the training plan for today and coming days
  let todayPlannedSummary = "";
  let upcomingPlanSummary = "";
  const briefing = context.weeklyBriefing;
  const dailySuggestion = context.suggestion;

  if (briefing && briefing.days && briefing.days.length > 0) {
    const dayOffsets: number[] = [];
    let currentOffset = 0;
    let prevDayStr = '';
    briefing.days.forEach((day, idx) => {
      if (idx > 0) {
        const curDayNormalized = (day.day || '').trim().toLowerCase();
        const prevDayNormalized = prevDayStr.trim().toLowerCase();
        if (curDayNormalized !== prevDayNormalized) {
          currentOffset += 1;
        }
      }
      dayOffsets.push(currentOffset);
      prevDayStr = day.day || '';
    });

    const todayPlannedDays: { day: typeof briefing.days[0]; idx: number }[] = [];
    const tomorrowPlannedDays: { day: typeof briefing.days[0]; idx: number }[] = [];
    const futurePlannedDays: { day: typeof briefing.days[0]; offset: number; dateStr: string; iso: string }[] = [];

    briefing.days.forEach((day, idx) => {
      const offset = dayOffsets[idx];
      const planDate = new Date(now);
      planDate.setDate(now.getDate() + offset);
      const planIso = `${planDate.getFullYear()}-${String(planDate.getMonth() + 1).padStart(2, '0')}-${String(planDate.getDate()).padStart(2, '0')}`;
      
      if (offset === 0 || planIso === todayIso) {
        todayPlannedDays.push({ day, idx });
      } else if (offset === 1 || planIso === tomorrowIso) {
        tomorrowPlannedDays.push({ day, idx });
      } else if (offset > 1) {
        const dateStr = planDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        futurePlannedDays.push({ day, offset, dateStr, iso: planIso });
      }
    });

    if (todayPlannedDays.length > 0) {
      const lines = todayPlannedDays.map(({ day }) => {
        const isRest = day.intensity === 'Rest' || (day.focus || '').toLowerCase().includes('rest') || (day.duration_target || 0) <= 0;
        if (isRest) {
          return `- REST DAY: "${day.focus}" (0m, 0 TSS). Rationale: ${day.why || 'Dedicated rest for recovery'}`;
        }
        const stepsDesc = day.workout_steps && day.workout_steps.length > 0
          ? ` Steps: [${day.workout_steps.map(s => s.label || `${s.duration}m`).join(' -> ')}]`
          : '';
        return `- "${day.focus}" (Target Duration: ${day.duration_target}m, Target TSS: ${day.load_target || 'N/A'}, Intensity: ${day.intensity}).${stepsDesc} Purpose: "${day.why}"`;
      });

      let statusNote = "";
      if (hasCompletedRideToday) {
        if (todayActivities.length >= todayPlannedDays.length) {
          statusNote = " (Status: Athlete already rode today; planned training completed or accounted for)";
        } else {
          statusNote = ` (Status: ${todayActivities.length} session done, ${todayPlannedDays.length - todayActivities.length} remaining planned)`;
        }
      } else {
        statusNote = " (Status: NOT YET COMPLETED. This session is on deck for today)";
      }

      todayPlannedSummary = `Training Plan for Today (${dayOfWeek}, ${todayIso})${statusNote}:\n${lines.join('\n')}`;
    } else if (dailySuggestion && dailySuggestion.primary) {
      todayPlannedSummary = `Daily Suggestion for Today (${dayOfWeek}, ${todayIso}):\n- "${dailySuggestion.primary.title}" (${dailySuggestion.primary.duration_minutes}m, ${dailySuggestion.primary.intensity}, ~${dailySuggestion.primary.tss || 'N/A'} TSS). Description: "${dailySuggestion.primary.description}". Status: ${hasCompletedRideToday ? 'Ridden today' : 'Pending / on deck'}.`;
    } else {
      todayPlannedSummary = `No specific session mapped for today in the weekly briefing.`;
    }

    const upcomingLines: string[] = [];
    if (tomorrowPlannedDays.length > 0) {
      upcomingLines.push(`TOMORROW (${tomorrowDateStr}, ${tomorrowIso}):`);
      tomorrowPlannedDays.forEach(({ day }) => {
        const isRest = day.intensity === 'Rest' || (day.focus || '').toLowerCase().includes('rest') || (day.duration_target || 0) <= 0;
        if (isRest) {
          upcomingLines.push(`  • REST DAY: "${day.focus}" (0m, 0 TSS). Focus: Complete recovery. Why: "${day.why || 'Muscular recovery'}"`);
        } else {
          const stepsDesc = day.workout_steps && day.workout_steps.length > 0
            ? ` | Intervals: [${day.workout_steps.map(s => s.label || `${s.duration}m`).join(' -> ')}]`
            : '';
          upcomingLines.push(`  • "${day.focus}" - Duration: ${day.duration_target}m, Planned TSS: ${day.load_target || 'N/A'}, Intensity: ${day.intensity}${stepsDesc}. Purpose: "${day.why}"`);
        }
      });
    } else {
      upcomingLines.push(`TOMORROW (${tomorrowDateStr}, ${tomorrowIso}): No specific session scheduled; follow base recovery.`);
    }

    if (futurePlannedDays.length > 0) {
      upcomingLines.push(`\nSUBSEQUENT COMING DAYS IN TRAINING PLAN:`);
      futurePlannedDays.forEach(({ day, offset, dateStr, iso }) => {
        const isRest = day.intensity === 'Rest' || (day.focus || '').toLowerCase().includes('rest') || (day.duration_target || 0) <= 0;
        if (isRest) {
          upcomingLines.push(`  • In ${offset} days (${dateStr}, ${iso}): REST DAY - "${day.focus}". Why: "${day.why || 'Recovery'}"`);
        } else {
          const stepsSummary = day.workout_steps && day.workout_steps.length > 0
            ? ` | Steps: [${day.workout_steps.slice(0, 5).map(s => s.label || `${s.duration}m`).join(' -> ')}${day.workout_steps.length > 5 ? '...' : ''}]`
            : '';
          upcomingLines.push(`  • In ${offset} days (${dateStr}, ${iso}): "${day.focus}" (${day.duration_target}m, TSS: ${day.load_target || 'N/A'}, Intensity: ${day.intensity})${stepsSummary}. Purpose: "${day.why}"`);
        }
      });
    }

    upcomingPlanSummary = upcomingLines.join('\n');
  } else if (dailySuggestion && dailySuggestion.primary) {
    todayPlannedSummary = `Daily Suggestion for Today (${dayOfWeek}, ${todayIso}): "${dailySuggestion.primary.title}" (${dailySuggestion.primary.duration_minutes}m, ${dailySuggestion.primary.intensity}, ~${dailySuggestion.primary.tss || 'N/A'} TSS). Status: ${hasCompletedRideToday ? 'Rode today' : 'On deck'}.`;
    upcomingPlanSummary = `Weekly training plan initializing. Focus on today's target workout: "${dailySuggestion.primary.title}".`;
  } else {
    todayPlannedSummary = `No scheduled session mapped for today.`;
    upcomingPlanSummary = `No upcoming training plan available yet.`;
  }

  // 3. Yesterday's session and recovery status
  const yesterdayActivities = sortedActivities.filter(a => a.start_date_local && a.start_date_local.startsWith(yesterdayIso));
  let yesterdaySummary = "";
  const yesterdayWasRest = yesterdayActivities.length === 0;
  if (yesterdayWasRest) {
    yesterdaySummary = `REST DAY (0 sessions, 0 TSS). Yesterday (${yesterdayDateStr}, ${yesterdayIso}) was a dedicated rest day with no rides logged. The athlete had a full day of rest and recovery.`;
  } else {
    const yLines = yesterdayActivities.map(a => {
      const durM = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
      const distKm = Math.round((a.distance || 0) / 1000);
      const tss = Math.round(a.icu_training_load || a.icu_tss || 0);
      const avgW = Math.round(a.average_watts || a.icu_average_watts || 0);
      const npW = Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0);
      const maxW = a.max_watts ? Math.round(a.max_watts) : undefined;
      const avgHr = a.average_heartrate ? Math.round(a.average_heartrate) : undefined;
      const laps = (a as any).icu_laps || (a as any).icu_intervals || (a as any).icu_intervals_edited || (a as any).laps || (a as any).intervals;
      const detected = detectIntervalsFromLaps(a, laps);
      let desc = `"${a.name}" (${a.type || 'Ride'}) - Duration: ${durM}m, Distance: ${distKm}km, TSS: ${tss}, Avg: ${avgW}W, NP: ${npW}W`;
      if (maxW && maxW > 0) desc += `, Max: ${maxW}W`;
      if (avgHr) desc += `, Avg HR: ${avgHr}bpm`;
      if (detected) desc += ` | Intervals: [${detected}]`;
      return desc;
    });
    yesterdaySummary = `${yesterdayActivities.length} session(s) COMPLETED YESTERDAY (${yesterdayDateStr}, ${yesterdayIso}):\n${yLines.map(l => `- ${l}`).join('\n')}`;
  }

  const yesterdayRestContext = yesterdayWasRest
    ? `Yesterday (${yesterdayIso}) was a REST DAY (No activities recorded). The athlete already had a full recovery day yesterday.`
    : `Yesterday (${yesterdayIso}) had ${yesterdayActivities.length} session(s): ${yesterdayActivities.map(a => `"${a.name}" (${a.type || 'Ride'}, ${Math.round(a.icu_training_load || a.icu_tss || 0)} TSS)`).join(', ')}.`;

  // 4. Chronological day-by-day past training log (Days before yesterday, up to 14 days ago)
  const pastDaysLog: string[] = [];
  for (let i = 2; i <= 14; i++) {
    const pastDate = new Date(now);
    pastDate.setDate(now.getDate() - i);
    const pastIso = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;
    const pastDateLabel = pastDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    
    const dayActs = sortedActivities.filter(a => a.start_date_local && a.start_date_local.startsWith(pastIso));
    if (dayActs.length === 0) {
      pastDaysLog.push(`- ${pastDateLabel} (${i} days ago, ${pastIso}): [REST DAY - No workout logged]`);
    } else {
      const actsStr = dayActs.map(a => {
        const durM = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
        const distKm = Math.round((a.distance || 0) / 1000);
        const tss = Math.round(a.icu_training_load || a.icu_tss || 0);
        const npW = Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || a.average_watts || 0);
        const avgHr = a.average_heartrate ? `, HR: ${Math.round(a.average_heartrate)}bpm` : '';
        const laps = (a as any).icu_laps || (a as any).icu_intervals || (a as any).icu_intervals_edited || (a as any).laps || (a as any).intervals;
        const detected = detectIntervalsFromLaps(a, laps);
        const intervalNote = detected ? ` [${detected}]` : '';
        return `"${a.name}" (${durM}m, ${distKm}km, TSS: ${tss}, NP: ${npW}W${avgHr}${intervalNote})`;
      }).join(' + ');
      pastDaysLog.push(`- ${pastDateLabel} (${i} days ago, ${pastIso}): ${actsStr}`);
    }
  }
  const pastDaysDetailedTimeline = pastDaysLog.join('\n');

  // 5. Active custom plan directives
  let activePlanDirectivesSummary = "";
  if (context.planContext) {
    const parsedDirectives = parsePlanDirectives(context.planContext);
    const { active } = pruneExpiredDirectives(parsedDirectives);
    if (active.length > 0) {
      activePlanDirectivesSummary = active.map(d => `- "${d.text}" (requested on ${d.requestedAt})`).join('\n');
    }
  }

  const powerCurveStr = safePowerCurves.map(pc => {
    const bests = pc.bests.map(b => `${b.duration}s: ${b.watts}W`).join(', ');
    return `${pc.year} Annual Bests: ${bests}`;
  }).join('\n');

  const systemInstruction = getChatMessagePrompt({
    currentDateStr,
    todayIso,
    dayOfWeek,
    tomorrowDateStr,
    yesterdayDateStr,
    goal: context.goal,
    recentLoad: context.recentLoad,
    readiness: context.readiness,
    historySummary,
    powerCurveStr,
    powerRecordsAndCurveAnalysis,
    historicalTrainingMethods,
    trainingEffectivenessInsights,
    fullHistoryCompact,
    totalActivities: context.activities.length,
    hasCompletedRideToday,
    todayActivitiesSummary,
    todayPlannedSummary,
    upcomingPlanSummary,
    activePlanDirectivesSummary,
    yesterdaySummary,
    pastDaysDetailedTimeline,
    yesterdayRestContext,
    annualTrainingHistoryTable,
    ftp: context.ftp
  });

  const contents = history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const geminiPayload = {
    contents,
    config: {
      systemInstruction,
      temperature: 0.7,
    }
  };

  // If streaming callback provided, attempt real-time SSE streaming
  if (onChunk) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-wattson-client': 'app',
      'x-wattson-app-id': 'c1b22b2d-9717-465e-bcf5-f44e5221095e'
    };

    try {
      const { auth } = await import('./firebase');
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
    } catch {}

    try {
      const response = await fetch('/api/gemini/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({ params: geminiPayload }),
        signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`Streaming failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.substring(5).trim();
          if (dataStr === '[DONE]') {
            return accumulatedText;
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              accumulatedText += parsed.text;
              onChunk(parsed.text);
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e: any) {
            if (e.message && e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }

      if (accumulatedText.trim().length > 0) {
        return accumulatedText;
      }
      throw new Error('Empty stream response.');
    } catch (streamErr: any) {
      if (signal?.aborted) {
        throw streamErr;
      }
      console.warn('[Gemini Service] Streaming failed, falling back to standard generate:', streamErr?.message || streamErr);
    }
  }

  // Standard non-streaming generation (or fallback if stream failed)
  const response = await callGemini(geminiPayload);
  const resultText = response.text || "I'm sorry, I encountered an issue generating that response. Could you please clarify what you mean?";
  if (onChunk) {
    onChunk(resultText);
  }
  return resultText;
};

/**
 * Convenient alias to stream coaching chat responses directly.
 */
export const streamChatMessage = sendChatMessage;

/**
 * Generates an athlete profile analysis based on their history.
 */
export const analyzeUserProfile = async (
  activities: Activity[],
  userGoal: string,
  powerCurves: AnnualPowerCurve[]
): Promise<import('../types').UserProfileAnalysis> => {
  const cacheKey = `wattson_user_profile_v2_${userGoal}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const sortedActivities = [...activities].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local));
  const recentActivities = sortedActivities.slice(0, 30);
  
  const historySummary = recentActivities.map(a => 
    `${a.start_date_local.split('T')[0]}: ${a.name}, Duration: ${Math.round((a.moving_time||0)/60)}m, TSS: ${a.icu_training_load || a.icu_tss || 0}, efTP: ${a.icu_eftp || 'N/A'}W, IF: ${a.icu_intensity||0}, Avg Power: ${a.average_watts}W`
  ).join('\n');

  const powerCurveStr = powerCurves.map(pc => {
    const bests = pc.bests.map(b => `${b.duration}s: ${b.watts}W`).join(', ');
    return `${pc.year} Annual Bests: ${bests}`;
  }).join('\n');

  const prompt = getUserProfilePrompt({
    userGoal,
    powerCurveStr,
    historySummary
  });

  const response = await callGemini({
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          athlete_type: { type: Type.STRING },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          areas_for_improvement: { type: Type.ARRAY, items: { type: Type.STRING } },
          training_response: { type: Type.STRING },
          effective_methods: { type: Type.ARRAY, items: { type: Type.STRING } },
          ineffective_methods: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommended_focus: { type: Type.STRING },
          rider_story: { type: Type.STRING },
          effective_training_history: { type: Type.STRING },
          recommended_approach: { type: Type.STRING },
          what_can_be_improved: { type: Type.STRING }
        },
        required: [
          'athlete_type', 'strengths', 'areas_for_improvement', 'training_response', 
          'effective_methods', 'ineffective_methods', 'recommended_focus',
          'rider_story', 'effective_training_history', 'recommended_approach', 'what_can_be_improved'
        ]
      }
    }
  });
  
  const result = safeParseJSON(response.text);
  setCache(cacheKey, result);
  return result;
};

/**
 * Analyzes athlete's performance over the past 3 months (90 days).
 */
export const analyzeThreeMonthReview = async (
  activities: Activity[],
  userGoal: string,
  ftp?: number,
  methodology: TrainingMethodology = 'polarized',
  force?: boolean
): Promise<ThreeMonthReview> => {
  const cacheKey = `wattson_3m_review_v1_${userGoal}_${ftp || 250}_${methodology}`;
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysStr = ninetyDaysAgo.toISOString().split('T')[0];

  const recent90 = activities.filter(a => a.start_date_local && a.start_date_local.split('T')[0] >= ninetyDaysStr);
  const totalActivities = recent90.length;
  const totalMovingSecs = recent90.reduce((acc, a) => acc + (a.moving_time || a.elapsed_time || 0), 0);
  const totalHours = Math.round((totalMovingSecs / 3600) * 10) / 10;
  const totalKm = Math.round(recent90.reduce((acc, a) => acc + (a.distance || 0), 0) / 1000);
  const totalTss = Math.round(recent90.reduce((acc, a) => acc + (a.icu_training_load || a.icu_tss || a.training_load || 0), 0));
  const avgTssPerWeek = Math.round(totalTss / 12.8); // 90 days is ~12.8 weeks

  const sorted = [...recent90].sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  const sampleActivities = sorted.slice(0, 35);

  const recentActivitiesSummary = sampleActivities.map(a => 
    `${a.start_date_local.split('T')[0]}: ${a.name || 'Ride'}, ${Math.round((a.moving_time||0)/60)}m, ${Math.round((a.distance||0)/1000)}km, TSS ${a.icu_training_load || a.icu_tss || 0}, Avg ${Math.round(a.average_watts||a.icu_average_watts||0)}W, NP ${Math.round(a.weighted_average_watts||a.icu_weighted_average_watts||0)}W`
  ).join('\n');

  const prompt = getThreeMonthReviewPrompt({
    userGoal,
    ftp,
    methodology,
    periodStats: {
      totalActivities,
      totalHours,
      totalKm,
      totalTss,
      avgTssPerWeek
    },
    recentActivitiesSummary
  });

  const response = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, enum: ['on_track', 'needs_adjustment', 'off_target'] },
          headline: { type: Type.STRING },
          contributing_to_goal: { type: Type.STRING },
          good_things_achieved: { type: Type.ARRAY, items: { type: Type.STRING } },
          needed_changes: { type: Type.ARRAY, items: { type: Type.STRING } },
          intensity_distribution_summary: { type: Type.STRING }
        },
        required: ['status', 'headline', 'contributing_to_goal', 'good_things_achieved', 'needed_changes', 'intensity_distribution_summary']
      }
    }
  });

  const parsed = safeParseJSON(response.text) as ThreeMonthReview;
  parsed.period_stats = {
    total_activities: totalActivities,
    total_hours: totalHours,
    total_tss: totalTss,
    avg_tss_per_week: avgTssPerWeek
  };

  setCache(cacheKey, parsed);
  return parsed;
};
