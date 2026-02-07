
export interface Activity {
  id: string;
  name: string;
  type: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_watts?: number;
  weighted_average_watts?: number; // Normalized Power
  average_heartrate?: number;
  max_watts?: number;
  training_load?: number;
  icu_tss?: number; // Deprecated in favor of icu_training_load
  icu_variability_index?: number;
  icu_intensity?: number;
  icu_training_load?: number; // Primary field for TSS/Load
  icu_joules?: number;
  calories?: number;
  source?: string; // To detect 'STRAVA' origin
}

export interface ActivityInterval {
  id: string;
  start_index: number;
  end_index: number;
  average_watts: number;
  average_heartrate: number;
  moving_time: number; // Seconds
  type: 'WORK' | 'RECOVERY' | 'WARMUP' | 'COOLDOWN';
  label?: string;
}

export interface PlannedWorkout {
  id: string;
  name: string;
  description: string;
  category: string; // 'WORKOUT'
  start_date_local: string;
  moving_time: number; // planned duration in seconds
  icu_training_load: number; // planned load
}

export interface Wellness {
  id: string;
  date: string;
  ctl: number;
  atl: number;
  trainingLoad?: number;
  restHR?: number;
  hrv?: number;
}

export interface CoachingFeedback {
  summary: string;
  highlights: string[];
  recommendations: string;
  metrics_analysis: string;
}

export interface DailySuggestion {
  title: string;
  description: string;
  intensity: 'Low' | 'Moderate' | 'High' | 'Rest';
  duration_minutes: number;
  reasoning: string;
  readiness_score: number; // 0 to 10 scale
  readiness_analysis: string; // Brief health/recovery status
}

export interface IntervalsCredentials {
  apiKey: string;
  athleteId: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
