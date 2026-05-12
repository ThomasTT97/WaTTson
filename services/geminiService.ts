import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Activity, ActivityInterval, CoachingFeedback, DailySuggestion, PlannedWorkout, ChatMessage, WeeklyBriefing, Wellness } from "../types";


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
 * Analyzes a specific cycling activity and provides coaching feedback.
 */
export const getRideFeedback = async (
  activity: Activity, 
  intervals: ActivityInterval[],
  plannedWorkout: PlannedWorkout | null,
  userGoal?: string
): Promise<CoachingFeedback> => {
  const cacheKey = `wattson_feedback_${activity.id}_${userGoal || 'default'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `You are waTTson, an elite cycling coach. 
    Analyze this ride: "${activity.name}". 
    TSS: ${activity.icu_training_load || activity.icu_tss || activity.training_load || 0}. 
    Intensity: ${activity.icu_intensity || 0}.
    Duration: ${Math.round((activity.moving_time || activity.elapsed_time || 0) / 60)}m.
    Power: ${Math.round(activity.average_watts || activity.icu_average_watts || 0)}W avg, ${Math.round(activity.weighted_average_watts || activity.icu_weighted_average_watts || 0)}W np.
    HR: ${Math.round(activity.average_heartrate || 0)}bpm avg.
    Goal: ${userGoal || 'Fitness'}.
    
    Return JSON with:
    summary: A 1-sentence punchy coaching summary.
    goal_contribution: A clear explanation of how this session contributes to ${userGoal}.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          goal_contribution: { type: Type.STRING }
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
export const getDailySuggestion = async (recentActivities: Activity[], userGoal?: string, forTomorrow: boolean = false): Promise<DailySuggestion> => {
  const targetDate = new Date();
  if (forTomorrow) targetDate.setDate(targetDate.getDate() + 1);
  
  const targetStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  const cacheKey = `wattson_suggestion_${targetStr}_${userGoal || 'default'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const history = recentActivities
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
    .slice(0, 7)
    .map(a => `${a.start_date_local.split('T')[0]}: ${a.icu_training_load || a.icu_tss || 0} TSS (${a.type})`)
    .join(', ');

  const prompt = `Coach: Suggest workout for ${targetStr}. History (7d): ${history}. Goal: "${userGoal}". JSON please. Ensure readiness_score is a number from 1 to 10.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
              type: { type: Type.STRING }
            },
            required: ['title', 'description', 'intensity', 'duration_minutes', 'type']
          },
          alternative: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              intensity: { type: Type.STRING },
              duration_minutes: { type: Type.NUMBER },
              type: { type: Type.STRING }
                },
            required: ['title', 'description', 'intensity', 'duration_minutes', 'type']
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
  ftp?: number
): Promise<WeeklyBriefing> => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Include startContext in cache key to ensure it rotates if the "already had a ride" status changes
  const contextHash = startContext ? btoa(startContext).slice(0, 10) : 'no-ctx';
  const cacheKey = `wattson_weekly_${todayStr}_${userGoal || 'default'}_${contextHash}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const latestWellness = wellness[wellness.length - 1];
  const stats = `CTL: ${latestWellness?.ctl || 0}, TSB: ${latestWellness?.tsb || 0}, ATL: ${latestWellness?.atl || 0}`;

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
    CRITICAL: You MUST provide a plan for exactly these 7 days in this EXACT order: ${dayNames.join(', ')}.
    The first day in the "days" array MUST be ${dayNames[0]}.
    For each non-Rest day, suggest structural steps in "workout_steps".
    Steps should include duration (mins), target_watts (W), and label.
    Use ${ftp ? `athlete FTP: ${ftp}W` : 'sensible intensity levels'} for watts.
    Return JSON with phase, focus, outlook_summary, days[].`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
  }
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Format a data summary for the AI
  const sortedActivities = [...context.activities].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local));
  const recentActivities = sortedActivities.slice(0, 5);
  
  const historySummary = recentActivities.map(a => 
    `${a.start_date_local.split('T')[0]}: ${a.name}, ${Math.round((a.distance || 0)/1000)}km, TSS ${a.icu_training_load || a.icu_tss || 0}`
  ).join('\n');

  // Compress full history for the LLM to access
  const fullHistoryCompact = sortedActivities.map(a => 
    `${a.start_date_local.split('T')[0]}|${a.type}|TSS:${a.icu_training_load || a.icu_tss || 0}|${Math.round((a.distance || 0)/1000)}km`
  ).join(', ');

  const systemInstruction = `You are waTTson, a direct cycling coach. 
    Concise text-style replies (1-3 sentences). 
    User Goal: ${context.goal}. 
    Current Load (7d): ${context.recentLoad}, Readiness: ${context.readiness}.
    Recent History (Full details):
    ${historySummary}
    
    Full Historical Data (Date|Type|TSS|Distance):
    ${fullHistoryCompact}
    Total activities available: ${context.activities.length}.
    Always answer accurately based on this full data set when the user asks about their past training, trends, or long-term history.`;

  const contents = history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
  userGoal: string
): Promise<import('../types').UserProfileAnalysis> => {
  const cacheKey = `wattson_user_profile_${userGoal}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const sortedActivities = [...activities].sort((a,b) => b.start_date_local.localeCompare(a.start_date_local));
  const recentActivities = sortedActivities.slice(0, 30);
  
  const historySummary = recentActivities.map(a => 
    `${a.start_date_local.split('T')[0]}: ${a.name}, Duration: ${Math.round((a.moving_time||0)/60)}m, TSS: ${a.icu_training_load || a.icu_tss || 0}, IF: ${a.icu_intensity||0}, Avg Power: ${a.average_watts}W`
  ).join('\n');

  const prompt = `You are waTTson, an elite cycling coach. Analyze this athlete's data and create a profile.
    Goal: ${userGoal}
    Recent 30 Rides:
    ${historySummary}
    
    Return JSON with:
    athlete_type: e.g. "Sprint Specialist", "Endurance Diesel", etc.
    strengths: array of 2-3 strings describing what they are good at.
    areas_for_improvement: array of 2-3 strings.
    training_response: String explaining how this user reacts to past training methods (e.g. "You adapt well to high volume but struggle with back-to-back VO2max sessions").
    recommended_focus: 1-sentence recommendation going forward.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
          recommended_focus: { type: Type.STRING }
        },
        required: ['athlete_type', 'strengths', 'areas_for_improvement', 'training_response', 'recommended_focus']
      }
    }
  });
  
  const result = safeParseJSON(response.text);
  setCache(cacheKey, result);
  return result;
};
