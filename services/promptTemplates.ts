/**
 * Centralized registry for all LLM prompts used across the waTTson application.
 * This file provides a clear overview of what is asked of the Gemini models.
 */

import { TrainingMode } from '../types';

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
  trainingMode: TrainingMode;
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
    one_thing_to_improve: Exactly 1 action-oriented, helpful conclusion of something they could do better on their next training session based on this ride's data (e.g. "Focus on keeping your cadence above 85 rpm on climbs", "Make sure to fuel with 60g carbs per hour for rides over 90 min", "Control your heart rate during recovery intervals to maximize adaptation").
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
    ? `The athlete's FTP is ${p.ftp}W. You MUST scale all recommended workout step power levels (target_watts) and interval details in labels precisely as percentages of ${p.ftp}W. For example: Easy/Recovery should be 50-60% FTP (~${Math.round(p.ftp * 0.55)}W), Zone 2 Aerobic should be 60-75% FTP (~${Math.round(p.ftp * 0.68)}W), Tempo should be 75-90% FTP (~${Math.round(p.ftp * 0.82)}W), Threshold should be 90-105% FTP (~${Math.round(p.ftp * 0.98)}W), and Intervals/VO2max should be >105% FTP (~${Math.round(p.ftp * 1.2)}W).
       In "workout_steps", ALWAYS set "target_pct" to the target intensity as a decimal of FTP (e.g., 0.55, 0.68, 0.82, 0.98, 1.20).`
    : `The athlete's FTP is not specified. Assume a standard baseline FTP of 250W. Scale power/wattages relative to that baseline. Set "target_pct" as decimal of FTP (e.g., 0.70).`;

  const hrGuideline = isHrBased
    ? `CRITICAL - ATHLETE HAS NO POWER METER (HR-BASED INTENSITIES & TSS):
       The athlete does not have power data (watts) on most of their rides. Base all recommended intensities on heart rate (HR) data.
       1. Estimate stress scores using hrTSS instead of power TSS.
       2. The 'label' for each step MUST specify HR zones (e.g. "15 min Zone 2 HR (135-145 bpm)" or "10 min Threshold HR (155-165 bpm)"). No watts in labels.
       3. Always use "min" for minutes consistently.
       4. Fill in 'target_watts' as an estimated reference, and set 'target_pct' to 0.
       ${p.hrStatsText || ''}`
    : `${ftpText}
       For the 'label', use a descriptive format: e.g. "5 min 180w", or "3 times: 5 min 300w + 2 min 180w". Always use "min" consistently!`;

   const triathlonGuideline = p.trainingMode === 'triathlon'
    ? `TRIATHLON MODE ENABLED (RUNNING & SWIMMING SESSIONS GENERATION REQUIRED):
       The athlete is in Triathlon training. You MUST generate a balanced training plan containing a mix of Cycling (2-3 sessions per week), Running (2 sessions per week), and Swimming (1-2 sessions per week).
       1. Interperse run and swim sessions logically among ride sessions to allow proper recovery.
       2. The 'focus' and 'why' fields for runs and swims must clearly state they are Run/Swim workouts (e.g. 'focus': 'Interval Run', 'Tempo Run', 'Aerobic Swim Technique', 'Threshold Swim').
       3. In 'workout_steps' for Runs and Swims, set 'target_watts' to 0 and 'target_pct' to 0.
       4. In 'workout_steps' for Runs, specify duration/intervals in the 'label' with focus on pace, reps, or heart rate (e.g., '10 min warm-up jog', '4x800m at 5k pace with 2 min jog recovery', '15 min cool-down').
       5. In 'workout_steps' for Swims, specify reps, distance, and intensity in the 'label' (e.g., '200m easy warm-up', '10x50m moderate interval pace with 15s rest', '100m easy swim cool-down').`
    : p.trainingMode === 'running' 
      ? `RUNNING ONLY MODE ENABLED:
         Generate a training plan focusing exclusively on running sessions. No cycling or swimming.`
      : "";

  return `Plan ${totalDays} days training. Goal: ${p.userGoal || 'Endurance'}. Physiology: ${p.stats}. ${p.startContext || ''}. 
    ${p.planContext || ''}
    ${p.pcCtx}
    
    CRITICAL PERFORMANCE RULES FOR HIGH-SPEED GENERATION AND REALISTIC COACHING (MAXIMIZE SPEED):
    1. Plan exactly ${totalDays} days: ${p.dayNames.join(', ')}.
    2. "why" MUST be extremely concise, less than 5 words (e.g., "Active recovery spin"). Keep it as short as possible to minimize generation tokens and reduce latency!
    3. "outlook_summary" MUST be less than 15 words. Describe the week focus in 1 ultra-concise sentence. 
    4. "phase" and "focus" fields should be 1-3 words maximum.
    5. Suggest "workout_steps" for ALL workouts EXCEPT Rest days.
    6. Keep all workout step "label" text under 4-5 words (e.g., "5m Warm-up 130w", "3x5m VO2 300w"). Do not write long sentences in labels.
    7. INTERVAL TRAINING BIAS: Never recommend continuous, uninterrupted high-intensity blocks (Sweet Spot, Threshold, VO2Max, i.e., >85% FTP) exceeding 15-20 minutes. Structure as intervals with recovery periods.
    8. "workout_steps" max 5 steps (e.g. Warmup, Main set, Recovery, Cooldown) to drastically speed up response times.
    9. COMMUTE DAYS: If the user indicates they have a commute on a specific day, you MUST schedule TWO separate workout sessions for that day. Name the FIRST commute session "Commute AM" (morning commute) and the SECOND commute session "Commute PM" (afternoon/evening commute). Return these as two separate day objects in the "days" array with identical date strings. INTEGRATE any planned intensity or interval training for that day DIRECTLY into the commute sessions rather than scheduling a third, separate workout.
    10. ${hrGuideline}
    11. ${triathlonGuideline}
    12. Return JSON with phase, focus, outlook_summary, days[].`;
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
  return `You are waTTson, an elite cycling coach. Analyze this athlete's data and create an incredibly rich, personalized profile.
    Goal: ${p.userGoal}
    
    Athlete Annual Power Bests:
    ${p.powerCurveStr}
    
    Recent 30 Rides:
    ${p.historySummary}
    
    Return JSON with:
    athlete_type: e.g. "Sprint Specialist", "Endurance Diesel / Gran Fondo Rider", "All-Rounder", "Puncheur", etc.
    strengths: array of 3 descriptive strings outlining precise physiological strengths.
    areas_for_improvement: array of 3 descriptive strings outlining precise physiological limiters.
    training_response: String explaining how this user reacts to past training methods.
    effective_methods: array of 2-3 strings of methods that worked well (e.g. "Long Z2 rides", "Polarized training", "Sweet Spot progression").
    ineffective_methods: array of 2-3 strings of methods that caused stagnation or excessive fatigue (e.g. "Excessive Zone 3 junk miles", "Back-to-back VO2 max days").
    recommended_focus: 1-sentence recommendation going forward.
    rider_story: A compelling 3-4 sentence storytelling narrative explaining their specific rider type, their physiological DNA, and how their recent efforts paint a clear picture of their riding style.
    effective_training_history: A compelling 3-4 sentence storytelling narrative outlining which types of training have been highly effective in the past, referencing actual patterns or adaptations seen in their power bests or recent ride history.
    recommended_approach: A detailed 3-4 sentence storytelling narrative presenting the ultimate recommended training approach/philosophy for the future to maximize gains.
    what_can_be_improved: A deep, supportive 3-4 sentence storytelling narrative about what specifically can be improved, highlighting their limiters and explaining the exact physiological reasoning behind prioritizing these areas.`;
};
