import { Activity } from '../types';

export interface MonthlyReport {
  figures: {
    totalTime: number; // hours
    totalLoad: number;
    activityCount: number;
    longestRide: number; // hours
  };
  improvements: string[];
}
