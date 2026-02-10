
import { GoogleGenAI, Type } from "@google/genai";
import { Activity, ActivityInterval, CoachingFeedback, DailySuggestion, PlannedWorkout, ChatMessage, WeeklyBriefing, Wellness } from "../types";

const FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-flash-lite-latest',
  'gemini-3-pro-preview'
];

const getAI = () => {
  const apiKey = (process.env.API_KEY as string) || '';
  return new GoogleGenAI({ apiKey });
};

const timeoutPromise = (ms: number) => new Promise<never>((_, reject) => 
  setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
);

/**
 * Robustly parses JSON from AI response, handling markdown blocks or unexpected text.
 */
const safeParseJSON = (text: string | undefined): any => {
  if (!text) throw new Error("Empty response from AI");
  
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');

    let start = -1;
    let end = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || (firstBrace < firstBracket && firstBrace !== -1))) {
      start = firstBrace;
      end = lastBrace;
    } else if (firstBracket !== -1) {
      start = firstBracket;
      end = lastBracket;
    }

    if (start !== -1 && end !== -1 && end > start) {
      const extracted = cleanText.substring(start, end + 1);
      try {
        return JSON.parse(extracted);
      } catch (innerError) {
        console.error("Extraction failed:", extracted);
      }
    }

    throw new Error("Analysis parsing failed.");
  }
};

async function executeWithFallback<T>(
  operationCallback: (model: string) => Promise<T>
): Promise<T> {
  let lastError: any = null;
  for (const model of FALLBACK_MODELS) {
    try {
      return await Promise.race([
        operationCallback(model),
        timeoutPromise(18000)
      ]);
    } catch (err: any) {
      console.warn(`Model [${model}] failed:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error("AI models failed.");
}

export const getRideFeedback = async (
  activity: Activity, 
  intervals: ActivityInterval[],
  plannedWorkout: PlannedWorkout | null,
  userGoal?: string
): Promise<CoachingFeedback> => {
  const ai = getAI();
  const load = activity.icu_training_load ?? activity.icu_tss ?? 0;
  const durationMins = Math.round(activity.moving_time / 60);
  
  const prompt = `You are a high-performance cycling coach. Analyze this ride and provide feedback in JSON.
    Ride Name: "${activity.name}"
    TSS Load: ${load}
    Duration: ${durationMins}m
    Goal: "${userGoal || 'Improve'}"
    Return JSON with: summary, highlights[], recommendations, metrics_analysis.`;

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

  const log: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    log[d.toISOString().split('T')[0]] = 0;
  }

  recentActivities.forEach(a => {
    const d = a.start_date_local.split('T')[0];
    if (log[d] !== undefined) log[d] += (a.icu_training_load ?? a.icu_tss ?? 0);
  });

  const timeline = Object.entries(log)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, load]) => `${date}: ${load} TSS`)
    .join('\n');

  const prompt = `As a cycling coach, analyze history and goal: "${userGoal || 'Improve performance'}".
    CURRENT DATE: ${todayStr}
    HISTORY:
    ${timeline}
    Return JSON matching DailySuggestion type.`;

  return executeWithFallback(async (modelName) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            readiness_score: { type: Type.NUMBER },
            readiness_analysis: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            primary: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                intensity: { type: Type.STRING, enum: ['Low', 'Moderate', 'High', 'Rest'] },
                duration_minutes: { type: Type.NUMBER },
                type: { type: Type.STRING, enum: ['intervals', 'endurance'] }
              },
              required: ['title', 'description', 'intensity', 'duration_minutes', 'type']
            },
            alternative: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                intensity: { type: Type.STRING, enum: ['Low', 'Moderate', 'High', 'Rest'] },
                duration_minutes: { type: Type.NUMBER },
                type: { type: Type.STRING, enum: ['intervals', 'endurance'] }
              },
              required: ['title', 'description', 'intensity', 'duration_minutes', 'type']
            }
          },
          required: ['date', 'readiness_score', 'readiness_analysis', 'reasoning', 'primary', 'alternative']
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
  const tsb = latestWellness?.tsb ?? 0;
  const ctl = latestWellness?.ctl ?? 0;

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  const todayName = daysOfWeek[today.getDay()];

  const prompt = `Generate a 7-day cycling training outlook.
    CRITICAL: 
    1. THE PLAN MUST START FROM TODAY (${todayName}).
    2. THE FIRST DAY (${todayName}) SUGGESTION MUST BE: "${todaySuggestionTitle || 'Appropriate session for readiness'}".
    3. FOR EACH DAY, INCLUDE A 'why' FIELD EXPLAINING THE SPECIFIC COACHING REASON FOR THAT RIDE.
    
    Goal: ${userGoal}
    CTL: ${ctl.toFixed(1)}, TSB: ${tsb.toFixed(1)}
    History: ${recentActivities.slice(0, 5).map(a => `${a.name}: ${a.icu_training_load}TSS`).join(', ')}
    
    Return JSON with phase, focus, outlook_summary, and days[] (day, focus, load_target, intensity, why).`;

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
                  intensity: { type: Type.STRING, enum: ['Low', 'Moderate', 'High', 'Rest'] },
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
  messages: ChatMessage[], 
  newMessage: string, 
  context: { goal?: string, recentLoad?: number, readiness?: number }
): Promise<string> => {
  const ai = getAI();
  const systemInstruction = `You are WaTTson, a cycling coach. Goal: ${context.goal}. Short/clear replies.`;

  return executeWithFallback(async (modelName) => {
    const chat = ai.chats.create({
      model: modelName,
      history: messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      config: { systemInstruction }
    });
    const response = await chat.sendMessage({ message: newMessage });
    return response.text || "Ride on!";
  });
};
