
import { GoogleGenAI, Type } from "@google/genai";
import { Activity, ActivityInterval, CoachingFeedback, DailySuggestion, PlannedWorkout, ChatMessage, WeeklyBriefing, Wellness } from "../types";

/**
 * Fallback models based on guidelines.
 * Primary: Gemini 3 Flash (Fast/Modern)
 * Secondary: Flash Lite (Efficient)
 * Tertiary: Gemini 3 Pro (Robust reasoning if others fail)
 */
const FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-flash-lite-latest',
  'gemini-3-pro-preview'
];

/**
 * Initializes the Google GenAI client following strict guidelines.
 * Validates API key presence before initialization to prevent silent failures.
 */
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.length < 5) {
    throw new Error("Gemini API Key is missing or invalid. Please check your environment variables (process.env.API_KEY).");
  }
  return new GoogleGenAI({ apiKey });
};

const timeoutPromise = (ms: number) => new Promise<never>((_, reject) => 
  setTimeout(() => reject(new Error(`Operation timed out after ${ms/1000}s. Check your network connection.`)), ms)
);

/**
 * Robustly parses JSON from AI response.
 * Handles markdown formatting, loose text, and potential extraction errors.
 */
const safeParseJSON = (text: string | undefined): any => {
  if (!text) throw new Error("Received empty response from the AI coach.");
  
  // Clean potential markdown blocks
  let cleanText = text.replace(/```json\n?|```/g, "").trim();
  
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // Attempt brute-force extraction if standard parse fails
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');

    let start = -1;
    let end = -1;
    
    // Determine the most likely JSON boundary
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
        console.warn("Deep extraction failed for:", extracted);
      }
    }

    throw new Error("Coach provided a non-standard response format. Please try again.");
  }
};

/**
 * Executes an AI operation with automatic model fallback and timeout management.
 * Crucial for mobile stability where specific models might be unreachable or slow.
 */
async function executeWithFallback<T>(
  operationCallback: (model: string) => Promise<T>
): Promise<T> {
  let lastError: any = null;
  // Use a longer timeout for mobile networks (30s)
  const TIMEOUT_MS = 30000;

  for (const model of FALLBACK_MODELS) {
    try {
      console.log(`WaTTson: Attempting analysis with ${model}...`);
      return await Promise.race([
        operationCallback(model),
        timeoutPromise(TIMEOUT_MS)
      ]);
    } catch (err: any) {
      console.warn(`WaTTson: Model [${model}] failed:`, err.message || err);
      lastError = err;
      
      // If it's a 401/403 (Auth error), don't bother retrying other models
      if (err.message?.includes('401') || err.message?.includes('403') || err.message?.includes('API key')) {
        break;
      }
      
      // Optional: Small delay before fallback retry to allow network to settle
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  const errorMessage = lastError?.message || "All coaching models failed to respond.";
  throw new Error(`AI Connection Error: ${errorMessage}`);
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
  
  const prompt = `You are WaTTson, a high-performance cycling coach. 
    Analyze this ride: "${activity.name}" (TSS: ${load}, Duration: ${durationMins}m).
    Context: User goal is "${userGoal || 'Improve overall cycling fitness'}".
    Analyze the load relative to the goal and suggest the next training phase.
    Return JSON with: summary (concise), highlights[] (list of positives), recommendations (actionable next step), metrics_analysis (technical breakdown).`;

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

  // Build a timeline of the last 14 days for the coach
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

  const prompt = `As a cycling coach, evaluate the recent 14-day history and the user's focus: "${userGoal || 'Fitness Improvement'}".
    CURRENT DATE: ${todayStr}
    HISTORY LOG:
    ${timeline}
    
    Provide two workout options for today based on readiness and fatigue trends.
    Return JSON matching the DailySuggestion interface.`;

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
          required: ['readiness_score', 'readiness_analysis', 'reasoning', 'primary', 'alternative']
        }
      }
    });
    const parsed = safeParseJSON(response.text);
    return { ...parsed, date: todayStr };
  });
};

// Fix: Completed the missing implementation for getWeeklyBriefing
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

  const prompt = `Generate a 7-day cycling training outlook starting from ${todayName}.
    Context:
    Goal: ${userGoal}
    Current Fitness (CTL): ${ctl.toFixed(1)}
    Current Freshness (TSB): ${tsb.toFixed(1)}
    
    The plan must start TODAY. The first day's suggestion is: "${todaySuggestionTitle || 'Active Recovery'}".
    For each day, provide a 'why' explanation based on training science (supercompensation, progressive overload, or recovery).
    Return JSON with phase, focus, outlook_summary, and days[].`;

  return executeWithFallback(async (modelName) => {
    // Calling generateContent with the model name and prompt as per guidelines.
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

/**
 * Sends a message to the AI coach with historical context and athlete status.
 */
// Fix: Added the missing sendChatMessage function export used in App.tsx
export const sendChatMessage = async (
  history: ChatMessage[],
  message: string,
  context: { goal: string; recentLoad: number; readiness: number }
): Promise<string> => {
  const ai = getAI();
  const systemInstruction = `You are WaTTson, a world-class cycling coach and sports scientist.
    User Goal: ${context.goal}
    Current 7-Day Load: ${context.recentLoad} TSS
    Readiness Score: ${context.readiness}/10
    
    Answer the user's questions with a focus on data-driven cycling performance. 
    Be supportive but professional. If they ask about medical issues, advise consulting a doctor.`;

  // Format history for context to ensure model has continuity
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
    // Returning response.text property directly as per SDK guidelines.
    return response.text || "I'm sorry, I couldn't process that request.";
  });
};
