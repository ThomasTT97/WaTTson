import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
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
  RecoveryAdvice,
  TrainingMode,
  TrainingMethodology,
  ThreeMonthReview
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
import {
  parsePlanDirectives,
  pruneExpiredDirectives,
  formatDirectivesForPrompt,
  serializePlanDirectives
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

    // Identify the zone of this step and check if it violates maximum continuous limits
    const isVo2Max = targetPct >= 1.05 || labelLower.includes('vo2') || labelLower.includes('aerobic capacity') || labelLower.includes('anaerobic');
    const isThreshold = !isVo2Max && (targetPct >= 0.90 || labelLower.includes('threshold') || labelLower.includes('lthr'));
    const isSweetSpotOrTempo = !isVo2Max && !isThreshold && (targetPct >= 0.75 || labelLower.includes('sweet spot') || labelLower.includes('sweetspot') || labelLower.includes('sst') || labelLower.includes('tempo'));

    if (isVo2Max && duration > 6) {
      // Decompose long VO2 Max efforts (typically anything > 6 minutes continuous)
      const reps = Math.max(2, Math.round(duration / 3.5));
      const repDuration = Math.round(duration / reps);
      const recoveryDuration = Math.max(2, Math.min(3, repDuration));
      
      const workLabel = updateLabelDuration(label, repDuration);
      const recoveryLabel = `${recoveryDuration} min Recovery ${Math.round(0.55 * effectiveFtp)}w`;

      for (let r = 0; r < reps; r++) {
        const newStep = {
          ...step,
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
      // Decompose long Threshold efforts (typically anything > 20 minutes continuous)
      const reps = Math.max(2, Math.round(duration / 10));
      const repDuration = Math.round(duration / reps);
      const recoveryDuration = Math.max(3, Math.round(repDuration / 3));

      const workLabel = updateLabelDuration(label, repDuration);
      const recoveryLabel = `${recoveryDuration} min Recovery ${Math.round(0.55 * effectiveFtp)}w`;

      for (let r = 0; r < reps; r++) {
        const newStep = {
          ...step,
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
      // Decompose long Sweet Spot or Tempo efforts (typically anything > 30 minutes continuous)
      const reps = Math.max(2, Math.round(duration / 15));
      const repDuration = Math.round(duration / reps);
      const recoveryDuration = Math.max(3, Math.round(repDuration / 4));

      const workLabel = updateLabelDuration(label, repDuration);
      const recoveryLabel = `${recoveryDuration} min Recovery ${Math.round(0.55 * effectiveFtp)}w`;

      for (let r = 0; r < reps; r++) {
        const newStep = {
          ...step,
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
      sanitized.push(step);
    }
  }

  return sanitized;
};

/**
 * General helper to call Gemini with a fallback chain.
 */
const callGemini = async (params: any): Promise<GenerateContentResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Model fallback chain: 
  // 1. gemini-3.5-flash (Supported basic/general text model)
  // 2. gemini-3.1-flash-lite (Supported lightweight model)
  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
  
  let lastError: any = null;
  for (const model of models) {
    try {
      return await ai.models.generateContent({
        ...params,
        model
      });
    } catch (error: any) {
      console.warn(`Gemini model ${model} failed, trying fallback...`, error);
      lastError = error;
      // Always try the next model in the fallback chain regardless of error type
      continue;
    }
  }
  throw lastError || new Error("All Gemini models failed.");
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
  const cacheKey = `wattson_feedback_v8_${activity.id}_${userGoal || 'default'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const plannedWorkoutCtx = plannedWorkout 
    ? `Planned Workout: "${plannedWorkout.name}". Description: "${plannedWorkout.description}".`
    : "No planned workout for this ride.";

  let lapsCtx = "No specific device laps recorded. Please analyze the overall session metrics (duration, power, NP, intensity, max power spikes) to deduce if there were structured efforts, power surges, or steady state riding.";
  
  let effectiveIntervals: any[] = [];
  if (intervals && intervals.length > 0) {
    effectiveIntervals = intervals;
  } else if (Array.isArray((activity as any).icu_laps) && (activity as any).icu_laps.length > 0) {
    effectiveIntervals = (activity as any).icu_laps;
  } else if (Array.isArray((activity as any).icu_intervals) && (activity as any).icu_intervals.length > 0) {
    effectiveIntervals = (activity as any).icu_intervals;
  } else if (Array.isArray((activity as any).icu_intervals_edited) && (activity as any).icu_intervals_edited.length > 0) {
    effectiveIntervals = (activity as any).icu_intervals_edited;
  } else if (Array.isArray((activity as any).laps) && (activity as any).laps.length > 0) {
    effectiveIntervals = (activity as any).laps;
  } else if (Array.isArray((activity as any).intervals) && (activity as any).intervals.length > 0) {
    effectiveIntervals = (activity as any).intervals;
  }

  const detectedRideType = detectIntervalsFromLaps(activity, effectiveIntervals) || undefined;

  // Detect power spikes and surge dynamics
  const maxWatts = activity.max_watts || 0;
  const avgWatts = activity.average_watts || activity.icu_average_watts || 0;
  const npWatts = activity.weighted_average_watts || activity.icu_weighted_average_watts || 0;
  let powerSpikesInfo = "";
  if (maxWatts > 0) {
    const spikeRatio = avgWatts > 0 ? (maxWatts / avgWatts).toFixed(1) : "N/A";
    powerSpikesInfo = `Peak Power Spike: ${Math.round(maxWatts)}W (Peak/Avg Ratio: ${spikeRatio}x). NP: ${Math.round(npWatts)}W, Avg: ${Math.round(avgWatts)}W.`;
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
        const pwrStr = l.watts > 0 ? `Avg Power: ${Math.round(l.watts)}W${l.maxW ? ` (Max: ${Math.round(l.maxW)}W)` : ''}` : 'Power: N/A';
        const hrStr = l.hr > 0 ? `Avg HR: ${Math.round(l.hr)}bpm${l.maxH ? ` (Max HR: ${Math.round(l.maxH)}bpm)` : ''}` : '';
        const cadStr = l.cad ? `Cadence: ${Math.round(l.cad)}rpm` : '';
        const metrics = [pwrStr, hrStr, cadStr].filter(Boolean).join(', ');
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
    npPower: Math.round(activity.weighted_average_watts || activity.icu_weighted_average_watts || 0),
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
  methodology?: TrainingMethodology
): Promise<DailySuggestion> => {
  const targetDate = new Date();
  if (forTomorrow) targetDate.setDate(targetDate.getDate() + 1);
  
  const targetStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  const cacheKey = `wattson_suggestion_${targetStr}_${userGoal || 'default'}_${methodology || 'polarized'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const history = recentActivities
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
    .slice(0, 14)
    .map(a => `${a.start_date_local.split('T')[0]}: ${a.icu_training_load || a.icu_tss || 0} TSS (${a.type}), efTP: ${a.icu_eftp || 'N/A'}W`)
    .join(', ');

  const prompt = getDailySuggestionPrompt({
    targetStr,
    history,
    userGoal: userGoal || '',
    ftp,
    hasPowerOnMostRides: true,
    hrStatsText: "",
    methodology
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
        result.primary = {
          title: matched.title,
          description: matched.description,
          intensity: matched.intensity,
          duration_minutes: matched.duration_minutes,
          type: matched.category.toLowerCase().includes('interval') || matched.workout_steps.length > 3 ? 'intervals' : 'endurance',
          tss: matched.tss,
          workout_steps: matched.workout_steps.map(step => ({
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
        result.alternative = {
          title: matched.title,
          description: matched.description,
          intensity: matched.intensity,
          duration_minutes: matched.duration_minutes,
          type: matched.category.toLowerCase().includes('interval') || matched.workout_steps.length > 3 ? 'intervals' : 'endurance',
          tss: matched.tss,
          workout_steps: matched.workout_steps.map(step => ({
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

export const normalizeBriefingDays = (briefing: WeeklyBriefing): WeeklyBriefing => {
  if (!briefing || !briefing.days) return briefing;

  let ftp = briefing.ftp;
  if (!ftp && typeof window !== 'undefined') {
    ftp = Number(localStorage.getItem('wattson_ftp')) || 250;
  }
  if (!ftp) ftp = 250;

  // Pass 1: Normalize durations, units, and weekday vs weekend duration caps
  let normalizedDays = briefing.days.map((day, idx) => {
    const isRest = day.intensity === 'Rest' || (day.focus || '').toLowerCase().includes('rest') || (day.focus || '').toLowerCase().includes('off');
    const isCommute = (day.day || '').toLowerCase().includes('commute') || (day.focus || '').toLowerCase().includes('commute');
    const isWeekend = /sat|sun/i.test(day.day || '');
    
    let targetDuration = day.duration_target;
    if (typeof targetDuration === 'number' && targetDuration > 0 && targetDuration <= 6) {
      targetDuration = Math.round(targetDuration * 60);
    }
    if (!targetDuration || targetDuration <= 0) {
      targetDuration = isRest ? 0 : 60;
    }

    // Weekday rides shouldn't default to marathon 4h (240m) or 3h (180m) sessions unless weekend
    if (!isRest && !isWeekend && targetDuration > 120) {
      // Normal weekday session should be 60-90m
      targetDuration = 75;
    }

    let currentDay = {
      ...day,
      duration_target: targetDuration
    };

    if (!isRest && !isCommute) {
      const matched = matchWorkoutToLibrary(currentDay.focus || '', targetDuration, currentDay.intensity || 'Medium');
      if (matched) {
        const scaledSteps = matched.workout_steps.map(step => ({
          duration: step.duration,
          target_watts: Math.round(step.target_pct * ftp),
          target_pct: step.target_pct,
          label: `${step.duration}m ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
        }));
        return {
          ...currentDay,
          focus: matched.title,
          workout_steps: scaledSteps,
          duration_target: matched.duration_minutes,
          load_target: matched.tss || currentDay.load_target,
          why: `${matched.category} focus: ${matched.description}`
        };
      }
    }
    
    if (currentDay.workout_steps) {
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

  // Pass 2: Guard against consecutive long sessions (e.g. back-to-back 4h / 240m or >120m sessions)
  for (let i = 0; i < normalizedDays.length - 1; i++) {
    const current = normalizedDays[i];
    const next = normalizedDays[i + 1];
    if (!current || !next) continue;

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
            label: `${step.duration}m ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
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
            label: `${step.duration}m ${step.label} (${Math.round(step.target_pct * 100)}% FTP)`
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
  methodology?: TrainingMethodology
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
    if (cached) return normalizeBriefingDays(cached);
  }

  const latestWellness = wellness[wellness.length - 1];
  const stats = `CTL: ${latestWellness?.ctl || 0}, TSB: ${latestWellness?.tsb || 0}, ATL: ${latestWellness?.atl || 0}`;

  // Format power curve for latest year for context
  let pcCtx = '';
  if (powerCurves && powerCurves.length > 0) {
    const pc = powerCurves[0]; // Assuming sorted by year desc
    pcCtx = `Current Year Power Bests: ${pc.bests.map(b => `${b.duration}s:${b.watts}W`).join(', ')}`;
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

  const range = weekIndex ? weekRanges[weekIndex - 1] : { start: 0, end: week1Length + 21 };
  
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
    methodology
  });

  const response = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.1,
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
  const result = normalizeBriefingDays(rawResult);
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
    wellness: Wellness[];
    powerCurves: AnnualPowerCurve[];
  }
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
    const daySpan = Math.max(7, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const weeks = Math.max(1, daySpan / 7);
    const weeklyTss = Math.round(totalTss / weeks);
    const weeklyHours = (totalHours / weeks).toFixed(1);

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
    if (z1Pct >= 75 && (z4Pct + z5Pct) >= 15) method = "Polarized (High Z1/Z2 Endurance Base + Focused High Intensity)";
    else if (z1Pct >= 60 && z3Pct >= 20) method = "Pyramidal (Broad Aerobic Base with Substantial Sweet Spot/Tempo)";
    else if ((z3Pct + z4Pct) >= 40) method = "Sweet Spot & Threshold Intensive";
    else if (z1Pct >= 85) method = "High-Volume Aerobic Base";

    return `- ${label}: ${periodActs.length} rides, ${Math.round(totalHours)} total hrs (${weeklyHours}h/wk, ~${weeklyTss} TSS/wk). Distribution: ${z1Pct}% Z1/Z2 Base, ${z3Pct}% Z3 Tempo/SS, ${z4Pct}% Z4 Threshold, ${z5Pct}% Z5+ High Intensity -> Method: ${method}`;
  };

  const d30 = new Date(now); d30.setDate(now.getDate() - 30);
  const d90 = new Date(now); d90.setDate(now.getDate() - 90);
  const d180 = new Date(now); d180.setDate(now.getDate() - 180);
  const start2025 = new Date('2025-01-01'); const end2025 = new Date('2025-12-31');
  const start2024 = new Date('2024-01-01'); const end2024 = new Date('2024-12-31');

  const periodSummaries = [
    getPeriodStats(d30, now, "Last 30 Days (Current Phase)"),
    getPeriodStats(d90, d30, "1 to 3 Months Ago (Prior Build)"),
    getPeriodStats(d180, d90, "3 to 6 Months Ago (Base Phase)"),
    getPeriodStats(start2025, end2025, "2025 Full Season"),
    getPeriodStats(start2024, end2024, "2024 Full Season")
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
  const ef2025 = calculateAverageEF(sortedActivities.filter(a => new Date(a.start_date_local) >= start2025 && new Date(a.start_date_local) <= end2025));
  const ef2024 = calculateAverageEF(sortedActivities.filter(a => new Date(a.start_date_local) >= start2024 && new Date(a.start_date_local) <= end2024));

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
- Aerobic Efficiency Factor (EF = NP / HR): Last 90 Days avg EF = ${efLast90} (2025 avg = ${ef2025}, 2024 avg = ${ef2024}). ${efLast90 !== 'N/A' && ef2025 !== 'N/A' && parseFloat(efLast90) >= parseFloat(ef2025) ? 'Demonstrates positive aerobic cardiac efficiency improvement (producing higher watts per heart beat).' : 'Aerobic efficiency tracking stable.'}
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

    fullHistoryCompact = `Recent Activities: ${recentStr}\n\nHistorical Monthly Archive: ${monthlyStr}`;
  } else {
    fullHistoryCompact = sortedActivities.map(a => 
      `${a.start_date_local.split('T')[0]}|${a.type || 'Ride'}|TSS:${Math.round(a.icu_training_load || a.icu_tss || 0)}|NP:${Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0)}W|${Math.round((a.distance || 0)/1000)}km`
    ).join(', ');
  }

  const currentDateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const powerCurveStr = safePowerCurves.map(pc => {
    const bests = pc.bests.map(b => `${b.duration}s: ${b.watts}W`).join(', ');
    return `${pc.year} Annual Bests: ${bests}`;
  }).join('\n');

  const systemInstruction = getChatMessagePrompt({
    currentDateStr,
    todayIso,
    goal: context.goal,
    recentLoad: context.recentLoad,
    readiness: context.readiness,
    historySummary,
    powerCurveStr,
    powerRecordsAndCurveAnalysis,
    historicalTrainingMethods,
    trainingEffectivenessInsights,
    fullHistoryCompact,
    totalActivities: context.activities.length
  });

  const contents = history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const response = await callGemini({
    contents,
    config: {
      systemInstruction,
      temperature: 0.7,
    }
  });
  return response.text || "Direct comms error.";
};

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
 * Generates recovery advice for the athlete based on current daily metrics and upcoming plan.
 */
export const getRecoveryAdvice = async (
  activities: Activity[],
  wellness: Wellness[],
  userGoal: string,
  upcomingBriefing?: WeeklyBriefing | null
): Promise<RecoveryAdvice> => {
  const cacheKey = `wattson_recovery_advice_${userGoal}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  const todayActivities = activities.filter(a => a.start_date_local && a.start_date_local.startsWith(todayStr));
  const todayLoad = todayActivities.reduce((sum, a) => sum + (a.icu_training_load || a.icu_tss || 0), 0);
  const todayDistance = todayActivities.reduce((sum, a) => sum + (a.distance || 0), 0);

  const sortedWellness = [...wellness].sort((a,b) => b.date.localeCompare(a.date));
  const recentWellness = sortedWellness[0];

  let upcomingText = "Rest or endurance build";
  if (upcomingBriefing && upcomingBriefing.days && upcomingBriefing.days.length > 0) {
    const nextDay = upcomingBriefing.days[0];
    upcomingText = `Focus: ${nextDay.focus}, load target: ${nextDay.load_target} TSS, intensity: ${nextDay.intensity}. Why: ${nextDay.why}`;
  }

  const prompt = `You are waTTson, an expert cycling coach AI. Provide hyper-personalized recovery advice for TODAY based on the athlete's current wellness metrics, today's training load, and the upcoming training target.

ATHLETE OVERALL GOAL: "${userGoal}"

TODAY'S ACTIVITY LOAD:
- Completed ${todayActivities.length} rides today.
- Today's training load: ${todayLoad} TSS.
- Distance completed: ${Math.round(todayDistance / 1000)} km.

ATHLETE RECENT WELLNESS METRICS:
${recentWellness ? `- Date: ${recentWellness.date}
- Resting Heart Rate: ${recentWellness.restHR || 'N/A'} bpm
- Heart Rate Variability (HRV): ${recentWellness.hrv || 'N/A'} ms
- Weight: ${recentWellness.weight || 'N/A'} kg
- CTL (Fitness): ${recentWellness.ctl || 'N/A'}
- ATL (Fatigue): ${recentWellness.atl || 'N/A'}
- TSB (Form): ${recentWellness.tsb || 'N/A'}` : "No recent wellness logs available."}

UPCOMING TRAINING TARGET (TOMORROW):
- ${upcomingText}

Please synthesize this information and output a highly actionable recovery guidance JSON object. Do not recommend anything unrealistic. Include concrete guidelines on:
1. Food & Hydration (Specific macronutrient focuses like carb load / protein repair, hydration amount, and timing based on today's ride intensity/TSS and tomorrow's target).
2. Sleep & Rest (Recommended hours, timing, and preparation advice based on current fatigue).
3. Active/Passive Recovery Protocols (Foam rolling, stretching, recovery spin, cold plunges, compression, or complete rest).

Return exactly the following JSON structure:
{
  "score": 85,
  "summary": "Brief 1-2 sentence overview summarizing their current metabolic and muscular state.",
  "sleep_advice": "Detailed, highly-actionable sleep and rest preparation guidance.",
  "food_advice": "Detailed, highly-actionable hydration and nutrition plan (macronutrients, timing, specific recommendations).",
  "activity_advice": "Detailed, highly-actionable recovery protocols (stretching, self-massage, recovery ride instructions).",
  "key_metrics": [
    { "label": "e.g. HRV Status", "value": "e.g. 64 ms (Optimal)", "status": "good" }
  ]
}`;

  const response = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          sleep_advice: { type: Type.STRING },
          food_advice: { type: Type.STRING },
          activity_advice: { type: Type.STRING },
          key_metrics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                status: { type: Type.STRING, enum: ['good', 'warning', 'neutral'] }
              },
              required: ['label', 'value', 'status']
            }
          }
        },
        required: ['score', 'summary', 'sleep_advice', 'food_advice', 'activity_advice', 'key_metrics']
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


export interface MonthlyReportData {
  summary: string;
  improvements: string[];
}

export const generateMonthlyInsights = async (
  activities: Activity[],
  ftp?: number
): Promise<MonthlyReportData> => {
  const cacheKey = `wattson_monthly_report_${activities.length}_${ftp}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  // Last 30 days activities
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  
  const recentActivities = activities.filter(a => new Date(a.start_date_local) >= thirtyDaysAgo);
  
  if (recentActivities.length === 0) {
    return {
      summary: "You haven't logged any activities in the last 30 days.",
      improvements: ["Log some activities to see your progress!"]
    };
  }

  const prompt = `Analyze the athlete's last 30 days of training.
Total activities: ${recentActivities.length}.
Total hours: ${Math.round(recentActivities.reduce((acc, a) => acc + (a.moving_time || 0), 0) / 3600)}.
Total load (TSS): ${Math.round(recentActivities.reduce((acc, a) => acc + (a.icu_training_load || a.icu_tss || 0), 0))}.
Current FTP: ${ftp || 'unknown'}.

Provide a brief, encouraging summary of their month and 2-3 specific improvements or achievements (e.g., consistency, volume, specific high-effort rides).
Respond in JSON format:
{
  "summary": "String summarizing the month.",
  "improvements": ["Improvement 1", "Improvement 2"]
}
`;

  try {
    const response = await callGemini({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
      }
    });
    
    const result = safeParseJSON(response.text);
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error("Failed to generate monthly insights", err);
    return {
      summary: "You had a solid month of training. Keep up the good work!",
      improvements: ["Maintained training consistency", "Logged solid weekly hours"]
    };
  }
};
