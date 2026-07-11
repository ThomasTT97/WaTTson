
export interface Activity {
  id: string;
  name: string;
  type: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_watts?: number;
  weighted_average_watts?: number;
  icu_average_watts?: number;
  icu_weighted_average_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  max_watts?: number;
  training_load?: number;
  icu_tss?: number;
  icu_variability_index?: number;
  icu_intensity?: number;
  icu_efficiency_factor?: number;
  icu_training_load?: number;
  icu_joules?: number;
  calories?: number;
  source?: string;
  icu_hr_variability?: number;
  icu_hrr?: number;
  has_heartrate?: boolean;
  has_power?: boolean;
  average_temp?: number;
  device_name?: string;
  external_id?: string;
  icu_pm_actual_load?: number;
  icu_atl?: number;
  icu_ctl?: number;
  icu_tsb?: number;
  analyzed?: boolean;
  icu_eftp?: number;
}

export interface ActivityInterval {
  id: string;
  start_index: number;
  end_index: number;
  average_watts: number;
  average_heartrate: number;
  moving_time: number;
  type: 'WORK' | 'RECOVERY' | 'WARMUP' | 'COOLDOWN';
  label?: string;
}

export interface PlannedWorkout {
  id: string;
  name: string;
  description: string;
  category: string;
  start_date_local: string;
  moving_time: number;
  icu_training_load: number;
}

export interface Wellness {
  id: string;
  date: string;
  ctl?: number;
  atl?: number;
  tsb?: number;
  trainingLoad?: number;
  restHR?: number;
  hrv?: number;
  weight?: number;
}

export interface CoachingFeedback {
  summary: string;
  goal_contribution: string;
  workout_steps?: {
    duration: number;
    target_watts?: number;
    label: string;
  }[];
}

export interface WorkoutOption {
  title: string;
  description: string;
  intensity: 'Low' | 'Moderate' | 'High' | 'Rest';
  duration_minutes: number;
  type: 'intervals' | 'endurance';
  tss?: number;
  workout_steps?: {
    duration: number; // minutes
    target_watts?: number;
    label: string;
  }[];
}

export interface DailySuggestion {
  date: string;
  readiness_score: number;
  readiness_analysis: string;
  reasoning: string;
  primary: WorkoutOption;
  alternative: WorkoutOption;
}

export interface WeeklyBriefing {
  phase: string;
  focus: string;
  outlook_summary: string;
  days: {
    day: string;
    focus: string;
    load_target: number;
    duration_target: number;
    intensity: 'Easy' | 'Medium' | 'Hard' | 'Rest';
    why: string;
    workout_steps?: {
      duration: number; // minutes
      target_watts?: number;
      label: string;
    }[];
  }[];
}

export interface IntervalsCredentials {
  apiKey: string;
  athleteId: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface UserProfileAnalysis {
  athlete_type: string;
  strengths: string[];
  areas_for_improvement: string[];
  training_response: string;
  effective_methods: string[];
  ineffective_methods: string[];
  recommended_focus: string;
}

export interface PowerBest {
  duration: number; // in seconds
  watts: number;
}

export interface AnnualPowerCurve {
  year: number;
  bests: PowerBest[];
}

export interface RecoveryAdvice {
  score: number;
  summary: string;
  sleep_advice: string;
  food_advice: string;
  activity_advice: string;
  key_metrics: {
    label: string;
    value: string;
    status: 'good' | 'warning' | 'neutral';
  }[];
}
