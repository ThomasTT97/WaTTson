
import { GoogleGenAI, Type } from "@google/genai";
import { Activity, ActivityInterval, CoachingFeedback, DailySuggestion, PlannedWorkout, ChatMessage, WeeklyBriefing, Wellness } from "../types";

/**
 * Model priority list. 
 * 'gemini-3-flash-preview' is the current recommended standard.
 * 'gemini-flash-lite-latest' is used as a fallback for high-availability/quota issues.
 */
const FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-flash-lite-latest',
  'gemini-3-pro-preview'
];

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.length < 5) {
    throw new Error("Gemini API Key is missing. Check your environment settings.");
  }
  return new GoogleGenAI({ apiKey });
};

const timeoutPromise = (ms: number) => new Promise<never>((_, reject) => 
  setTimeout(() => reject(new Error(`Timed out after ${ms/1000}s.`)), ms)
);

const safeParseJSON = (text: string | undefined): any => {
  if (!text) throw new Error("Empty response from AI.");
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
      } catch {}
    }
    throw new Error("Invalid JSON format from AI.");
  }
};

/**
 * Executes an AI operation with intelligent fallback.
 * Specifically catches 429 (Quota Exceeded) errors to move to the next model.
 */
async function executeWithFallback<T>(
  operationCallback: (model: string) => Promise<T>
): Promise<T> {
  let lastError: any = null;
  const TIMEOUT_MS = 25000;

  for (const model of FALLBACK_MODELS) {
    try {
      return await Promise.race([
        operationCallback(model),
        timeoutPromise(TIMEOUT_MS)
      ]);
    } catch (err: any) {
      console.warn(`WaTTson: ${model} failed. Attempting next.`, err.message);
      lastError = err;
      
      const isQuotaError = err.message?.includes('429') || err.message?.toLowerCase().includes('quota');
      const isAuthError = err.message?.includes('401') || err.message?.includes('403');
      
      if (isAuthError) break;
      // If it's a quota error, we immediately try the next model
      if (isQuotaError) continue;
      
      // Short delay for non-quota errors
      await new Promise(r => setTimeout(r, 400));
    }
  }
  
  throw new Error(lastError?.message || "All AI models are currently unavailable.");
}

export const getRideFeedback = async (
  activity: Activity, 
  intervals: ActivityInterval[],
  plannedWorkout: PlannedWorkout | null,
  userGoal?: string
): Promise<CoachingFeedback> => {
  const ai = getAI();
  const prompt = `You are WaTTson, an elite cycling coach. 
    Analyze this ride: "${activity.name}". 
    TSS: ${activity.icu_training_load || 0}. 
    Duration: ${Math.round(activity.moving_time / 60)} mins.
    User Goal: ${userGoal || 'Fitness Improvement'}.
    
    Return JSON with:
    summary: 1-2 sentences of praise or focus.
    highlights: Array of 3 key achievements from this ride.
    recommendations: Clear "what to do tomorrow" advice.
    metrics_analysis: Breakdown of intensity and consistency.`;

  return executeWithFallback(async (modelName) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: { type: Type.STRING },
            metrics_analysis: { type: Type.STRING }
          },
          required: ['summary', 'highlights', 'recommendations', 'metrics_analysis']
        }
      }
    });
    return safeParseJSON(response.text);
  });
};

export const getDailySuggestion = async (recentActivities: Activity[], userGoal?: string): Promise<DailySuggestion> => {
  const ai = getAI();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Provide only essential history to save tokens and avoid noise
  const history = recentActivities
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
    .slice(0, 10)
    .map(a => `${a.start_date_local.split('T')[0]}: ${a.icu_training_load || 0} TSS`)
    .join(', ');

  const prompt = `Coach perspective: Based on 10-day history (${history}) and goal "${userGoal}", suggest today's workout for ${todayStr}.
    Respond ONLY in JSON. Use intensity: Low, Moderate, High, or Rest. Use type: intervals or endurance.`;

  return executeWithFallback(async (modelName) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
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
    return { ...parsed, date: todayStr };
  });
};

export const getWeeklyBriefing = async (
  recentActivities: Activity[], 
  wellness: Wellness[], 
  userGoal?: string,
  todaySuggestionTitle?: string
): Promise<WeeklyBriefing> => {
  const ai = getAI();
  const latestWellness = wellness[wellness.length - 1];
  const stats = `CTL: ${latestWellness?.ctl || 0}, TSB: ${latestWellness?.tsb || 0}`;

  const prompt = `Generate a 7-day outlook. Goal: ${userGoal}. Current: ${stats}. 
    First day: "${todaySuggestionTitle || 'Active Recovery'}".
    Return JSON with phase, focus, outlook_summary, and days[].`;

  return executeWithFallback(async (modelName) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
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
                  intensity: { type: Type.STRING },
                  why: { type: Type.STRING }
                },
                required: ['day', 'focus', 'load_target', 'intensity', 'why']
              }
            }
          },
          required: ['phase', 'focus', 'outlook_summary', 'days']
        }
      }
    });
    return safeParseJSON(response.text);
  });
};

export const sendChatMessage = async (
  history: ChatMessage[],
  message: string,
  context: { goal: string; recentLoad: number; readiness: number }
): Promise<string> => {
  const ai = getAI();
  const systemInstruction = `You are WaTTson, elite cycling coach. Goal: ${context.goal}. Recent Load: ${context.recentLoad} TSS. Readiness: ${context.readiness}/10. Keep answers professional and data-driven.`;

  const historyContext = history.map(m => `${m.role === 'user' ? 'User' : 'WaTTson'}: ${m.text}`).join('\n');
  const fullPrompt = `${historyContext}\nUser: ${message}`;

  return executeWithFallback(async (modelName) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });
    return response.text || "I'm sorry, I couldn't process that.";
  });
};
