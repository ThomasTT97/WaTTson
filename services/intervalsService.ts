
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

export const fetchAthleteId = async (apiKey: string): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required.");
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  try {
    const response = await fetch('https://intervals.icu/api/v1/whoami', {
      headers: { 
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      },
      cache: 'no-store'
    });
    
    if (response.status === 404) {
      throw new Error("Intervals.icu error: 404. If this persists, please enter your Athlete ID manually.");
    }
    
    if (response.status === 401) {
      throw new Error("Invalid API Key. Please check your Intervals.icu settings.");
    }
    
    if (!response.ok) {
      throw new Error(`Intervals.icu error: ${response.status}. Please try again later.`);
    }
    
    const data = await response.json();
    if (!data || !data.id) {
      throw new Error("Could not retrieve athlete ID from Intervals.icu.");
    }
    return String(data.id);
  } catch (error: any) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error("Network error: Could not connect to Intervals.icu. Check your internet or CORS settings.");
    }
    throw error;
  }
};

export const fetchActivities = async (creds: IntervalsCredentials, daysBack: number = 3650): Promise<Activity[]> => {
  const { apiKey, athleteId } = creds;
  
  if (apiKey === 'demo') return getMockActivities();
  if (!apiKey) throw new Error("API Key is missing.");

  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  const now = new Date();
  // Buffer by 2 days into the future to catch any "tomorrow" rides due to timezone differences
  const futureDate = new Date(now);
  futureDate.setDate(now.getDate() + 2); 
  
  const pastDate = new Date(now);
  pastDate.setDate(now.getDate() - daysBack); 
  
  const oldest = toLocalDateString(pastDate);
  const newest = toLocalDateString(futureDate);
  
  const fields = [
    'id', 'name', 'type', 'start_date_local', 'moving_time', 'elapsed_time',
    'distance', 'total_elevation_gain', 'average_watts', 'weighted_average_watts', 
    'icu_average_watts', 'icu_weighted_average_watts', 'average_heartrate', 'max_heartrate',
    'average_cadence', 'max_watts', 'icu_training_load', 'icu_intensity', 'source', 
    'icu_tss', 'icu_joules', 'calories', 'icu_efficiency_factor', 'icu_variability_index',
    'icu_hr_variability', 'icu_hrr', 'has_heartrate', 'has_power', 'average_temp',
    'device_name', 'external_id', 'icu_pm_actual_load', 'icu_atl', 'icu_ctl', 'icu_tsb',
    'analyzed', 'icu_power_hr_z2_ef', 'icu_power_hr_z2', 'icu_power_hr_z2_hr', 'icu_eftp'
  ].join(',');

  const allActivities: Activity[] = [];
  let currentNewest = new Date(now);
  currentNewest.setDate(now.getDate() + 2);

  const targetOldestDate = new Date(now);
  targetOldestDate.setDate(now.getDate() - daysBack);

  try {
    let remaining = true;
    while (remaining) {
      const chunkOldestDate = new Date(currentNewest);
      chunkOldestDate.setDate(currentNewest.getDate() - 364); // 1 year chunks

      const actualOldestDate = chunkOldestDate < targetOldestDate ? targetOldestDate : chunkOldestDate;
      const oldestStr = toLocalDateString(actualOldestDate);
      const newestStr = toLocalDateString(currentNewest);

      const activitiesUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldestStr}&newest=${newestStr}&cols=${fields}&size=2000&_t=${Date.now()}`;
      
      const response = await fetch(activitiesUrl, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          data.forEach(item => {
            if (!allActivities.find(existing => existing.id === item.id)) {
              allActivities.push(item);
            }
          });
        }
      } else {
        if (response.status === 401) throw new Error("Authentication failed: Invalid API Key.");
        if (response.status === 404) throw new Error(`Athlete ID ${athleteId} not found.`);
        if (response.status === 429) {
           console.warn("Intervals.icu rate limit hit. Throttling...");
           await new Promise(resolve => setTimeout(resolve, 2000));
           // We'll skip this chunk and try to continue, or we could retry. 
           // For now, let's just wait and continue.
        } else {
          remaining = false;
        }
      }

      currentNewest = new Date(actualOldestDate);
      currentNewest.setDate(currentNewest.getDate() - 1);

      if (actualOldestDate <= targetOldestDate) {
        remaining = false;
      }
      
      // Small pause to be kind to the API
      if (remaining) await new Promise(resolve => setTimeout(resolve, 300));
    }

    // After all activities are fetched, log yesterday's activity if it exists
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalDateString(yesterday);
    const activityYesterday = allActivities.find(a => a.start_date_local.startsWith(yesterdayStr));
    console.log("Activity from yesterday:", activityYesterday);

    return allActivities.sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  } catch (error: any) {
    console.error('Activities Fetch Error:', error);
    if (allActivities.length > 0) return allActivities;
    throw error;
  }
};

export const fetchWellness = async (creds: IntervalsCredentials, daysBack: number = 3650): Promise<Wellness[]> => {
  const { apiKey, athleteId } = creds;
  if (apiKey === 'demo') return getMockWellness();

  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  const now = new Date();
  
  // Wellness API only returns 1 year at a time. We must fetch in chunks if daysBack > 365.
  const allWellness: Wellness[] = [];
  let currentNewest = new Date(now);
  currentNewest.setDate(now.getDate() + 2); // Buffer forward

  const startPastDate = new Date(now);
  startPastDate.setDate(now.getDate() - daysBack);
  const targetOldestDate = startPastDate;

  try {
    let remaining = true;
    while (remaining) {
      const chunkOldestDate = new Date(currentNewest);
      chunkOldestDate.setDate(currentNewest.getDate() - 364); // Max 1 year

      // Don't fetch further back than requested
      const actualOldestDate = chunkOldestDate < targetOldestDate ? targetOldestDate : chunkOldestDate;
      
      const oldestStr = toLocalDateString(actualOldestDate);
      const newestStr = toLocalDateString(currentNewest);
      
      const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldestStr}&newest=${newestStr}`;
      
      const response = await fetch(url, { method: 'GET', headers });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          // Merge and avoid duplicates if they overlap at the edges
          data.forEach(item => {
            if (!allWellness.find(existing => existing.id === item.id || existing.date === item.date)) {
              allWellness.push(item);
            }
          });
        }
      } else if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Move the window back
      currentNewest = new Date(actualOldestDate);
      currentNewest.setDate(currentNewest.getDate() - 1);
      
      if (actualOldestDate <= targetOldestDate) {
        remaining = false;
      }

      // Small pause to be kind to the API
      if (remaining) await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Sort chronologically
    return allWellness.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error("Wellness Fetch Error:", error);
    return allWellness;
  }
};

export const fetchActivityIntervals = async (activityId: string, creds: IntervalsCredentials): Promise<ActivityInterval[]> => {
  if (creds.apiKey === 'demo') return getMockIntervals();
  const { apiKey } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
  const url = `https://intervals.icu/api/v1/activity/${activityId}`;
  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) return [];
    const data = await response.json();
    const intervals = data.icu_intervals || data.intervals || data.laps;
    if (!Array.isArray(intervals) || intervals.length === 0) return [];
    
    return intervals.map((l: any) => {
      // Map raw intervals.icu properties to ActivityInterval
      const avgWatts = l.avg_watts !== undefined ? l.avg_watts : (l.average_watts !== undefined ? l.average_watts : (l.average_power !== undefined ? l.average_power : (l.avg_power !== undefined ? l.avg_power : 0)));
      const avgHr = l.avg_heartrate !== undefined ? l.avg_heartrate : (l.average_heartrate !== undefined ? l.average_heartrate : (l.avg_hr !== undefined ? l.avg_hr : (l.average_hr !== undefined ? l.average_hr : 0)));
      const movingTime = l.moving_time !== undefined ? l.moving_time : (l.elapsed_time !== undefined ? l.elapsed_time : (l.duration !== undefined ? l.duration : 0));
      
      // Map interval type to WORK | RECOVERY | WARMUP | COOLDOWN
      let type: 'WORK' | 'RECOVERY' | 'WARMUP' | 'COOLDOWN' = 'WORK';
      const rawType = (l.type || '').toUpperCase();
      if (rawType === 'RECOVERY') type = 'RECOVERY';
      else if (rawType === 'WARMUP') type = 'WARMUP';
      else if (rawType === 'COOLDOWN') type = 'COOLDOWN';
      else if (rawType === 'WORK' || rawType === 'ACTIVE') type = 'WORK';
      else {
        // Fallback or guess based on label or power
        const label = (l.label || '').toUpperCase();
        if (label.includes('WARM') || label.includes('WU')) type = 'WARMUP';
        else if (label.includes('REC') || label.includes('REST')) type = 'RECOVERY';
        else if (label.includes('WORK') || label.includes('INT') || label.includes('EFFORT')) type = 'WORK';
      }

      return {
        id: String(l.id || Math.random().toString(36).substr(2, 9)),
        start_index: l.start_index || 0,
        end_index: l.end_index || 0,
        average_watts: avgWatts,
        average_heartrate: avgHr,
        moving_time: movingTime,
        type,
        label: l.label
      };
    });
  } catch (error) { 
    console.error("fetchActivityIntervals error:", error);
    return []; 
  }
};

/**
 * Analyzes intervals/laps to detect structured workout sets and names the ride accordingly.
 */
export const detectIntervalsFromLaps = (activity: Activity, intervals: ActivityInterval[]): string | null => {
  if (!intervals || intervals.length === 0) return null;

  let ftp = 250;
  try {
    const savedFtp = localStorage.getItem('wattson_ftp');
    if (savedFtp) {
      ftp = parseInt(savedFtp, 10);
    }
  } catch {}

  const totalTime = activity.moving_time || 3600;

  // Safe property resolution helpers
  const getLapPower = (l: any) => l.average_watts ?? l.avg_watts ?? l.average_power ?? l.watts ?? 0;
  const getLapTime = (l: any) => l.moving_time ?? l.duration ?? l.elapsed_time ?? 0;

  // Filter for WORK laps/intervals
  const workLaps = intervals.filter(l => {
    const pwr = getLapPower(l);
    const dur = getLapTime(l);

    // Skip if duration is too short (< 10s) or is basically the entire ride (> 85% of total time)
    if (dur < 10 || dur > totalTime * 0.85) return false;

    const rawType = (l.type || '').toUpperCase();
    const isWorkType = rawType === 'WORK' || rawType === 'ACTIVE';
    const isWorkLabel = l.label && (
      l.label.toLowerCase().includes('work') || 
      l.label.toLowerCase().includes('interval') ||
      l.label.toLowerCase().includes('effort')
    );
    
    // Check if the average power of the lap is significantly high
    const avgActivityPower = activity.average_watts || activity.icu_average_watts || 150;
    const isHighPower = pwr > avgActivityPower * 1.12 || pwr >= ftp * 0.82;
    
    return isWorkType || isWorkLabel || isHighPower;
  });

  if (workLaps.length === 0) return null;

  // Group similar intervals
  const groups: { duration: number; watts: number; count: number; intervals: any[] }[] = [];
  for (const lap of workLaps) {
    const lPwr = getLapPower(lap);
    const lDur = getLapTime(lap);

    let matchedGroup = groups.find(g => {
      const durDiff = Math.abs(g.duration - lDur);
      const wattsDiff = Math.abs(g.watts - lPwr);
      
      // durMatch: duration within 35 seconds or 25%
      const durMatch = durDiff <= 35 || durDiff / Math.max(g.duration, lDur) <= 0.25;
      // wattsMatch: power within 30W or 15%
      const wattsMatch = wattsDiff <= 30 || wattsDiff / Math.max(g.watts, lPwr || 1) <= 0.15;
      
      return durMatch && wattsMatch;
    });

    if (matchedGroup) {
      matchedGroup.count += 1;
      matchedGroup.intervals.push(lap);
      matchedGroup.duration = Math.round(matchedGroup.intervals.reduce((sum, l) => sum + getLapTime(l), 0) / matchedGroup.count);
      matchedGroup.watts = Math.round(matchedGroup.intervals.reduce((sum, l) => sum + getLapPower(l), 0) / matchedGroup.count);
    } else {
      groups.push({
        duration: lDur,
        watts: lPwr,
        count: 1,
        intervals: [lap]
      });
    }
  }

  // Find the primary/most significant interval group using a Significance Score
  // This avoids accidental short/burst intervals overtaking a structured sweet spot or threshold set.
  const sortedGroups = groups
    .filter(g => {
      const pctFtp = g.watts / ftp;
      // Keep groups that are at least Tempo intensity (>= 72% FTP) or high power
      return pctFtp >= 0.72 || g.watts > ftp * 0.72;
    })
    .sort((a, b) => {
      const getSignificanceScore = (g: typeof a) => {
        const pctFtp = g.watts / ftp;
        const totalDuration = g.count * g.duration;
        
        // Base intensity weight - we favor sweet-spot, threshold, and VO2 max over raw short sprints
        let intensityWeight = 1.0;
        if (pctFtp >= 1.50) intensityWeight = 1.1; // Sprint
        else if (pctFtp >= 1.20) intensityWeight = 1.35; // Anaerobic
        else if (pctFtp >= 1.05) intensityWeight = 1.55; // VO2 Max
        else if (pctFtp >= 0.90) intensityWeight = 1.65; // Threshold
        else if (pctFtp >= 0.84) intensityWeight = 1.45; // Sweet Spot
        else if (pctFtp >= 0.75) intensityWeight = 1.25; // Tempo
        
        // Reps multiplier - we favor structured repeating sets
        const repsWeight = g.count === 1 ? 0.75 : (g.count === 2 ? 1.15 : (g.count >= 3 ? 1.4 : 1.0));
        
        return totalDuration * intensityWeight * repsWeight;
      };

      return getSignificanceScore(b) - getSignificanceScore(a);
    });

  const mainGroup = sortedGroups.find(g => {
    // For short intervals (< 5 min), require at least 2 reps to be a "set"
    if (g.duration < 300) {
      return g.count >= 2;
    }
    // For long intervals (>= 5 min), 1 rep is fine (e.g. 1x20 min threshold)
    return g.count >= 1;
  });

  if (!mainGroup) return null;

  const pctFtp = mainGroup.watts / ftp;
  let zoneName = 'Endurance';
  if (pctFtp >= 1.50 && mainGroup.duration < 30) zoneName = 'Sprint';
  else if (pctFtp >= 1.20 && mainGroup.duration < 90) zoneName = 'Anaerobic';
  else if (pctFtp >= 1.05) zoneName = 'VO2 Max';
  else if (pctFtp >= 0.90) zoneName = 'Threshold';
  else if (pctFtp >= 0.84) zoneName = 'Sweet Spot';
  else if (pctFtp >= 0.75) zoneName = 'Tempo';

  const formatDurationShort = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.round(secs % 60);
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
  };

  const durStr = formatDurationShort(mainGroup.duration);
  const wattsStr = mainGroup.watts > 0 ? ` @ ${Math.round(mainGroup.watts)}W` : '';
  
  return `${zoneName} Ride (${mainGroup.count}x ${durStr}${wattsStr})`;
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

export interface AthleteProfile {
  id: string;
  icu_ftp?: number;
}

export const fetchAthleteProfile = async (creds: IntervalsCredentials): Promise<AthleteProfile> => {
  const { apiKey, athleteId } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}`;
  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) throw new Error("Could not fetch athlete profile");
    return await response.json();
  } catch (error) {
    throw error;
  }
};

/**
 * Fetches power curve data for a specific year.
 */
export const fetchPowerCurve = async (creds: IntervalsCredentials, year: number): Promise<any> => {
  if (creds.apiKey === 'demo') return { year, bests: getMockPowerBests(year) };
  const { apiKey, athleteId } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
  
  const oldest = `${year}-01-01`;
  const newest = `${year}-12-31`;
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/power-curve?oldest=${oldest}&newest=${newest}`;
  
  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error fetching power curve for ${year}:`, error);
    return null;
  }
};

/**
 * Gets annual best efforts for standard intervals.
 */
export const getAnnualPowerCurves = async (creds: IntervalsCredentials, yearsCount: number = 3): Promise<any[]> => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: yearsCount }, (_, i) => currentYear - i);
  const results = [];

  const durations = [1, 5, 10, 20, 30, 60, 120, 180, 240, 300, 480, 600, 1200, 1800, 2700, 3600, 5400, 7200, 10800];

  for (const year of years) {
    const data = await fetchPowerCurve(creds, year);
    if (data && data.watts && data.secs) {
      const bests = durations.map(d => {
        // Find closest duration in returned data
        let idx = data.secs.indexOf(d);
        if (idx === -1) {
          // Find first index where secs >= d
          idx = data.secs.findIndex((s: number) => s >= d);
        }
        return {
          duration: d,
          watts: idx !== -1 ? data.watts[idx] : 0
        };
      });
      results.push({ year, bests });
    } else if (creds.apiKey === 'demo') {
      results.push({ year, bests: getMockPowerBests(year) });
    }
    // Small delay to be safe
    if (creds.apiKey !== 'demo') await new Promise(r => setTimeout(r, 200));
  }
  return results;
};

export const uploadWorkout = async (
  creds: IntervalsCredentials, 
  workout: { name: string; description: string; date: string; type?: string; moving_time?: number; icu_training_load?: number; workout_text?: string }
): Promise<any> => {
  if (creds.apiKey === 'demo') return { success: true };
  const { apiKey, athleteId } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = { 
    'Authorization': `Basic ${auth}`, 
    'Content-Type': 'application/json',
    'Accept': 'application/json' 
  };
  
  const body = {
    category: 'WORKOUT',
    start_date_local: `${workout.date}T09:00:00`,
    name: workout.name,
    description: workout.description,
    type: workout.type || 'Ride',
    moving_time: workout.moving_time || 3600,
    icu_training_load: workout.icu_training_load || 50,
    workout: workout.workout_text
  };

  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events`;
  try {
    const response = await fetch(url, { 
      method: 'POST', 
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const err = await response.text();
      console.error("Intervals.icu API error:", err);
      throw new Error(`Failed to upload workout: ${err}`);
    }
    return await response.json();
  } catch (error) {
    throw error;
  }
};

export const getMockActivities = (): Activity[] => {
  const mock: Activity[] = [];
  const now = new Date();
  // Provide 10 years of mock history to demonstrate "full history" analysis
  for (let i = 3650; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    // Add data for every other day to simulate a realistic training schedule
    if (i % 2 === 0) {
      mock.push({
        id: `mock-${i}`,
        name: i === 0 ? "Recovery Spin" : i % 10 === 0 ? "Interval Session" : i % 4 === 0 ? "Threshold Session" : "Endurance Ride",
        type: "VirtualRide",
        start_date_local: d.toISOString(),
        distance: 25000 + Math.random() * 5000,
        moving_time: 3600 + Math.random() * 600,
        elapsed_time: 3800 + Math.random() * 600,
        total_elevation_gain: 200 + Math.random() * 100,
        average_watts: 180 + Math.random() * 50,
        weighted_average_watts: 210 + Math.random() * 50,
        icu_training_load: 60 + Math.random() * 40,
        icu_eftp: 220 + Math.random() * 30,
        source: 'ZWIFT'
      });
    }
  }
  return mock;
};

export const getMockWellness = (): Wellness[] => {
  const now = new Date();
  const data: Wellness[] = [];
  // Matching 10 years of wellness
  for (let i = 3650; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = toLocalDateString(d);
    data.push({
      id: `mock-w-${i}`,
      date: dateStr,
      ctl: 45 + (180 - Math.min(i, 180)) * 0.2, // Simulate fitness build up
      atl: 40 + Math.random() * 20,
      tsb: 10 - Math.random() * 20,
      trainingLoad: i % 2 === 0 ? 60 : 0
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

export const getMockPowerBests = (year?: number) => {
  const currentYear = new Date().getFullYear();
  const targetYear = year || currentYear;
  
  if (targetYear === currentYear) {
    // Dit seizoen
    return [
      { duration: 1, watts: 1423 },
      { duration: 5, watts: 1363 },
      { duration: 10, watts: 1101 },
      { duration: 20, watts: 961 },
      { duration: 30, watts: 855 },
      { duration: 60, watts: 653 },
      { duration: 120, watts: 537 },
      { duration: 180, watts: 438 },
      { duration: 240, watts: 416 },
      { duration: 300, watts: 406 },
      { duration: 480, watts: 376 },
      { duration: 600, watts: 356 },
      { duration: 1200, watts: 319 },
      { duration: 1800, watts: 311 },
      { duration: 2700, watts: 297 },
      { duration: 3600, watts: 286 },
      { duration: 5400, watts: 278 },
      { duration: 7200, watts: 237 },
      { duration: 10800, watts: 224 }
    ];
  } else if (targetYear === currentYear - 1) {
    // Vorig seizoen
    return [
      { duration: 1, watts: 1472 },
      { duration: 5, watts: 1395 },
      { duration: 10, watts: 1255 },
      { duration: 20, watts: 1024 },
      { duration: 30, watts: 859 },
      { duration: 60, watts: 698 },
      { duration: 120, watts: 509 },
      { duration: 180, watts: 445 },
      { duration: 240, watts: 391 },
      { duration: 300, watts: 366 },
      { duration: 480, watts: 357 },
      { duration: 600, watts: 359 },
      { duration: 1200, watts: 306 },
      { duration: 1800, watts: 295 },
      { duration: 2700, watts: 292 },
      { duration: 3600, watts: 285 },
      { duration: 5400, watts: 278 },
      { duration: 7200, watts: 246 },
      { duration: 10800, watts: 229 }
    ];
  } else {
    // Aller tijden
    return [
      { duration: 1, watts: 1472 },
      { duration: 5, watts: 1395 },
      { duration: 10, watts: 1308 },
      { duration: 20, watts: 1095 },
      { duration: 30, watts: 895 },
      { duration: 60, watts: 729 },
      { duration: 120, watts: 584 },
      { duration: 180, watts: 476 },
      { duration: 240, watts: 444 },
      { duration: 300, watts: 433 },
      { duration: 480, watts: 390 },
      { duration: 600, watts: 374 },
      { duration: 1200, watts: 344 },
      { duration: 1800, watts: 341 },
      { duration: 2700, watts: 320 },
      { duration: 3600, watts: 314 },
      { duration: 5400, watts: 302 },
      { duration: 7200, watts: 268 },
      { duration: 10800, watts: 255 }
    ];
  }
};
