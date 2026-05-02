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
 * Analyzes a specific cycling activity and provides coaching feedback.
 */
export const getRideFeedback = async (
  activity: Activity, 
  intervals: ActivityInterval[],
  plannedWorkout: PlannedWorkout | null,
  userGoal?: string
): Promise<CoachingFeedback> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `You are WaTTson, an elite cycling coach. 
    Analyze this ride: "${activity.name}". 
    TSS: ${activity.icu_training_load || 0}. 
    Intensity: ${activity.icu_intensity || 0}.
    Duration: ${Math.round(activity.moving_time / 60)} mins.
    User Goal: ${userGoal || 'Overall fitness improvement'}.
    
    Return JSON with:
    summary: A 1-sentence punchy coaching summary.
    goal_contribution: A clear explanation of how this session contributes to ${userGoal}.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
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
  return safeParseJSON(response.text);
};

/**
 * Generates a daily workout suggestion based on recent history.
 */
export const getDailySuggestion = async (recentActivities: Activity[], userGoal?: string): Promise<DailySuggestion> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const history = recentActivities
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
    .slice(0, 10)
    .map(a => `${a.start_date_local.split('T')[0]}: ${a.icu_training_load || 0} TSS`)
    .join(', ');

  const prompt = `Coach perspective: Based on 10-day history (${history}) and goal "${userGoal}", suggest today's workout for ${todayStr}.
    Respond ONLY in JSON.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
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
  return { ...parsed, date: todayStr };
};

/**
 * Generates a 7-day training outlook based on physiology and goals.
 */
export const getWeeklyBriefing = async (
  recentActivities: Activity[], 
  wellness: Wellness[], 
  userGoal?: string,
  startContext?: string
): Promise<WeeklyBriefing> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const latestWellness = wellness[wellness.length - 1];
  const stats = `CTL: ${latestWellness?.ctl || 0}, TSB: ${latestWellness?.tsb || 0}`;

  const prompt = `Generate a 7-day outlook. Goal: ${userGoal}. Current: ${stats}. 
    ${startContext || ''}
    Return JSON with phase, focus, outlook_summary, and days[].`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
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
                duration_target: { type: Type.NUMBER },
                intensity: { type: Type.STRING },
                why: { type: Type.STRING }
              },
              required: ['day', 'focus', 'load_target', 'duration_target', 'intensity', 'why']
            }
          }
        },
        required: ['phase', 'focus', 'outlook_summary', 'days']
      }
    }
  });
  return safeParseJSON(response.text);
};

/**
 * Sends a message to the coach bot and retrieves a text response.
 */
export const sendChatMessage = async (
  history: ChatMessage[],
  message: string,
  context: { goal: string; recentLoad: number; readiness: number }
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const systemInstruction = `You are WaTTson, a direct and expert cycling coach. 
    Speak punchy and concise. NO long paragraphs. 
    Keep every reply under 2-3 sentences max. 
    Respond like a busy coach sending a quick WhatsApp/text. 
    Focus: ${context.goal}. Metrics: 7D Load ${context.recentLoad}, Readiness ${context.readiness}/10.`;

  const contents = history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents,
    config: {
      systemInstruction,
      temperature: 0.8,
    }
  });
  return response.text || "Direct comms error.";
};
