
export interface Activity {
  id: string;
  name: string;
  type: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_watts?: number;
  weighted_average_watts?: number;
  average_heartrate?: number;
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
  highlights: string[];
  recommendations: string;
  metrics_analysis: string;
}

export interface WorkoutOption {
  title: string;
  description: string;
  intensity: 'Low' | 'Moderate' | 'High' | 'Rest';
  duration_minutes: number;
  type: 'intervals' | 'endurance';
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
