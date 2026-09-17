/**
 * Centralized registry for all LLM prompts used across the waTTson application.
 * This file provides a clear overview of what is asked of the Gemini models.
 */

import { TrainingMode, TrainingMethodology } from '../types';

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
  lapsCtx: string;
  ftp?: number;
  hasPowerOnMostRides?: boolean;
  hrStatsText?: string;
  detectedRideType?: string;
}

interface DailySuggestionParams {
  targetStr: string;
  history: string;
  userGoal: string;
  ftp?: number;
  hasPowerOnMostRides?: boolean;
  hrStatsText?: string;
  methodology?: TrainingMethodology;
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
  methodology?: TrainingMethodology;
}

interface ChatMessageParams {
  currentDateStr: string;
  todayIso: string;
  goal: string;
  recentLoad: number;
  readiness: number;
  historySummary: string;
  powerCurveStr: string;
  powerRecordsAndCurveAnalysis?: string;
  historicalTrainingMethods?: string;
  trainingEffectivenessInsights?: string;
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

  const detectedIntervalsCtx = p.detectedRideType
    ? `CRITICAL - STRUCTURED INTERVALS RECOGNIZED:
       This ride contains a recognized structured interval set: "${p.detectedRideType}".
       You MUST explicitly discuss these EXACT recognized intervals in your Coach Insight 'summary' field.
       
       STRICT ACCURACY RULES:
       1. Refer ONLY to the REAL recorded interval data from the actual laps provided above (exact repetition count, exact duration per rep, and exact average power/watts achieved from the data, e.g. if the set is 4x 4m @ 310W, speak ONLY about 4x 4m @ ~310W).
       2. ABSOLUTELY DO NOT invent or hallucinate different repetition counts, interval durations, or wattage targets (e.g. NEVER make up "5x 3m" or "360W" or different numbers not in the recorded laps).
       3. DO NOT refer to fictitious workout templates or library workouts that do not match the real executed ride data.
       4. Discuss pacing consistency across the repetitions, heart rate response, and specific physiological adaptations (e.g. expanding VO2 Max, boosting lactic tolerance, raising threshold power). NEVER say there were no structured intervals!`
    : ``;

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
    ${p.lapsCtx}
    ${detectedIntervalsCtx}
    
    Return JSON with:
    summary: A 2-4 sentence coaching summary. Start with a punchy hook. If laps/intervals data or a Recognized Workout Interval Pattern is provided, you MUST explicitly comment on the execution of those intervals (e.g., consistency, power target adherence, physiological benefits). If no laps are provided, deduce the efforts from the overall metrics and discuss them.
    goal_contribution: A clear explanation of how this session contributes to ${p.userGoal}.
    one_thing_to_improve: Exactly 1 action-oriented, helpful conclusion of something they could do better on their next training session based on this ride's data (e.g. "Focus on keeping your cadence above 85 rpm on climbs", "Make sure to fuel with 60g carbs per hour for rides over 90 min", "Control your heart rate during recovery intervals to maximize adaptation"). If the user missed targets during the intervals, point it out.
    workout_steps: If a planned workout exists, provide the structured steps intended for this workout. 
      Steps should include duration (mins), target_watts (W), and label.
      ${hrGuideline}`;
};

export const getDailySuggestionPrompt = (p: DailySuggestionParams): string => {
  const isHrBased = p.hasPowerOnMostRides === false;

  const methodologyText = p.methodology === 'polarized'
    ? `METHODOLOGY REQUIREMENT: POLARIZED TRAINING MODEL. Prioritize ~80% Zone 1/2 low-intensity volume and ~20% high-intensity (VO2max / hard intervals). Avoid middle Zone 3/4 threshold unless specified.`
    : p.methodology === 'pyramidal'
    ? `METHODOLOGY REQUIREMENT: PYRAMIDAL TRAINING MODEL. Structure volume pyramid: largest in Zone 1/2, moderate in Tempo/Sweetspot/Threshold, smallest in VO2max.`
    : p.methodology === 'norwegian'
    ? `METHODOLOGY REQUIREMENT: NORWEGIAN MODEL (Double Threshold). Emphasize sub-threshold controlled interval work (Sweetspot/Threshold) with strict lactate control paired with heavy Zone 2 base.`
    : ``;

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
    ${methodologyText}
    
    CRITICAL REALISTIC TRAINING & STRUCTURE RULES:
    1. For each workout option (primary and alternative), you MUST provide structured "workout_steps".
    2. "workout_steps" MUST be an array of objects with {duration: number, target_watts: number, label: string}.
    3. Estimate "tss" (Training Stress Score) as a number for each workout.
    4. WORKOUT DURATION GUIDELINES:
       - Default daily workouts MUST be realistic training sessions between 45 and 75 minutes (e.g. 45m, 60m, 75m, max 90m).
       - NEVER suggest a 3-hour or 4-hour (240m) ride as a standard daily suggestion unless the user explicitly requested ultra-endurance volume in their goal or custom directives.
       - "duration_minutes" MUST be in MINUTES (e.g., 45, 60, 75, 90).
    5. NO CONSECUTIVE RECOVERY RIDES: Never suggest 2 recovery rides or active recovery sessions in a row. If the athlete did a recovery spin yesterday or recently, do NOT suggest another recovery ride; suggest an Aerobic Zone 2 Endurance Ride or a Rest Day instead.
    6. NO MASSIVE HIGH INTENSITY BLOCKS / PHYSICALLY IMPOSSIBLE INTERVALS: High intensity (>85% FTP, or HR Zone 4/5) must NEVER be recommended as a single long continuous block/step. You must structure them as intervals/sets with recovery steps in between.
       - VO2Max (Zone 5, >105% FTP / Zone 5 HR): A single block/rep can NEVER exceed 8 minutes. Standard reps are 2-5 minutes. NEVER output a continuous step of e.g. "16 min VO2max" or "15 min VO2max" or "10 min VO2max" in 1 block. If the athlete is to do VO2 Max, they MUST do multiple separate reps of 2-5 mins with easy recovery steps (e.g. 2-4 mins at 100-150W or Zone 1 HR) in between (e.g. Step 1: Warmup, Step 2: 3m VO2Max, Step 3: 3m Recovery, Step 4: 3m VO2Max, Step 5: 3m Recovery, Step 6: 3m VO2Max, Step 7: Cooldown).
       - Threshold (Zone 4, 90-105% FTP / Zone 4 HR): A single block/rep can NEVER exceed 20 minutes (standard is 8-15 minutes, e.g., separate Threshold efforts with recovery steps in between).
       - Sweet Spot / Tempo (Zone 3, 75-90% FTP / Zone 3 HR): A single block/rep can NEVER exceed 30 minutes.
    7. INTERVAL REPS REPRESENTATION: Do NOT compress multiple intervals into a single "workout_steps" item (like one 15-minute item with the label "4x3 VO2Max"). You MUST write them as separate steps in the array so the athlete can follow each step (e.g. separate VO2max step, recovery step, VO2max step, recovery step).
    8. ${hrGuideline}
    9. Do NOT include any JSON comments.
    10. "readiness_score" must be 1-10.`;
};

export const getWeeklyBriefingPrompt = (p: WeeklyBriefingParams): string => {
  const totalDays = p.dayNames.length;
  const isHrBased = p.hasPowerOnMostRides === false;

  const methodologyText = p.methodology === 'polarized'
    ? `METHODOLOGY REQUIREMENT: POLARIZED TRAINING MODEL. Prioritize ~80% Zone 1/2 low-intensity volume and ~20% high-intensity (VO2max / hard intervals). Avoid middle Zone 3/4 threshold unless specified.`
    : p.methodology === 'pyramidal'
    ? `METHODOLOGY REQUIREMENT: PYRAMIDAL TRAINING MODEL. Structure volume pyramid: largest in Zone 1/2, moderate in Tempo/Sweetspot/Threshold, smallest in VO2max.`
    : p.methodology === 'norwegian'
    ? `METHODOLOGY REQUIREMENT: NORWEGIAN MODEL (Double Threshold). Emphasize sub-threshold controlled interval work (Sweetspot/Threshold) with strict lactate control paired with heavy Zone 2 base.`
    : ``;

  const directiveContext = p.planContext && p.planContext.trim() 
    ? `CUSTOM DIRECTIVES: ${p.planContext.trim()}`
    : `DIRECTIVE (OPTIMIZED BASELINE): No custom directives active. Generate a plan specifically designed to optimize the next training session and subsequent progression in order to reach the goal ("${p.userGoal || 'Endurance'}") based on the athlete's current physiological context (CTL, ATL, TSB form, readiness, power curve, and recent load).`;

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
    ${directiveContext}
    ${methodologyText}
    ${p.pcCtx}
    
    CRITICAL PERFORMANCE RULES FOR HIGH-SPEED GENERATION AND REALISTIC COACHING (MAXIMIZE SPEED):
    1. Plan exactly ${totalDays} days: ${p.dayNames.join(', ')}.
    2. "why" MUST be extremely concise, less than 5 words (e.g., "Active recovery spin"). Keep it as short as possible to minimize generation tokens and reduce latency!
    3. "outlook_summary" MUST be less than 15 words. Describe the week focus in 1 ultra-concise sentence. 
    4. "phase" and "focus" fields should be 1-3 words maximum.
    5. Suggest "workout_steps" for ALL workouts EXCEPT Rest days.
    6. Keep all workout step "label" text under 4-5 words (e.g., "5m Warm-up 130w", "3m VO2 300w"). Do not write long sentences in labels.
    7. REALISTIC WORKOUT DURATION & PERIODIZATION RULES:
       - "duration_target" MUST be specified in MINUTES (e.g., 45, 60, 75, 90, 120).
       - Weekday workouts (Monday through Friday) MUST be 45 to 90 minutes (standard: 45m, 60m, 75m, max 90m; max 120m for an exceptional mid-week long ride).
       - Long endurance rides (>120 minutes / 2h - 3.5h, max 240m) are reserved EXCLUSIVELY for ONE weekend day (Saturday or Sunday), and NEVER scheduled on weekdays or on consecutive days!
       - NEVER schedule 4-hour (240 min) or >2.5-hour rides for the upcoming 2 days on regular weekdays.
       - NEVER schedule back-to-back 4-hour (240m) rides on consecutive days.
    8. NO CONSECUTIVE RECOVERY RIDES: Never schedule 2 recovery rides or active recovery sessions in a row on consecutive days. Having 2 recovery rides after each other makes no training sense. If an athlete needs recovery, pair a single active recovery day with an easy Zone 2 Endurance Ride or a full Rest Day on the following day.
    9. REALISTIC INTERVALS RULE / NO PHYSICALLY IMPOSSIBLE HIGH INTENSITY BLOCKS: High intensity (>85% FTP, or HR Zone 4/5) must NEVER be recommended as a single long continuous block/step. You must structure them as intervals/sets with recovery steps in between.
       - VO2Max (Zone 5, >105% FTP / Zone 5 HR): A single block/rep can NEVER exceed 8 minutes. Standard reps are 2-5 minutes. NEVER output a continuous step of e.g. "16 min VO2max" or "15 min VO2max" or "10 min VO2max" in 1 block. If the athlete is to do VO2 Max, they MUST do multiple separate reps of 2-5 mins with easy recovery steps (e.g. 2-4 mins at 100-150W or Zone 1 HR) in between (e.g. Step 1: Warmup, Step 2: 3m VO2Max, Step 3: 3m Recovery, Step 4: 3m VO2Max, Step 5: 3m Recovery, Step 6: 3m VO2Max, Step 7: Cooldown).
       - Threshold (Zone 4, 90-105% FTP / Zone 4 HR): A single block/rep can NEVER exceed 20 minutes (standard is 8-15 minutes, e.g., separate Threshold efforts with recovery steps in between).
       - Sweet Spot / Tempo (Zone 3, 75-90% FTP / Zone 3 HR): A single block/rep can NEVER exceed 30 minutes.
       If a workout requires a substantial duration of high intensity, you MUST break it up into separate reps/sets with easy recovery (e.g., 100W-150W or Zone 1 HR) steps in between.
    10. INTERVAL REPS REPRESENTATION: Do NOT compress multiple intervals into a single "workout_steps" item (like one 15-minute item with the label "4x3 VO2Max"). You MUST write them as separate steps in the array so the athlete can follow each step (e.g., separate VO2max step, recovery step, VO2max step, recovery step). For interval-based workouts, the "workout_steps" array can expand up to 10 steps to properly represent these reps. For simple endurance or recovery workouts, keep it to 3-4 steps (Warmup, Main, Cooldown).
    11. COMMUTE DAYS: If the user indicates they have a commute on a specific day, you MUST schedule TWO separate workout sessions for that day. Name the FIRST commute session "Commute AM" (morning commute) and the SECOND commute session "Commute PM" (afternoon/evening commute). Return these as two separate day objects in the "days" array with identical date strings. INTEGRATE any planned intensity or interval training for that day DIRECTLY into the commute sessions rather than scheduling a third, separate workout.
    12. ${hrGuideline}
    13. ${triathlonGuideline}
    14. Return JSON with phase, focus, outlook_summary, days[].`;
};

export const getChatMessagePrompt = (p: ChatMessageParams): string => {
  return `You are waTTson, an elite, direct, and scientifically grounded cycling coach AI. 
    CURRENT DATE AWARENESS:
    Today is: ${p.currentDateStr} (ISO: ${p.todayIso}).
    You MUST be strictly aware of what day today is and what day any requested change applies to.
    When the user refers to relative days:
    - "today", "this morning", "tonight" refers to ${p.currentDateStr} (${p.todayIso}).
    - "tomorrow" refers to the calendar day immediately after today.
    - Specific days like "Friday", "Saturday", "Monday" refer to the upcoming corresponding day relative to today (${p.currentDateStr}).

    COMMUNICATION DIRECTIVE:
    - Deliver high-density, sharp, accurate, and immediate scientific coaching insights.
    - Be conversational yet concise (1-3 sentences by default, unless the user asks for a detailed historical analysis, power comparison, or explanation of past training methods).
    - DO NOT use generic filler or empty pleasantries.
    
    User Goal: ${p.goal}. 
    Current Load (7d): ${p.recentLoad}, Readiness: ${p.readiness}.

    ========================================================
    ATHLETE POWER RECORDS & POWER DURATION MATRIX:
    ========================================================
    ${p.powerRecordsAndCurveAnalysis || p.powerCurveStr}

    ========================================================
    HISTORICAL TRAINING METHODS & PERIODIZATION ANALYSIS:
    ========================================================
    ${p.historicalTrainingMethods || 'Historical training methodology analysis not available.'}

    ========================================================
    TRAINING EFFECTIVENESS & PHYSIOLOGICAL ADAPTATIONS:
    ========================================================
    ${p.trainingEffectivenessInsights || 'Training effectiveness insights not available.'}

    ========================================================
    RECENT DETAILED RIDES & STRUCTURED EFFORTS (Last 15 Sessions):
    ========================================================
    ${p.historySummary}

    ========================================================
    FULL HISTORICAL TIMELINE & TRAINING ARCHIVE:
    ========================================================
    ${p.fullHistoryCompact}
    Total activities available: ${p.totalActivities}.

    COACH KNOWLEDGE DIRECTIVES:
    1. HISTORICAL TRAINING METHODS: When the user asks about past training methods (e.g. Polarized vs Pyramidal vs Sweet Spot, volume vs intensity, winter base, consistency, past blocks), quote their real historical data, intensity distributions, and season breakdowns provided above.
    2. POWER RECORDS & PRS: When the user asks about power records (e.g. all-time 5-min PR, 20-min best, sprint records, year-over-year power evolution), quote their exact best wattages, durations, and years from the power records matrix.
    3. EFFECTIVENESS OF TRAINING: When the user asks about the effectiveness of training, explain the direct cause-and-effect in their data: which training volume (TSS/hours), CTL fitness peaks, and methodologies drove their highest power breakthroughs, eFTP gains, or efficiency factor (EF = NP/HR) improvements.
    
    PLAN ADAPTATION: If the user asks to change or adapt their future training plan (e.g. "more intensity", "day off tomorrow", "focus on hill climbs", "add commute on Friday", "change today's ride to recovery"):
    1. Confirm the plan change in 1 concise sentence.
    2. Append a hidden tag at the very end of your message in the format: [UPDATE_PLAN: actual technical directive for the weekly builder].
    3. In the directive, state the specific requested workout and target day clearly relative to today.
    Example: "Understood, scheduling a 45m active recovery spin for tomorrow. [UPDATE_PLAN: Schedule a 45 min Zone 1 active recovery ride for tomorrow]".
    Keep the technical directive brief, clear, and actionable for the plan generator.`;
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

export interface ThreeMonthReviewParams {
  userGoal: string;
  ftp?: number;
  methodology?: TrainingMethodology;
  periodStats: {
    totalActivities: number;
    totalHours: number;
    totalKm: number;
    totalTss: number;
    avgTssPerWeek: number;
  };
  recentActivitiesSummary: string;
}

export const getThreeMonthReviewPrompt = (p: ThreeMonthReviewParams): string => {
  return `You are waTTson, an elite cycling sports scientist and AI coach. Analyze the athlete's training data over the past 3 months (90 days) with thoroughness and specific, actionable insights.

ATHLETE GOAL: "${p.userGoal}"
FTP BENCHMARK: ${p.ftp || 250}W
PREFERRED METHODOLOGY: ${p.methodology || 'polarized'}

3-MONTH AGGREGATE TRAINING STATS:
- Total Activities: ${p.periodStats.totalActivities}
- Total Volume: ${p.periodStats.totalHours} hours (${p.periodStats.totalKm} km)
- Total Training Load: ${p.periodStats.totalTss} TSS
- Average Weekly Load: ${p.periodStats.avgTssPerWeek} TSS/week

90-DAY ACTIVITY LOG (SAMPLE):
${p.recentActivitiesSummary}

TASK:
1. Identify and praise the specific positive achievements based on their data. Mention stats like volume, consistency, or total TSS where applicable.
2. Evaluate whether their training over the last 3 months is contributing to their goal: "${p.userGoal}". This must be a detailed, long evaluation (4-5 sentences) with specific data points.
3. Evaluate if their intensity distribution matches their chosen methodology (${p.methodology || 'polarized'}). Look for "gray zone" riding (riding too hard on easy days, too easy on hard days) vs true polarized/pyramidal splits.
4. Detail 3 concrete, highly specific, long changes in approach they need to make going forward. Each change should be an actionable instruction (e.g. "Do 2 weekly zone  zone 2 rides of at least 90 mins to build aerobic base instead of sweet spot", etc.) rather than a generic summary.

Return JSON matching this schema:
{
  "status": "on_track" | "needs_adjustment" | "off_target",
  "headline": "1-line punchy conclusion",
  "contributing_to_goal": "A detailed, comprehensive evaluation (4-5 sentences) of how their training contributes to their goal, highlighting what is going well and what needs alignment.",
  "good_things_achieved": [
    "Specific positive thing 1 with data/numbers (e.g. 'Strong aerobic consistency with 32 hours accumulated')",
    "Specific positive thing 2 with data/numbers (e.g. 'Solid weekly TSS rhythm averaging 250 TSS')"
  ],
  "needed_changes": [
    "Specific, highly actionable advice 1 with instructions on duration/power zones",
    "Specific, highly actionable advice 2 with instructions on duration/power zones",
    "Specific, highly actionable advice 3 with instructions on duration/power zones"
  ],
  "intensity_distribution_summary": "A detailed 2-3 sentence analysis of their intensity distribution, specifically checking for sweet-spot/gray-zone creeping."
}`;
};
