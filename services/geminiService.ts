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
  AnnualPowerCurve
} from "../types";


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
  // 1. gemini-3-flash-preview (Standard Flash)
  // 2. gemini-3.1-flash-lite (Unlimited tokens/Last robust fallback)
  const models = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'];
  
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
      // If it's a quota issue (429) or other retryable error, we continue to the next model
      if (error?.message?.includes('429') || error?.message?.includes('quota')) {
        continue;
      }
      // If it's a structural error that won't be fixed by changing models, we might want to stop, 
      // but the requirement is "last and most robust fallback", so we continue.
    }
  }
  throw lastError || new Error("All Gemini models failed.");
};

/**
 * Analyzes a specific cycling activity and provides coaching feedback.
 */
export const getRideFeedback = async (
  activity: Activity, 
  intervals: ActivityInterval[],
  plannedWorkout: PlannedWorkout | null,
  userGoal?: string,
  ftp?: number
): Promise<CoachingFeedback> => {
  const cacheKey = `wattson_feedback_${activity.id}_${userGoal || 'default'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const plannedWorkoutCtx = plannedWorkout 
    ? `Planned Workout: "${plannedWorkout.name}". Description: "${plannedWorkout.description}".`
    : "No planned workout for this ride.";

  const prompt = `You are waTTson, an elite cycling coach. 
    Analyze this ride: "${activity.name}". 
    TSS: ${activity.icu_training_load || activity.icu_tss || activity.training_load || 0}. 
    Intensity: ${activity.icu_intensity || 0}.
    efTP: ${activity.icu_eftp || 'N/A'}W.
    Duration: ${Math.round((activity.moving_time || activity.elapsed_time || 0) / 60)}m.
    Power: ${Math.round(activity.average_watts || activity.icu_average_watts || 0)}W avg, ${Math.round(activity.weighted_average_watts || activity.icu_weighted_average_watts || 0)}W np.
    HR: ${Math.round(activity.average_heartrate || 0)}bpm avg.
    Goal: ${userGoal || 'Fitness'}.
    
    ${plannedWorkoutCtx}
    
    Return JSON with:
    summary: A 1-sentence punchy coaching summary.
    goal_contribution: A clear explanation of how this session contributes to ${userGoal}.
    workout_steps: If a planned workout exists, provide the structured steps intended for this workout. 
      Steps should include duration (mins), target_watts (W), and label.
      Use ${ftp ? `athlete FTP: ${ftp}W` : 'sensible intensity levels'} for absolute targets where appropriate.`;

  const response = await callGemini({
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          goal_contribution: { type: Type.STRING },
          workout_steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                duration: { type: Type.NUMBER },
                target_watts: { type: Type.NUMBER },
                label: { type: Type.STRING }
              },
              required: ['duration', 'label']
            }
          }
        },
        required: ['summary', 'goal_contribution']
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

  const prompt = `You are waTTson, an elite cycling coach. Suggest a workout for ${targetStr}. 
    History (7d): ${history}. 
    Goal: "${userGoal}". 
    
    CRITICAL: 
    1. For each workout option (primary and alternative), you MUST provide structured "workout_steps".
    2. "workout_steps" MUST be an array of objects with {duration: number, target_watts: number, label: string}.
    3. Estimate "tss" (Training Stress Score) as a number for each workout.
    4. Use ${ftp ? `athlete FTP: ${ftp}W` : 'sensible intensity levels'} for absolute targets where appropriate.
    5. Do NOT include any JSON comments.
    6. "readiness_score" must be 1-10.`;

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
                  required: ['duration', 'label']
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
                  required: ['duration', 'label']
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
 * Generates a 7-day training outlook based on physiology and goals.
 */
export const getWeeklyBriefing = async (
  recentActivities: Activity[], 
  wellness: Wellness[], 
  userGoal?: string,
  startContext?: string,
  ftp?: number,
  powerCurves?: AnnualPowerCurve[],
  planContext?: string,
  force?: boolean
): Promise<WeeklyBriefing> => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Include startContext and planContext in cache key to ensure it rotates if the "already had a ride" status changes or directives change
  const contextHash = (startContext || '') + (planContext || '');
  const cacheKey = `wattson_weekly_${todayStr}_${userGoal || 'default'}_${contextHash ? btoa(contextHash).slice(0, 10) : 'no-ctx'}`;
  
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

  // Generate the actual list of days to enforce order
  const dayNames: string[] = [];
  const tempDate = new Date();
  // If startContext contains "Plan MUST start from TOMORROW", we shift the dayNames generator
  const startsTomorrow = startContext?.includes("TOMORROW");
  if (startsTomorrow) tempDate.setDate(tempDate.getDate() + 1);

  for (let i = 0; i < 7; i++) {
    dayNames.push(tempDate.toLocaleDateString('en-US', { weekday: 'long' }));
    tempDate.setDate(tempDate.getDate() + 1);
  }

  const prompt = `Plan 7-day outlook. Goal: ${userGoal}. Stats: ${stats}. ${startContext || ''}. 
    ${planContext ? `IMPORTANT COACHING DIRECTIVES: ${planContext}` : ''}
    ${pcCtx}
    CRITICAL: You MUST provide a plan for exactly these 7 days in this EXACT order: ${dayNames.join(', ')}.
    The first day in the "days" array MUST be ${dayNames[0]}.
    For each non-Rest day, suggest structural steps in "workout_steps".
    Steps should include duration (mins), target_watts (W), and label.
    Use ${ftp ? `athlete FTP: ${ftp}W` : 'sensible intensity levels'} for watts, referencing the power profile if provided.
    Return JSON with phase, focus, outlook_summary, days[].`;

  const response = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
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
                      label: { type: Type.STRING }
                    }
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
  const result = safeParseJSON(response.text);
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
    `${a.start_date_local.split('T')[0]}: ${a.name}, ${Math.round((a.distance || 0)/1000)}km, TSS ${a.icu_training_load || a.icu_tss || 0}`
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
      `${a.start_date_local.split('T')[0]}|TSS:${a.icu_training_load || a.icu_tss || 0}|efTP:${a.icu_eftp || 'N/A'}W`
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
      `${a.start_date_local.split('T')[0]}|${a.type}|TSS:${a.icu_training_load || a.icu_tss || 0}|efTP:${a.icu_eftp || 'N/A'}W|${Math.round((a.distance || 0)/1000)}km`
    ).join(', ');
  }

  const systemInstruction = `You are waTTson, a direct cycling coach. 
    Concise text-style replies (1-3 sentences). 
    User Goal: ${context.goal}. 
    Current Load (7d): ${context.recentLoad}, Readiness: ${context.readiness}.
    Recent History (Full details):
    ${historySummary}
    
    Athlete Annual Power Bests:
    ${powerCurveStr}
    
    Full Historical Data (Date|Type|TSS|Distance):
    ${fullHistoryCompact}
    Total activities available: ${context.activities.length}.
    Always answer accurately based on this full data set.
    
    PLAN ADAPTATION: If the user asks to change their future training plan (e.g. "more intensity", "day off tomorrow", "focus on hill climbs"), you can "agree" and then append a hidden tag at the end of your message in the format: [UPDATE_PLAN: actual technical directive for the weekly builder]. 
    Example: "I've added more VO2 intervals to your week. [UPDATE_PLAN: Increase intensity for Tuesday/Thursday and add 1 short VO2 session]". 
    Keep the technical directive brief and clear for the next generation.`;

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
  const cacheKey = `wattson_user_profile_${userGoal}`;
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

  const prompt = `You are waTTson, an elite cycling coach. Analyze this athlete's data and create a profile.
    Goal: ${userGoal}
    
    Athlete Annual Power Bests:
    ${powerCurveStr}
    
    Recent 30 Rides:
    ${historySummary}
    
    Return JSON with:
    athlete_type: e.g. "Sprint Specialist", "Endurance Diesel", etc.
    strengths: array of 2-3 strings describing what they are good at.
    areas_for_improvement: array of 2-3 strings.
    training_response: String explaining how this user reacts to past training methods (e.g. "You adapt well to high volume but struggle with back-to-back VO2max sessions").
    effective_methods: array of 2 strings of methods that worked well (e.g. "Long Z2 rides", "Polarized training").
    ineffective_methods: array of 2 strings of methods that caused stagnation or excessive fatigue.
    recommended_focus: 1-sentence recommendation going forward.`;

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
          recommended_focus: { type: Type.STRING }
        },
        required: ['athlete_type', 'strengths', 'areas_for_improvement', 'training_response', 'effective_methods', 'ineffective_methods', 'recommended_focus']
      }
    }
  });
  
  const result = safeParseJSON(response.text);
  setCache(cacheKey, result);
  return result;
};
