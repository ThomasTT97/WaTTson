/**
 * Centralized registry for all LLM prompts used across the waTTson application.
 * This file provides a clear overview of what is asked of the Gemini models.
 */

interface RideFeedbackParams {
  activityName: string;
  tss: number;
  intensity: number;
  eftp: string | number;
  durationMins: number;
  avgPower: number;
  npPower: number;
  avgHr: number;
  userGoal: string;
  plannedWorkoutCtx: string;
  ftp?: number;
  hasPowerOnMostRides?: boolean;
  hrStatsText?: string;
}

interface DailySuggestionParams {
  targetStr: string;
  history: string;
  userGoal: string;
  ftp?: number;
  hasPowerOnMostRides?: boolean;
  hrStatsText?: string;
}

interface WeeklyBriefingParams {
  userGoal: string;
  stats: string;
  startContext?: string;
  planContext?: string;
  pcCtx: string;
  dayNames: string[];
  ftp?: number;
  hasPowerOnMostRides?: boolean;
  hrStatsText?: string;
}

interface ChatMessageParams {
  goal: string;
  recentLoad: number;
  readiness: number;
  historySummary: string;
  powerCurveStr: string;
  fullHistoryCompact: string;
  totalActivities: number;
}

interface UserProfileParams {
  userGoal: string;
  powerCurveStr: string;
  historySummary: string;
}

export const getRideFeedbackPrompt = (p: RideFeedbackParams): string => {
  const isHrBased = p.hasPowerOnMostRides === false;
  
  const ftpText = p.ftp 
    ? `The athlete's FTP is ${p.ftp}W. You MUST scale all recommended workout step power levels precisely as percentages of ${p.ftp}W. For example: Easy/Recovery should be 50-60% FTP (~${Math.round(p.ftp * 0.55)}W), Zone 2 Aerobic should be 60-75% FTP (~${Math.round(p.ftp * 0.68)}W), Tempo should be 75-90% FTP (~${Math.round(p.ftp * 0.82)}W), Threshold should be 90-105% FTP (~${Math.round(p.ftp * 0.98)}W), and Intervals/VO2max should be >105% FTP (~${Math.round(p.ftp * 1.2)}W).`
    : `The athlete's FTP is not specified. Assume a standard baseline FTP of 250W and scale all power/wattages relative to that baseline.`;

  const hrGuideline = isHrBased
    ? `CRITICAL - ATHLETE HAS NO POWER METER (HR-BASED INTENSITIES & TSS):
       The athlete does not have power data (watts) on most of their rides. Therefore, you MUST base all recommended intensities and stress scores (TSS) on the available heart rate (HR) data.
       1. Estimate all Training Stress Scores (TSS) using heart rate-based training stress score (hrTSS / HRSS) based on the effort's average and max HR.
       2. The 'label' for each workout step MUST specify HR-focused intensity targets or HR zones (e.g. "15 min Zone 2 HR (135-145 bpm)" or "10 min Threshold HR (155-165 bpm)") instead of power (e.g. NO "190w"). 
       3. Always use "min" for minutes consistently (e.g. "15 min", "5 min").
       4. Fill in 'target_watts' as a fallback estimated reference, but make sure the label is completely HR-focused.
       ${p.hrStatsText || ''}`
    : `${ftpText}
       For the 'label', use a descriptive format: for stable rides e.g. "5 min 180w", for intervals e.g. "3 times: 5 min 300w + 2 min 180w". Always use "min" for minutes consistently!`;

  return `You are waTTson, an elite cycling coach. 
    Analyze this ride: "${p.activityName}". 
    TSS: ${p.tss}. 
    Intensity: ${p.intensity}.
    efTP: ${p.eftp}W.
    Duration: ${p.durationMins}m.
    Power: ${p.avgPower}W avg, ${p.npPower}W np.
    HR: ${p.avgHr}bpm avg.
    Goal: ${p.userGoal}.
    
    ${p.plannedWorkoutCtx}
    
    Return JSON with:
    summary: A 1-sentence punchy coaching summary.
    goal_contribution: A clear explanation of how this session contributes to ${p.userGoal}.
    workout_steps: If a planned workout exists, provide the structured steps intended for this workout. 
      Steps should include duration (mins), target_watts (W), and label.
      ${hrGuideline}`;
};

export const getDailySuggestionPrompt = (p: DailySuggestionParams): string => {
  const isHrBased = p.hasPowerOnMostRides === false;

  const ftpText = p.ftp 
    ? `The athlete's FTP is ${p.ftp}W. You MUST scale all recommended workout step power levels (target_watts) and interval details in labels precisely as percentages of ${p.ftp}W. For example: Easy/Recovery should be 50-60% FTP (~${Math.round(p.ftp * 0.55)}W), Zone 2 Aerobic should be 60-75% FTP (~${Math.round(p.ftp * 0.68)}W), Tempo should be 75-90% FTP (~${Math.round(p.ftp * 0.82)}W), Threshold should be 90-105% FTP (~${Math.round(p.ftp * 0.98)}W), and Intervals/VO2max should be >105% FTP (~${Math.round(p.ftp * 1.2)}W).`
    : `The athlete's FTP is not specified. Assume a standard baseline FTP of 250W and scale all power/wattages relative to that baseline.`;

  const hrGuideline = isHrBased
    ? `CRITICAL - ATHLETE HAS NO POWER METER (HR-BASED INTENSITIES & TSS):
       The athlete does not have power data (watts) on most of their rides. Therefore, you MUST base all recommended intensities and stress scores (TSS) on the available heart rate (HR) data.
       1. Estimate all Training Stress Scores (TSS) using heart rate-based training stress score (hrTSS / HRSS) instead of power (TSS).
       2. The 'label' for each workout step MUST specify HR-focused intensity targets or HR zones (e.g. "15 min Zone 2 HR (135-145 bpm)" or "10 min Threshold HR (155-165 bpm)") instead of power (e.g. NO "190w"). 
       3. Always use "min" for minutes consistently (e.g. "15 min", "5 min").
       4. Fill in 'target_watts' as a fallback estimated reference, but make sure the label is completely HR-focused.
       ${p.hrStatsText || ''}`
    : `${ftpText}
       For the 'label', use a descriptive format: for stable rides e.g. "5 min 180w", for intervals e.g. "3 times: 5 min 300w + 2 min 180w". Always use "min" for minutes consistently!`;

  return `You are waTTson, an elite cycling coach. Suggest a workout for ${p.targetStr}. 
    History (7d): ${p.history}. 
    Goal: "${p.userGoal}". 
    
    CRITICAL: 
    1. For each workout option (primary and alternative), you MUST provide structured "workout_steps".
    2. "workout_steps" MUST be an array of objects with {duration: number, target_watts: number, label: string}.
    3. Estimate "tss" (Training Stress Score) as a number for each workout.
    4. ${hrGuideline}
    5. Do NOT include any JSON comments.
    6. "readiness_score" must be 1-10.`;
};

export const getWeeklyBriefingPrompt = (p: WeeklyBriefingParams): string => {
  const totalDays = p.dayNames.length;
  const isHrBased = p.hasPowerOnMostRides === false;

  const ftpText = p.ftp 
    ? `The athlete's FTP is ${p.ftp}W. You MUST scale all recommended workout step power levels (target_watts) and interval details in labels precisely as percentages of ${p.ftp}W. For example: Easy/Recovery should be 50-60% FTP (~${Math.round(p.ftp * 0.55)}W), Zone 2 Aerobic should be 60-75% FTP (~${Math.round(p.ftp * 0.68)}W), Tempo should be 75-90% FTP (~${Math.round(p.ftp * 0.82)}W), Threshold should be 90-105% FTP (~${Math.round(p.ftp * 0.98)}W), and Intervals/VO2max should be >105% FTP (~${Math.round(p.ftp * 1.2)}W).`
    : `The athlete's FTP is not specified. Assume a standard baseline FTP of 250W and scale all power/wattages relative to that baseline.`;

  const hrGuideline = isHrBased
    ? `CRITICAL - ATHLETE HAS NO POWER METER (HR-BASED INTENSITIES & TSS):
       The athlete does not have power data (watts) on most of their rides. Therefore, you MUST base all recommended intensities and stress scores (TSS / load targets) on the available heart rate (HR) data.
       1. Estimate all Training Stress Scores (TSS / load targets) using heart rate-based training stress score (hrTSS / HRSS) instead of power (TSS).
       2. The 'label' for each workout step MUST specify HR-focused intensity targets or HR zones (e.g. "15 min Zone 2 HR (135-145 bpm)" or "10 min Threshold HR (155-165 bpm)") instead of power (e.g. NO "190w"). 
       3. Always use "min" for minutes consistently (e.g. "15 min", "5 min").
       4. Fill in 'target_watts' as a fallback estimated reference, but make sure the label is completely HR-focused.
       ${p.hrStatsText || ''}`
    : `${ftpText}
       For the 'label', use a descriptive format: for stable rides e.g. "5 min 180w", for intervals e.g. "3 times: 5 min 300w + 2 min 180w". Always use "min" for minutes consistently!`;

  return `Plan ${totalDays} days training. Goal: ${p.userGoal || 'Endurance'}. Physiology: ${p.stats}. ${p.startContext || ''}. 
    ${p.planContext || ''}
    ${p.pcCtx}
    
    CRITICAL:
    1. Plan exactly ${totalDays} days: ${p.dayNames.join(', ')}.
    2. "why" < 12 words.
    3. Suggest "workout_steps" for ALL workouts EXCEPT Rest days.
    4. "workout_steps" max 3 steps: duration(m), target_watts(W), label.
    5. ${hrGuideline}
    6. Return JSON with phase, focus, outlook_summary, days[].`;
};

export const getChatMessagePrompt = (p: ChatMessageParams): string => {
  return `You are waTTson, an elite, direct, and fast-talking cycling coach. 
    CRITICAL PERFORMANCE DIRECTION: Be extremely direct and concise (1-2 sentences maximum, under 45 words). 
    DO NOT use conversational filler, pleasantries, or preambles (e.g., "Hello!", "Great job!", "Let's look at..."). 
    Deliver high-density, sharp, and immediate scientific coaching insight or instructions. 
    
    User Goal: ${p.goal}. 
    Current Load (7d): ${p.recentLoad}, Readiness: ${p.readiness}.
    Recent History (Full details):
    ${p.historySummary}
    
    Athlete Annual Power Bests:
    ${p.powerCurveStr}
    
    Full Historical Data (Date|Type|TSS|Distance):
    ${p.fullHistoryCompact}
    Total activities available: ${p.totalActivities}.
    Always answer accurately based on this full data set.
    
    PLAN ADAPTATION: If the user asks to change their future training plan (e.g. "more intensity", "day off tomorrow", "focus on hill climbs"), you can "agree" and then append a hidden tag at the end of your message in the format: [UPDATE_PLAN: actual technical directive for the weekly builder]. 
    Example: "I've adapted your week to include VO2 climbs. [UPDATE_PLAN: Increase intensity for Tuesday/Thursday and add 1 short VO2 session]". 
    Keep the technical directive brief and clear for the next generation.`;
};

export const getUserProfilePrompt = (p: UserProfileParams): string => {
  return `You are waTTson, an elite cycling coach. Analyze this athlete's data and create a profile.
    Goal: ${p.userGoal}
    
    Athlete Annual Power Bests:
    ${p.powerCurveStr}
    
    Recent 30 Rides:
    ${p.historySummary}
    
    Return JSON with:
    athlete_type: e.g. "Sprint Specialist", "Endurance Diesel", etc.
    strengths: array of 2-3 strings describing what they are good at.
    areas_for_improvement: array of 2-3 strings.
    training_response: String explaining how this user reacts to past training methods (e.g. "You adapt well to high volume but struggle with back-to-back VO2max sessions").
    effective_methods: array of 2 strings of methods that worked well (e.g. "Long Z2 rides", "Polarized training").
    ineffective_methods: array of 2 strings of methods that caused stagnation or excessive fatigue.
    recommended_focus: 1-sentence recommendation going forward.`;
};
