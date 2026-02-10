
import { Activity, ActivityInterval, IntervalsCredentials, PlannedWorkout, Wellness } from '../types';

/**
 * Generates a YYYY-MM-DD string in local time.
 * Crucial for matching Intervals.icu which processes data based on the athlete's local calendar.
 */
const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const fetchActivities = async (creds: IntervalsCredentials): Promise<Activity[]> => {
  const { apiKey, athleteId } = creds;
  
  if (!apiKey) throw new Error("API Key is missing.");

  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  const now = new Date();
  // Buffer by 1 day into the future to catch any "tomorrow" rides due to timezone differences
  const futureDate = new Date(now);
  futureDate.setDate(now.getDate() + 2); 
  
  const pastDate = new Date(now);
  pastDate.setDate(now.getDate() - 365); 
  
  const oldest = toLocalDateString(pastDate);
  const newest = toLocalDateString(futureDate);
  
  const fields = [
    'id', 'name', 'type', 'start_date_local', 'moving_time', 'elapsed_time',
    'distance', 'total_elevation_gain', 'average_watts', 'weighted_average_watts', 'average_heartrate',
    'icu_training_load', 'icu_intensity', 'source', 'icu_tss', 'icu_joules', 'calories', 'icu_efficiency_factor'
  ].join(',');

  const activitiesUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}&fields=${fields}`;

  try {
    const response = await fetch(activitiesUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });
    
    if (!response.ok) {
      if (response.status === 401) throw new Error("Authentication failed: Invalid API Key.");
      if (response.status === 404) throw new Error(`Athlete ID ${athleteId} not found.`);
      throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Received invalid response format from Intervals.icu");

    return data;
  } catch (error: any) {
    console.error('Activities Fetch Error:', error);
    throw error;
  }
};

export const fetchWellness = async (creds: IntervalsCredentials): Promise<Wellness[]> => {
  if (creds.apiKey === 'demo') return getMockWellness();

  const { apiKey, athleteId } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(now.getDate() + 2);
  const newest = toLocalDateString(futureDate);
  
  const past = new Date(now);
  past.setDate(now.getDate() - 365); 
  const oldest = toLocalDateString(past);

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`;

  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
};

export const fetchActivityIntervals = async (activityId: string, creds: IntervalsCredentials): Promise<ActivityInterval[]> => {
  if (creds.apiKey === 'demo') return getMockIntervals();
  const { apiKey } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
  const url = `https://intervals.icu/api/v1/activity/${activityId}/intervals`;
  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) { return []; }
};

export const fetchPlannedWorkout = async (dateStr: string, creds: IntervalsCredentials): Promise<PlannedWorkout | null> => {
  if (creds.apiKey === 'demo') return getMockPlannedWorkout(dateStr);
  const { apiKey, athleteId } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events?oldest=${dateStr}&newest=${dateStr}`;
  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) return null;
    const events = await response.json();
    if (!Array.isArray(events)) return null;
    return events.find((e: any) => e.category === 'WORKOUT') || null;
  } catch (error) { return null; }
};

export const getMockActivities = (): Activity[] => {
  const mock: Activity[] = [];
  const now = new Date();
  for (let i = 30; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    if (i % 2 === 0) {
      mock.push({
        id: `mock-${i}`,
        name: i === 0 ? "Recovery Spin" : "Threshold Session",
        type: "VirtualRide",
        start_date_local: d.toISOString(),
        distance: 25000,
        moving_time: 3600,
        total_elevation_gain: 200,
        average_watts: 200,
        icu_training_load: 60 + Math.random() * 40,
        source: 'ZWIFT'
      });
    }
  }
  return mock;
};

export const getMockWellness = (): Wellness[] => {
  const now = new Date();
  const data: Wellness[] = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = toLocalDateString(d);
    data.push({
      id: `mock-w-${i}`,
      date: dateStr,
      ctl: 45 + (30 - i) * 0.5,
      atl: 40 + Math.random() * 20,
      tsb: 5 - Math.random() * 10,
      trainingLoad: 0
    });
  }
  return data;
};

export const getMockIntervals = (): ActivityInterval[] => [
  { id: '1', start_index: 0, end_index: 600, average_watts: 150, average_heartrate: 120, moving_time: 600, type: 'WARMUP' },
  { id: '2', start_index: 600, end_index: 1200, average_watts: 280, average_heartrate: 160, moving_time: 600, type: 'WORK' }
];

export const getMockPlannedWorkout = (dateStr: string): PlannedWorkout => ({
  id: 'mock-plan-1',
  name: 'Sweet Spot Base',
  description: '2x20m at 90% FTP',
  category: 'WORKOUT',
  start_date_local: dateStr,
  moving_time: 3600,
  icu_training_load: 75
});
