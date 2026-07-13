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
  RecoveryAdvice
} from "../types";
import {
  getRideFeedbackPrompt,
  getDailySuggestionPrompt,
  getWeeklyBriefingPrompt,
  getChatMessagePrompt,
  getUserProfilePrompt
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
  const cacheKey = `wattson_feedback_v2_${activity.id}_${userGoal || 'default'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const plannedWorkoutCtx = plannedWorkout 
    ? `Planned Workout: "${plannedWorkout.name}". Description: "${plannedWorkout.description}".`
    : "No planned workout for this ride.";

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
export const getDailySuggestion = async (recentActivities: Activity[], userGoal?: string, forTomorrow: boolean = false, ftp?: number): Promise<DailySuggestion> => {
  const targetDate = new Date();
  if (forTomorrow) targetDate.setDate(targetDate.getDate() + 1);
  
  const targetStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  const cacheKey = `wattson_suggestion_${targetStr}_${userGoal || 'default'}`;
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
    hrStatsText: ""
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
  triathlonMode?: boolean
): Promise<WeeklyBriefing> => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Include startContext and planContext in cache key to ensure it rotates if the "already had a ride" status changes or directives change
  const contextHash = (startContext || '') + (planContext || '');
  
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

  const cacheKey = `wattson_weekly_${todayStr}_${userGoal || 'default'}_${planMode}_${triathlonMode ? 'tri' : 'cyc'}_${contextHash ? safeHash(contextHash) : 'no-ctx'}`;
  
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
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
  const totalDays = week1Length + 21; // Week 1 (shorter) + 3 full weeks (21 days)

  for (let i = 0; i < totalDays; i++) {
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
    triathlonMode
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
  const result = safeParseJSON(response.text) as WeeklyBriefing;
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
  // For histories > 200 items, we summarize older ones to stay concise while maintaining the "full history" awareness
  let fullHistoryCompact = '';
  if (sortedActivities.length > 200) {
    const recentPool = sortedActivities.slice(0, 100);
    const olderPool = sortedActivities.slice(100);
    
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

    fullHistoryCompact = `Recent: ${recentStr} | Older Summaries: ${summaryStr}`;
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
      temperature: 0.8,
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

