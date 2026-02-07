
import { GoogleGenAI, Type } from "@google/genai";
import { Activity, ActivityInterval, CoachingFeedback, DailySuggestion, PlannedWorkout, ChatMessage } from "../types";

// Hierarchy of models to try if one fails (Quota/Rate Limits)
const FALLBACK_MODELS = [
  'gemini-3-flash-preview',  // Primary: Fast & Intelligent
  'gemini-flash-lite-latest', // Fallback 1: Extremely fast, lower quota usage
  'gemini-3-pro-preview'      // Fallback 2: Powerful, use if Flash is fully exhausted
];

// Helper to get AI instance safely. 
const getAI = () => {
  const apiKey = (process.env.API_KEY as string) || '';
  if (!apiKey) {
    console.warn("API_KEY is missing in environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

// Timeout helper (12 seconds default)
const timeoutPromise = (ms: number) => new Promise<never>((_, reject) => 
  setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
);

/**
 * Executes a Gemini API call with automatic fallback to other models on failure.
 * Includes a timeout to prevent hanging on unresponsive models.
 * @param operationCallback Function that takes a model name and returns a Promise (the API call)
 */
async function executeWithFallback<T>(
  operationCallback: (model: string) => Promise<T>
): Promise<T> {
  let lastError: any = null;

  for (const model of FALLBACK_MODELS) {
    try {
      // Race the operation against a timeout to ensure responsiveness
      return await Promise.race([
        operationCallback(model),
        timeoutPromise(12000) // 12s timeout per model
      ]);
    } catch (err: any) {
      console.warn(`Gemini Model [${model}] failed/timed out:`, err.message);
      lastError = err;
      
      // If it's a specific auth error (bad key), fail fast. 
      // 429 (Quota), 503 (Overloaded), or Timeout errors should trigger fallback.
      if (err.status === 400 || err.status === 403) {
        throw err;
      }
      // Otherwise loop to next model
    }
  }

  throw lastError || new Error("All AI models failed to respond.");
}

export const getRideFeedback = async (
  activity: Activity, 
  intervals: ActivityInterval[],
  plannedWorkout: PlannedWorkout | null,
  userGoal?: string
): Promise<CoachingFeedback> => {
  const ai = getAI();
  
  // Use correct load field
  const load = activity.icu_training_load ?? activity.icu_tss ?? 0;
  const durationMins = Math.round(activity.moving_time / 60);
  
  // Format intervals for the AI
  const meaningfulIntervals = intervals.filter(i => i.moving_time > 30);
  
  const intervalSummary = meaningfulIntervals.length > 0 
    ? meaningfulIntervals.map((i, idx) => {
        const mins = Math.round(i.moving_time / 60 * 10) / 10;
        return `Lap ${idx + 1} [${i.type}]: ${mins}m @ ${i.average_watts}W (HR: ${i.average_heartrate}bpm)`;
      }).join('\n')
    : "No structured laps recorded.";

  // Prepare Planned Workout Section
  let planSection = "No structured workout was planned for this day.";
  let comparisonInstruction = "Analyze the ride based on the physiological data.";
  
  if (plannedWorkout) {
    planSection = `
    PLANNED WORKOUT:
    - Name: "${plannedWorkout.name}"
    - Description/Structure: "${plannedWorkout.description}"
    - Target Load (TSS): ${plannedWorkout.icu_training_load}
    - Target Duration: ${Math.round(plannedWorkout.moving_time / 60)} min
    `;
    comparisonInstruction = "CRITICAL: Compare the executed ride against the 'PLANNED WORKOUT' above. Did they follow the structure? Did they hit the intensity targets? If they deviated, explain how.";
  }

  // Goal Context
  const goalContext = userGoal 
    ? `ATHLETE GOAL: "${userGoal}". \nIMPORTANT: Frame your analysis and recommendations specifically to help the athlete achieve this goal.`
    : "";

  const prompt = `As an elite cycling coach, analyze this training activity.
    
    ${goalContext}
    
    ${comparisonInstruction}

    Use the metrics and lap data provided below to verify if the rider adhered to the plan (if one exists) or what physiological benefit they gained.

    RIDE METRICS (Executed):
    - Activity Name: "${activity.name}"
    - Total Load (TSS): ${load}
    - Total Duration: ${durationMins} minutes
    - Avg Power: ${activity.average_watts || 'N/A'} W
    - Avg Heart Rate: ${activity.average_heartrate || 'N/A'} bpm
    - Intensity Factor: ${activity.icu_intensity || 'N/A'}

    RECORDED LAPS (Executed Intervals):
    ${intervalSummary}

    ${planSection}

    Provide feedback in JSON format with these exact keys:
    - summary: A short, data-driven description of what happened. If a plan existed, mention if it was executed correctly. Relate it back to the ATHLETE GOAL if provided.
    - highlights: An array of 3 specific observations.
    - recommendations: Specific advice based on this performance.
    - metrics_analysis: A deep dive into the numbers. Explicitly compare executed vs planned load/intensity if a plan was present.`;

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
    return JSON.parse(response.text as string);
  });
};

export const getDailySuggestion = async (recentActivities: Activity[], userGoal?: string): Promise<DailySuggestion> => {
  const ai = getAI();
  
  const summary = recentActivities.map(a => ({
    date: a.start_date_local.split('T')[0],
    load: a.icu_training_load ?? a.icu_tss ?? 0,
    intensity: a.icu_intensity
  }));

  const goalContext = userGoal 
    ? `The athlete's primary training goal is: "${userGoal}". Ensure the suggested workout directly contributes to this goal.`
    : "";

  const prompt = `As a cycling coach, analyze the last 30 days of training load data for this athlete: ${JSON.stringify(summary)}.
    
    ${goalContext}

    1. Calculate a "Readiness Score" from 0-10 based on recent fatigue (high load recently = low readiness).
    2. Provide a brief "Health / Readiness Analysis" sentence (e.g., "High fatigue detected from recent block, prioritize recovery" or "Fresh and ready for high intensity").
    3. Suggest the SINGLE best specific workout for today based on this readiness AND the athlete's goal.

    Provide the response in JSON format.`;

  return executeWithFallback(async (modelName) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Name of the workout" },
            description: { type: Type.STRING, description: "Specific workout structure details" },
            intensity: { type: Type.STRING, enum: ['Low', 'Moderate', 'High', 'Rest'] },
            duration_minutes: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            readiness_score: { type: Type.NUMBER, description: "0 to 10, where 10 is fully fresh" },
            readiness_analysis: { type: Type.STRING, description: "Short health/readiness status update" }
          },
          required: ['title', 'description', 'intensity', 'duration_minutes', 'reasoning', 'readiness_score', 'readiness_analysis']
        }
      }
    });
    return JSON.parse(response.text as string);
  });
};

export const sendChatMessage = async (
  previousMessages: ChatMessage[], 
  newMessage: string, 
  contextData: { goal?: string, recentLoad?: number, readiness?: number }
): Promise<string> => {
  const ai = getAI();
  
  // Construct system instruction with context
  const systemInstruction = `You are WaTTson, a friendly, intelligent, and human-like cycling coach. 
  
  CONTEXT:
  - Athlete's Goal: ${contextData.goal || 'Not set'}
  - Recent 7-day Load: ${contextData.recentLoad || 0} TSS
  - Readiness Score: ${contextData.readiness || 'Unknown'}/10

  GUIDELINES:
  1. Be natural and conversational. Avoid sounding like a robot.
  2. Keep answers short and punchy (2-3 sentences max usually).
  3. Don't use bullet points unless you are listing 3+ distinct items.
  4. Occasionally ask a relevant follow-up question to keep the athlete engaged.
  5. Use the provided data to ground your advice.
  6. No medical advice.`;

  const history = previousMessages.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  // Wrapper to create a new chat session for each attempt (since sessions are model-bound)
  return executeWithFallback(async (modelName) => {
    const chat = ai.chats.create({
      model: modelName,
      history: history,
      config: {
        systemInstruction: systemInstruction,
      }
    });
    const response = await chat.sendMessage({ message: newMessage });
    return response.text || "I'm not sure about that, but let's keep training!";
  });
};
