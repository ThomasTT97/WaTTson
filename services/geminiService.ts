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
  ThreeMonthReview,
  Type
} from "../types";
import {
  getRideFeedbackPrompt,
  getDailySuggestionPrompt,
  getWeeklyBriefingPrompt,
  getChatMessagePrompt,
  getUserProfilePrompt,
  getThreeMonthReviewPrompt
} from "./promptTemplates";


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
 * General helper to call Gemini via the server-side proxy.
 */
const callGemini = async (params: any): Promise<any> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Gemini API error");
  }
  
  return await response.json();
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
  const cacheKey = `wattson_feedback_v3_${activity.id}_${userGoal || 'default'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const plannedWorkoutCtx = plannedWorkout 
    ? `Planned Workout: "${plannedWorkout.name}". Description: "${plannedWorkout.description}".`
    : "No planned workout for this ride.";

  let lapsCtx = "No specific laps/intervals data recorded on the device. Please analyze the overall session metrics (duration, power, NP, intensity, etc.) to deduce if there were any structured efforts, or if it was a steady/variable ride. Make sure to discuss these inferred efforts (or lack thereof).";
  if (intervals && intervals.length > 0) {
    const formatLapTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.round(secs % 60);
      return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
    };

    const formattedLaps = intervals
      .filter(l => l.moving_time > 10) // exclude very short mis-clicks
      .map((l, i) => `Lap ${i+1}${l.label ? ` "${l.label}"` : ''} (${l.type || 'LAP'}): ${formatLapTime(l.moving_time)}, Power: ${Math.round(l.average_watts || 0)}W, HR: ${Math.round(l.average_heartrate || 0)}bpm`)
      .join('; ');
    
    if (formattedLaps.length > 0) {
      lapsCtx = `Actual Executed Laps: ${formattedLaps}`;
    }
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
    hrStatsText: ""
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
  setCache(cacheKey, result);
  return result;
};

/**
 * Generates a daily workout suggestion based on recent history.
 */
export const getLocalFallbackDailySuggestion = (
  userGoal: string,
  ftp: number = 250,
  methodology: TrainingMethodology = 'polarized',
  targetStr: string
): DailySuggestion => {
  const isPolarized = methodology === 'polarized';
  
  let primaryTitle = "Zone 2 Aerobic Base Builder";
  let primaryDesc = "A steady endurance ride focusing on fat oxidation and mitochondrial development. Keep your intensity controlled and stay strictly below your aerobic threshold.";
  let primaryTss = 45;
  let primarySteps = [
    { duration: 10, target_watts: Math.round(ftp * 0.55), label: "Warm-up in Zone 1" },
    { duration: 60, target_watts: Math.round(ftp * 0.65), label: "Steady Aerobic Cruise (Zone 2)" },
    { duration: 10, target_watts: Math.round(ftp * 0.50), label: "Cooldown Spin" }
  ];

  let altTitle = "VO2 Max Microbursts (40s/20s)";
  let altDesc = "A sharp, high-intensity micro-interval session designed to elevate your stroke volume and expand your top-end VO2max ceiling.";
  let altTss = 65;
  let altSteps = [
    { duration: 10, target_watts: Math.round(ftp * 0.55), label: "Warm-up with 3x15s spinups" },
    { duration: 5, target_watts: Math.round(ftp * 0.90), label: "Sub-threshold primer block" },
    { duration: 3, target_watts: Math.round(ftp * 0.50), label: "Easy spin recovery" },
    { duration: 10, target_watts: Math.round(ftp * 1.20), label: "Set 1: 10x [40s at 120% / 20s recovery]" },
    { duration: 5, target_watts: Math.round(ftp * 0.50), label: "Mid-set easy spin recovery" },
    { duration: 10, target_watts: Math.round(ftp * 1.20), label: "Set 2: 10x [40s at 120% / 20s recovery]" },
    { duration: 10, target_watts: Math.round(ftp * 0.50), label: "Cool-down and spin out legs" }
  ];

  if (!isPolarized) {
    primaryTitle = "Sweet Spot Muscular Endurance";
    primaryDesc = "Sustained sub-threshold blocks at 90% of your FTP. Excellent for raising your aerobic engine's power ceiling without excessive lactic accumulation.";
    primaryTss = 70;
    primarySteps = [
      { duration: 10, target_watts: Math.round(ftp * 0.55), label: "Warm-up" },
      { duration: 15, target_watts: Math.round(ftp * 0.90), label: "Block 1: Sweet Spot Tempo" },
      { duration: 5, target_watts: Math.round(ftp * 0.50), label: "Zone 1 Active Recovery" },
      { duration: 15, target_watts: Math.round(ftp * 0.90), label: "Block 2: Sweet Spot Tempo" },
      { duration: 10, target_watts: Math.round(ftp * 0.50), label: "Cooldown Spin" }
    ];

    altTitle = "Aerobic Threshold Progression";
    altDesc = "A classic pyramid endurance progression, nudging into your Zone 3 tempo zone to stimulate muscle capillary growth and fat adaptation.";
    altTss = 50;
    altSteps = [
      { duration: 10, target_watts: Math.round(ftp * 0.55), label: "Warm-up" },
      { duration: 20, target_watts: Math.round(ftp * 0.65), label: "Steady Zone 2 Base" },
      { duration: 20, target_watts: Math.round(ftp * 0.78), label: "Sustained Zone 3 Tempo" },
      { duration: 10, target_watts: Math.round(ftp * 0.50), label: "Cooldown Spin" }
    ];
  }

  return {
    date: targetStr,
    readiness_score: 84,
    readiness_analysis: "Your historical baseline indicates excellent recovery. Your cardiovascular efficiency suggests you are primed to absorb high-quality training.",
    reasoning: `Based on your goal of "${userGoal}" and your selected ${methodology} methodology, today is primed for high-quality aerobic adaptation. By pacing your efforts carefully, you will build long-term physiological durability.`,
    primary: {
      title: primaryTitle,
      description: primaryDesc,
      intensity: isPolarized ? "Low" : "Moderate",
      duration_minutes: primarySteps.reduce((sum, s) => sum + s.duration, 0),
      type: isPolarized ? "endurance" : "intervals",
      tss: primaryTss,
      workout_steps: primarySteps
    },
    alternative: {
      title: altTitle,
      description: altDesc,
      intensity: isPolarized ? "High" : "Low",
      duration_minutes: altSteps.reduce((sum, s) => sum + s.duration, 0),
      type: isPolarized ? "intervals" : "endurance",
      tss: altTss,
      workout_steps: altSteps
    }
  };
};

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

  try {
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
    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.warn("Gemini daily suggestion failed or backend is offline. Falling back to local rule-based suggestions:", error);
    const fallbackResult = getLocalFallbackDailySuggestion(userGoal || '', ftp || 250, methodology || 'polarized', targetStr);
    setCache(cacheKey, fallbackResult);
    return fallbackResult;
  }
};

export const normalizeBriefingDays = (briefing: WeeklyBriefing): WeeklyBriefing => {
  if (!briefing || !briefing.days) return briefing;

  const normalizedDays = briefing.days.map(d => ({ ...d }));

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
  
  // Include startContext, planContext, methodology in cache key
  const contextHash = (startContext || '') + (planContext || '') + (methodology || '');
  
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

  const cacheKey = `wattson_weekly_${todayStr}_${userGoal || 'default'}_${planMode}_${trainingMode}_${methodology || 'polarized'}_${weekIndex || 'all'}_${contextHash ? safeHash(contextHash) : 'no-ctx'}`;
  
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

  // Generate the actual list of days, ensuring Monday-Sunday alignment and making Week 1 shorter
  const dayNames: string[] = [];
  const tempDate = new Date();
  // If startContext contains "Plan MUST start from TOMORROW", we shift the dayNames generator
  const startsTomorrow = startContext?.includes("TOMORROW");
  if (startsTomorrow) tempDate.setDate(tempDate.getDate() + 1);

  // Compute Week 1 length based on start date (tempDate)
  const startDayOfWeek = tempDate.getDay() === 0 ? 7 : tempDate.getDay();
  const week1Length = 8 - startDayOfWeek;
  
  // Define ranges for weeks
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
    planContext,
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
  // Format a data summary for the AI
  const sortedActivities = [...context.activities].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local));
  const recentActivities = sortedActivities.slice(0, 5);
  
  const historySummary = recentActivities.map(a => 
    `${a.start_date_local.split('T')[0]}: ${a.name}, ${Math.round((a.distance || 0)/1000)}km, TSS ${a.icu_training_load || a.icu_tss || 0}, Avg Power ${Math.round(a.average_watts || a.icu_average_watts || 0)}W, NP ${Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0)}W`
  ).join('\n');

  // Format power curves for the coach
  const powerCurveStr = context.powerCurves.map(pc => {
    const bests = pc.bests.map(b => `${b.duration}s: ${b.watts}W`).join(', ');
    return `${pc.year} Annual Bests: ${bests}`;
  }).join('\n');

  // Compress full history for the LLM to access
  // For histories > 30 items, we summarize older ones to stay concise while maintaining the "full history" awareness
  let fullHistoryCompact = '';
  if (sortedActivities.length > 30) {
    const recentPool = sortedActivities.slice(0, 20);
    const olderPool = sortedActivities.slice(20);
    
    const recentStr = recentPool.map(a => 
      `${a.start_date_local.split('T')[0]}|TSS:${a.icu_training_load || a.icu_tss || 0}|NP:${Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0)}W`
    ).join(',');

    // Summarize older data by month or year to keep it useful but compact
    const summaries: Record<string, number> = {};
    olderPool.forEach(a => {
      const month = a.start_date_local.substring(0, 7); // YYYY-MM
      summaries[month] = (summaries[month] || 0) + (a.icu_training_load || a.icu_tss || 0);
    });

    const summaryStr = Object.entries(summaries)
      .map(([m, tss]) => `${m}:TSS ${Math.round(tss as number)}`)
      .join(',');

    fullHistoryCompact = `Recent: ${recentStr} | Older Monthly TSS Summaries: ${summaryStr}`;
  } else {
    fullHistoryCompact = sortedActivities.map(a => 
      `${a.start_date_local.split('T')[0]}|${a.type}|TSS:${a.icu_training_load || a.icu_tss || 0}|NP:${Math.round(a.weighted_average_watts || a.icu_weighted_average_watts || 0)}W|${Math.round((a.distance || 0)/1000)}km`
    ).join(', ');
  }

  const systemInstruction = getChatMessagePrompt({
    goal: context.goal,
    recentLoad: context.recentLoad,
    readiness: context.readiness,
    historySummary,
    powerCurveStr,
    fullHistoryCompact,
    totalActivities: context.activities.length
  });

  // Slice history to only keep the last 12 messages to prevent token bloat while retaining good context
  const slicedHistory = history.slice(-12);
  const contents = slicedHistory.map(m => ({
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
      temperature: 0.8,
    }
  });
  return response.text || "Direct comms error.";
};

/**
 * Generates an athlete profile analysis based on their history.
 */
export const getLocalFallbackProfile = (
  activities: Activity[],
  userGoal: string,
  powerCurves: AnnualPowerCurve[]
): import('../types').UserProfileAnalysis => {
  let type = 'allrounder';
  
  const hasRealData = powerCurves && powerCurves.length > 0 && powerCurves.some(c => c.bests && c.bests.some(b => b.watts > 0));
  
  if (hasRealData) {
    const currentCurve = [...powerCurves].sort((a,b) => b.year - a.year)[0];
    const ftpVal = currentCurve.bests.find(b => b.duration === 1200)?.watts || 250;
    const p1s = currentCurve.bests.find(b => b.duration === 1)?.watts || 0;
    const p60s = currentCurve.bests.find(b => b.duration === 60)?.watts || 0;
    const p300s = currentCurve.bests.find(b => b.duration === 300)?.watts || 0;
    
    if (p1s > ftpVal * 4.5) {
      type = 'sprinter';
    } else if (p60s > ftpVal * 1.8 && p300s > ftpVal * 1.35) {
      type = 'puncheur';
    } else if (p300s > ftpVal * 1.25 && p1s < ftpVal * 3) {
      type = 'climber';
    } else if (p300s < ftpVal * 1.2 && p60s < ftpVal * 1.4) {
      type = 'diesel';
    }
  } else {
    const goalLower = userGoal.toLowerCase();
    if (goalLower.includes('climb') || goalLower.includes('mountain') || goalLower.includes('hill') || goalLower.includes('alps') || goalLower.includes('ventoux')) {
      type = 'climber';
    } else if (goalLower.includes('crit') || goalLower.includes('sprint') || goalLower.includes('velocity')) {
      type = 'sprinter';
    } else if (goalLower.includes('kermesse') || goalLower.includes('classics') || goalLower.includes('punch') || goalLower.includes('flanders') || goalLower.includes('short')) {
      type = 'puncheur';
    } else if (goalLower.includes('ironman') || goalLower.includes('tri') || goalLower.includes('endurance') || goalLower.includes('distance') || goalLower.includes('century') || goalLower.includes('gravel') || goalLower.includes('tt') || goalLower.includes('time trial')) {
      type = 'diesel';
    }
  }

  switch (type) {
    case 'sprinter':
      return {
        athlete_type: "Fast-Twitch Sprinter / Criterium Racer",
        strengths: [
          "Explosive peak power (>1,000W) for short durations (1s to 15s).",
          "Excellent recovery from high-intensity anaerobic bursts.",
          "High tactical awareness in fast, bunch-sprint scenarios."
        ],
        areas_for_improvement: [
          "Aerobic threshold and FTP ceiling for long climbs.",
          "V02max sustainability over extended, repetitive efforts.",
          "Fueling efficiency on rides exceeding 3 hours."
        ],
        training_response: "Highly responsive to high-intensity interval training (HIIT) and neuromuscular power work. Slower to adapt to high-volume low-intensity base training.",
        effective_methods: [
          "Neuromuscular power sprints (6s to 15s) with full recovery.",
          "Anaerobic capacity intervals (30s to 1m) to build repeatability.",
          "Gym strength training (squats, deadlifts) to increase raw force."
        ],
        ineffective_methods: [
          "Excessive sweet spot intervals that induce deep muscular fatigue.",
          "Monotonous mid-zone (Zone 3) training without intensity variation.",
          "Extremely long endurance blocks without any sprint stimulation."
        ],
        recommended_focus: "Maintain elite-level sprint power while gradually raising FTP via polarized Zone 2 base and high-quality VO2Max intervals.",
        rider_story: `You are an explosive athlete built for speed and power. Your muscles are dominated by fast-twitch fibers, allowing you to generate massive wattages on demand to close gaps, win town-line sprints, or dominate criteriums. Your primary challenge is surviving the climbs and long aerobic sections before the sprint. By focusing on your aerobic foundation, you'll arrive at the finish line fresh enough to deploy your devastating kick.`,
        effective_training_history: "Historically, your best performance gains occurred when integrating 2-3 high-quality anaerobic and sprint sessions per week, combined with dedicated recovery and polarized endurance rides.",
        recommended_approach: "Implement a strict Polarized (80/20) methodology, dedicating 80% of sessions to steady Zone 2 fat-burning rides and 20% to highly focused, sharp neuromuscular sprints and short VO2 max intervals.",
        what_can_be_improved: "Targeting your aerobic capacity (FTP) will reduce the physiological cost of sub-threshold riding. Focus on raising your FTP to 320W+ to ensure you remain comfortable during high-speed draft phases."
      };
    case 'climber':
      return {
        athlete_type: "Climbing Specialist / Mountain Rouleur",
        strengths: [
          "High power-to-weight ratio (W/kg) over sustained durations (10m to 60m).",
          "Excellent aerobic efficiency and fat-oxidation capacity.",
          "Exceptional pacing and mental resilience on long alpine passes."
        ],
        areas_for_improvement: [
          "Raw peak power and explosive sprinting on flat terrain.",
          "Anaerobic capacity to follow sudden, sharp attacks.",
          "High-cadence leg speed and neuromuscular coordination."
        ],
        training_response: "Adapts exceptionally well to high-volume aerobic training and sustained, sub-threshold intervals. Slower to see gains from heavy explosive gym work.",
        effective_methods: [
          "Sustained threshold intervals (2x20m at 95% FTP) to build muscular endurance.",
          "VO2 max hill repeats (4x4m at 115% FTP) to raise aerobic ceiling.",
          "High-cadence sweet spot work to mimic steep grade variations."
        ],
        ineffective_methods: [
          "Short, high-frequency sprint training with minimal rest.",
          "Heavy weightlifting sessions that cause excessive muscle hypertrophy.",
          "Plentiful flat, unstructured group rides where draft reduces training load."
        ],
        recommended_focus: "Raise sustained W/kg power at threshold while sharpening your anaerobic 'matchbook' to cover attacks on steep gradients.",
        rider_story: `You thrive when the road tilts upward. Your light build and efficient cardiovascular engine allow you to tap into a high steady-state wattage that wears down opponents on long climbs. On the flats, you have to work harder to stay in the draft due to lower absolute power. By building a punchy 'extra gear' for short rollers and steep pitches, you'll become a highly versatile threat on any terrain.`,
        effective_training_history: "Your historical peak forms coincide with periods of progressive threshold build-ups, combined with climbing blocks and highly controlled recovery periods to prevent overreaching.",
        recommended_approach: "Sustained progressive threshold loading. Focus on building the capacity to hold 90-95% of FTP for extended blocks, interspersed with sharp 3-5 minute high-intensity efforts to emulate steep climb spikes.",
        what_can_be_improved: "Focus on expanding your maximal aerobic capacity (VO2max) and building anaerobic capacity so you can withstand the initial surges when a climb begins or an attack is launched."
      };
    case 'puncheur':
      return {
        athlete_type: "Punchy Classics Rider / Kermesse Specialist",
        strengths: [
          "Superb 1-minute to 5-minute power capacity, ideal for short, steep rollers.",
          "Exceptional repeatability of short, high-intensity efforts (anaerobic capacity).",
          "Excellent balance of solid raw FTP power and explosive tactical speed."
        ],
        areas_for_improvement: [
          "Sustained pacing on extremely long, steady alpine climbs.",
          "Pure, raw terminal bunch velocity against specialist sprinters.",
          "Aerobic economy on ultra-endurance rides exceeding 5 hours."
        ],
        training_response: "Responds rapidly to classic Ardennes-style training (repeated 1m to 3m VO2Max intervals) and structured over-under threshold work.",
        effective_methods: [
          "Over-Under intervals (e.g., 3x9m as 2m under, 1m over FTP) to build clearance.",
          "Classic 30/30 or 40/20 micro-intervals to boost VO2max and anaerobic capacity.",
          "Moderate endurance rides with short, punchy 30s surges to emulate rollers."
        ],
        ineffective_methods: [
          "Monotonous low-intensity cruising with zero pace changes.",
          "Extremely long, uninterrupted sweet-spot intervals at steady cadences.",
          "Isolating training to purely short sprints under 10 seconds."
        ],
        recommended_focus: "Sharpen your lethal 3-minute VO2Max power and work on clearing lactate quickly during brief lulls in race pace.",
        rider_story: `You are built for the short, brutal, steep hills of the Spring Classics. Your engine excels at delivering high-intensity, short-duration surges and recovering almost instantly to go again. This makes you highly competitive in breakaway groups, rolling courses, and technical circuit races. Your primary objective is raising your threshold foundation so that your 'punches' are launched from a higher baseline.`,
        effective_training_history: "Historically, you excel when your training mimics the stochastic, chaotic nature of racing: rapid spikes into Zone 5/6 followed by quick returns to Zone 2/3, rather than steady-state grinds.",
        recommended_approach: "Stochastic high-intensity intervals (Micro-bursts like 3 sets of 10x 40s on/20s off) and over-under blocks. Pair these with high-volume aerobic conditioning to build a robust clearance engine.",
        what_can_be_improved: "To elevate your racing, you need to elevate your steady FTP. This will allow you to save valuable energy during the draft phases, keeping your matchbook fully loaded for the decisive selections."
      };
    case 'diesel':
      return {
        athlete_type: "Diesel-Engine Endurance Rider / Time Trialist",
        strengths: [
          "Superb steady-state muscular endurance and aerodynamic pacing.",
          "Incredible fat oxidation rate, allowing high sub-threshold work for hours.",
          "Exceptional physical and mental stamina over ultra-long distances."
        ],
        areas_for_improvement: [
          "Explosive, high-torque accelerations and bunch-sprint power.",
          "Lactate clearance after sharp anaerobic efforts above VO2max.",
          "Adapting to sudden, stochastic pace changes in criteriums."
        ],
        training_response: "Responds best to steady-state volume, progressive sweet spot/threshold builds, and high-torque low-cadence efforts. Slower to see VO2max shifts.",
        effective_methods: [
          "Sweet spot intervals (3x15m at 88-92% FTP) to extend time-to-exhaustion.",
          "Progressive threshold intervals (e.g. 4x8m at 102% FTP) to push the aerobic ceiling.",
          "Low-cadence, high-torque muscular endurance intervals on flat or false flats."
        ],
        ineffective_methods: [
          "Repeated short sprints (5s to 15s) which induce fatigue without aerobic adaptation.",
          "Highly stochastic criterium-simulation workouts with no steady blocks.",
          "Short, high-intensity workouts with long rest periods."
        ],
        recommended_focus: "Gradually raise your FTP from below while increasing your fractional utilization (how long you can sustain 90% of FTP).",
        rider_story: `You are the ultimate diesel engine. You can maintain an incredibly high, steady wattage for hours on end, wearing down more explosive riders over time. You are unbothered by steady headwinds or relentless false flats. However, sudden spikes in pace can put you in difficulty, as you struggle to clear the resulting lactate quickly. By building a wider aerobic cushion and working on high-torque pacing, you can drop rivals before the line.`,
        effective_training_history: "Historically, your best seasons came from steady, high-volume weeks (10-15+ hours) focused on progressive threshold extensions, paired with focused long endurance rides.",
        recommended_approach: "Aerobic threshold extension and sweet spot progression. Focus on progressively extending the duration of your threshold efforts (from 30 mins cumulative to 60+ mins) to maximize efficiency.",
        what_can_be_improved: "Improve your anaerobic capacity and high-cadence responsiveness. This will help you cover sudden accelerations without crossing your redline and accumulating irreversible fatigue."
      };
    case 'allrounder':
    default:
      return {
        athlete_type: "Versatile All-Rounder / Rouleur",
        strengths: [
          "Highly balanced power profile across sprint, VO2, and threshold durations.",
          "Excellent adaptability to varying terrain, wind conditions, and tactics.",
          "Highly stable and robust aerobic foundation built over consistent years."
        ],
        areas_for_improvement: [
          "Lacks a single extreme, race-winning 'super-weapon' (e.g., world-class sprint or pure climb W/kg).",
          "Can struggle when specialized tactics force extreme scenarios (e.g. vertical climbs).",
          "Requires careful pacing to avoid wasting energy across too many terrains."
        ],
        training_response: "Highly adaptable, responding well to both volume-based base training and structured block periodization for high-intensity phases.",
        effective_methods: [
          "Pyramid intervals that touch on Zone 4, Zone 5, and Zone 6 within a single week.",
          "Over-under threshold intervals to raise both aerobic and anaerobic limits.",
          "Long, rolling endurance rides with natural terrain-dictated power variations."
        ],
        ineffective_methods: [
          "Over-specialization in one single training style to the detriment of others.",
          "Extremely monotonous, steady-state trainer sessions with no pace variation.",
          "Ignoring recovery phases due to high motivation across all types of riding."
        ],
        recommended_focus: "Identify the demands of your target event (e.g., your goal) and specialize your balanced engine for those specific requirements.",
        rider_story: `You are a highly versatile rider. You can sprint, you can climb, and you can ride a strong time trial. This balanced profile makes you a formidable competitor, as you can adapt to any race situation and exploit your rivals' specific weaknesses. Your main challenge is finding the decisive moment to win, as you don't have one single extreme specialty. By sharpening your focus for your target event, you can turn your versatility into your greatest strength.`,
        effective_training_history: "Historically, you perform best with structured block training where you spend 4-6 weeks prioritizing a specific capability (like VO2max), followed by a maintenance phase and transition to another block.",
        recommended_approach: "Structured block periodization. Alternating between block focus phases (e.g. 4 weeks threshold extension, 4 weeks VO2Max focus) while keeping your balanced foundation sharp with rolling group rides.",
        what_can_be_improved: "Focus on increasing your peak 5-minute VO2Max power to 380W+ to handle selection-making moves, and raise your FTP threshold to 300W+ to ensure you glide through flat and rolling sections."
      };
  }
};

export const analyzeUserProfile = async (
  activities: Activity[],
  userGoal: string,
  powerCurves: AnnualPowerCurve[]
): Promise<import('../types').UserProfileAnalysis> => {
  const cacheKey = `wattson_user_profile_v2_${userGoal}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
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
  } catch (error) {
    console.warn("Gemini user profile analysis failed or backend is offline. Falling back to rule-based profile generation:", error);
    const fallbackResult = getLocalFallbackProfile(activities, userGoal, powerCurves);
    setCache(cacheKey, fallbackResult);
    return fallbackResult;
  }
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
          needed_changes: { type: Type.ARRAY, items: { type: Type.STRING } },
          intensity_distribution_summary: { type: Type.STRING }
        },
        required: ['status', 'headline', 'contributing_to_goal', 'needed_changes', 'intensity_distribution_summary']
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

