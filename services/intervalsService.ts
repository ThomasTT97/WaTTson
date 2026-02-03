
import { Activity, ActivityInterval, IntervalsCredentials, PlannedWorkout } from '../types';

export const fetchActivities = async (creds: IntervalsCredentials): Promise<Activity[]> => {
  const { apiKey } = creds;
  
  if (!apiKey) throw new Error("API Key is missing.");

  // STRICT AUTHENTICATION RULE: Username is "API_KEY", Password is the user's API Key.
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  /**
   * Date Logic:
   * 1. 'newest': Tomorrow (covers global timezones).
   * 2. 'oldest': 84 days ago (12 weeks).
   *    We need ~42 days + buffer for the CTL (Fitness) exponential average to stabilize.
   */
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1); 
  
  const pastDate = new Date();
  pastDate.setDate(now.getDate() - 84); // 12 Weeks
  
  const toLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const oldest = toLocalDateString(pastDate);
  const newest = toLocalDateString(tomorrow);
  
  // Explicitly request fields to ensure we get clean JSON and minimize payload
  const fields = [
    'id', 'name', 'type', 'start_date_local', 'moving_time', 'elapsed_time',
    'distance', 'total_elevation_gain', 'average_watts', 'average_heartrate',
    'icu_training_load', 'icu_intensity', 'source', 'icu_tss'
  ].join(',');

  // URL for the authenticated athlete (ID 0)
  const activitiesUrl = `https://intervals.icu/api/v1/athlete/0/activities?oldest=${oldest}&newest=${newest}&fields=${fields}`;

  try {
    const response = await fetch(activitiesUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid API Key. Please check your key in Intervals.icu Settings.");
      }
      if (response.status === 403) {
        throw new Error("Access Denied. Check 'Allowed Origins' in Intervals.icu Settings.");
      }
      throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.warn("Unexpected API response:", data);
      throw new Error("Invalid data format received from Intervals.icu");
    }

    if (data.length === 0) {
      return [];
    }

    // --- SMART FILTERING ---
    const validActivities = data.filter(activity => {
      // 1. ALWAYS Allow Virtual Rides (Zwift, Rouvy, etc.)
      // These are important even if load calculation varies.
      if (activity.type === 'VirtualRide') return true;
      if (activity.source === 'ZWIFT') return true;

      // 2. Filter out "Empty" Strava activities
      // Strava activities without training load usually mean permissions issues 
      // or lack of power/HR data to calculate load. We hide these to avoid clutter.
      if (activity.source === 'STRAVA') {
        const load = activity.icu_training_load ?? activity.icu_tss;
        if (load === undefined || load === null) {
          return false;
        }
      }

      // 3. Allow all other activities (Garmin, Wahoo, Manual entries, etc.)
      return true;
    });

    return validActivities;

  } catch (error: any) {
    console.error('Activities Fetch Error:', error);
    
    if (error.message.includes("Invalid API Key") || error.message.includes("Access Denied")) {
      throw error;
    }
    
    if (error.name === 'TypeError') {
      throw new Error("Network Error. This is usually caused by CORS. Add this site's URL to 'Allowed Origins' in Intervals.icu Settings.");
    }
    
    throw new Error(error.message || "Failed to sync activities.");
  }
};

export const fetchActivityIntervals = async (activityId: string, creds: IntervalsCredentials): Promise<ActivityInterval[]> => {
  if (creds.apiKey === 'demo') {
    return getMockIntervals();
  }

  const { apiKey } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  const url = `https://intervals.icu/api/v1/activity/${activityId}/intervals`;

  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) return []; // Fail silently for laps, analysis will just use summary
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Failed to fetch intervals", error);
    return [];
  }
};

export const fetchPlannedWorkout = async (dateStr: string, creds: IntervalsCredentials): Promise<PlannedWorkout | null> => {
  if (creds.apiKey === 'demo') {
    return getMockPlannedWorkout(dateStr);
  }

  const { apiKey } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  // Fetch events for the specific date
  const url = `https://intervals.icu/api/v1/athlete/0/events?oldest=${dateStr}&newest=${dateStr}`;

  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) return null;
    
    const events = await response.json();
    if (!Array.isArray(events)) return null;

    // Find the first event that is a workout
    const workout = events.find((e: any) => e.category === 'WORKOUT');
    return workout || null;
  } catch (error) {
    console.error("Failed to fetch planned workout", error);
    return null;
  }
};

export const getMockActivities = (): Activity[] => {
  const mock: Activity[] = [];
  const now = new Date();
  
  // Recent Zwift ride
  mock.push({
    id: 'mock-zwift',
    name: "Zwift - AdZ Climb",
    type: "VirtualRide",
    start_date_local: new Date().toISOString(),
    distance: 25000,
    moving_time: 3600,
    total_elevation_gain: 1100,
    average_watts: 240,
    average_heartrate: 155,
    icu_training_load: 85,
    icu_intensity: 0.85,
    source: 'ZWIFT'
  });

  // Recent Wahoo ride
  const wahooDate = new Date();
  wahooDate.setDate(now.getDate() - 1);
  mock.push({
    id: 'mock-wahoo',
    name: "Outdoor Endurance Loop",
    type: "Ride",
    start_date_local: wahooDate.toISOString(),
    distance: 65000,
    moving_time: 8100,
    total_elevation_gain: 400,
    average_watts: 180,
    average_heartrate: 135,
    icu_training_load: 110,
    icu_intensity: 0.65,
    source: 'WAHOO'
  });

  for (let i = 2; i < 45; i++) {
    const date = new Date();
    date.setDate(now.getDate() - i);
    
    // Simulate training blocks: 3 days on, 1 day off
    if (i % 4 !== 0) {
      mock.push({
        id: `mock-${i}`,
        name: i % 7 === 0 ? "Long Ride" : "Training Ride",
        type: "Ride",
        start_date_local: date.toISOString(),
        distance: 30000 + Math.random() * 20000,
        moving_time: 3600 + Math.random() * 3000,
        total_elevation_gain: 500,
        icu_training_load: 50 + Math.random() * 80, // Random load between 50 and 130
        icu_intensity: 0.7,
        source: 'GARMIN_CONNECT'
      });
    }
  }
  return mock;
};

export const getMockIntervals = (): ActivityInterval[] => {
  return [
    { id: '1', start_index: 0, end_index: 600, average_watts: 150, average_heartrate: 120, moving_time: 600, type: 'WARMUP' },
    { id: '2', start_index: 600, end_index: 900, average_watts: 300, average_heartrate: 165, moving_time: 300, type: 'WORK' },
    { id: '3', start_index: 900, end_index: 1200, average_watts: 140, average_heartrate: 130, moving_time: 300, type: 'RECOVERY' },
    { id: '4', start_index: 1200, end_index: 1500, average_watts: 305, average_heartrate: 168, moving_time: 300, type: 'WORK' },
    { id: '5', start_index: 1500, end_index: 1800, average_watts: 140, average_heartrate: 132, moving_time: 300, type: 'RECOVERY' },
    { id: '6', start_index: 1800, end_index: 2100, average_watts: 310, average_heartrate: 170, moving_time: 300, type: 'WORK' },
    { id: '7', start_index: 2100, end_index: 2400, average_watts: 140, average_heartrate: 135, moving_time: 300, type: 'COOLDOWN' },
  ];
};

export const getMockPlannedWorkout = (dateStr: string): PlannedWorkout => {
  return {
    id: 'mock-plan-1',
    name: '4x5m Threshold',
    description: 'Warm up 10m. 4x5m at 105% FTP with 5m recovery. Cool down 15m.',
    category: 'WORKOUT',
    start_date_local: dateStr,
    moving_time: 3600,
    icu_training_load: 80
  };
};
