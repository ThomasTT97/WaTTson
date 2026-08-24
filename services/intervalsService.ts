
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

export const fetchActivities = async (creds: IntervalsCredentials, daysBack: number = 1095): Promise<Activity[]> => {
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
  
  const fields = [
    'id', 'name', 'type', 'start_date_local', 'moving_time', 'elapsed_time',
    'distance', 'total_elevation_gain', 'average_watts', 'weighted_average_watts', 
    'icu_average_watts', 'icu_weighted_average_watts', 'average_heartrate', 'max_heartrate',
    'average_cadence', 'max_watts', 'icu_training_load', 'icu_intensity', 'source', 
    'icu_tss', 'icu_joules', 'calories', 'icu_efficiency_factor', 'icu_variability_index',
    'icu_hr_variability', 'icu_hrr', 'has_heartrate', 'has_power', 'average_temp',
    'device_name', 'external_id', 'icu_pm_actual_load', 'icu_atl', 'icu_ctl', 'icu_tsb',
    'analyzed', 'icu_power_hr_z2_ef', 'icu_power_hr_z2', 'icu_power_hr_z2_hr', 'icu_eftp',
    'icu_intervals', 'icu_groups', 'icu_zone_times', 'icu_hr_zone_times'
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
          if (data.length === 0) {
            // No more activities exist further back, stop querying older chunks
            remaining = false;
          } else {
            data.forEach(item => {
              if (!allActivities.find(existing => existing.id === item.id)) {
                allActivities.push(item);
              }
            });
          }
        }
      } else {
        if (response.status === 401) throw new Error("Authentication failed: Invalid API Key.");
        if (response.status === 404) throw new Error(`Athlete ID ${athleteId} not found.`);
        if (response.status === 429) {
           console.warn("Intervals.icu rate limit hit. Throttling...");
           await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          remaining = false;
        }
      }

      currentNewest = new Date(actualOldestDate);
      currentNewest.setDate(currentNewest.getDate() - 1);

      if (actualOldestDate <= targetOldestDate) {
        remaining = false;
      }
      
      // Fast transition between chunks
      if (remaining) await new Promise(resolve => setTimeout(resolve, 50));
    }

    return allActivities
      .filter(item => {
        const dur = item.moving_time || item.elapsed_time || (item as any).time || (item as any).duration || (item as any).icu_recording_time || 0;
        const dist = item.distance || (item as any).icu_distance || 0;
        // Never display or process 0m / 0s / zero duration placeholder entries
        return dur >= 60 || dist >= 100;
      })
      .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  } catch (error: any) {
    console.error('Activities Fetch Error:', error);
    if (allActivities.length > 0) return allActivities;
    throw error;
  }
};

export const fetchWellness = async (creds: IntervalsCredentials, daysBack: number = 1095): Promise<Wellness[]> => {
  const { apiKey, athleteId } = creds;
  if (apiKey === 'demo') return getMockWellness();

  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  const now = new Date();
  
  // Wellness API returns 1 year at a time. Fetch in chunks.
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
          if (data.length === 0) {
            remaining = false;
          } else {
            // Merge and avoid duplicates if they overlap at the edges
            data.forEach(item => {
              if (!allWellness.find(existing => existing.id === item.id || existing.date === item.date)) {
                allWellness.push(item);
              }
            });
          }
        }
      } else if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        remaining = false;
      }

      // Move the window back
      currentNewest = new Date(actualOldestDate);
      currentNewest.setDate(currentNewest.getDate() - 1);
      
      if (actualOldestDate <= targetOldestDate) {
        remaining = false;
      }

      // Fast transition between chunks
      if (remaining) await new Promise(resolve => setTimeout(resolve, 50));
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
    
    // Check all potential arrays where Intervals.icu provides laps / intervals
    let rawIntervals: any[] = [];
    if (Array.isArray(data.icu_laps) && data.icu_laps.length > 0) {
      rawIntervals = data.icu_laps;
    } else if (Array.isArray(data.icu_intervals) && data.icu_intervals.length > 0) {
      rawIntervals = data.icu_intervals;
    } else if (Array.isArray(data.icu_intervals_edited) && data.icu_intervals_edited.length > 0) {
      rawIntervals = data.icu_intervals_edited;
    } else if (Array.isArray(data.laps) && data.laps.length > 0) {
      rawIntervals = data.laps;
    } else if (Array.isArray(data.intervals) && data.intervals.length > 0) {
      rawIntervals = data.intervals;
    }

    // Fallback: if empty, query the dedicated /intervals endpoint
    if (rawIntervals.length === 0) {
      try {
        const intervalsResp = await fetch(`https://intervals.icu/api/v1/activity/${activityId}/intervals`, { method: 'GET', headers });
        if (intervalsResp.ok) {
          const intervalsData = await intervalsResp.json();
          if (Array.isArray(intervalsData)) {
            rawIntervals = intervalsData;
          } else if (intervalsData && Array.isArray(intervalsData.intervals) && intervalsData.intervals.length > 0) {
            rawIntervals = intervalsData.intervals;
          } else if (intervalsData && Array.isArray(intervalsData.laps) && intervalsData.laps.length > 0) {
            rawIntervals = intervalsData.laps;
          }
        }
      } catch {}
    }

    if (rawIntervals.length === 0) return [];
    
    return rawIntervals.map((l: any, idx: number) => {
      // Map power metrics
      const avgWatts = (typeof l.average_watts === 'number' && l.average_watts > 0)
        ? l.average_watts
        : ((typeof l.avg_watts === 'number' && l.avg_watts > 0)
          ? l.avg_watts
          : ((typeof l.weighted_average_watts === 'number' && l.weighted_average_watts > 0)
            ? l.weighted_average_watts
            : ((typeof l.icu_weighted_average_watts === 'number' && l.icu_weighted_average_watts > 0)
              ? l.icu_weighted_average_watts
              : ((typeof l.average_power === 'number' && l.average_power > 0)
                ? l.average_power
                : ((typeof l.avg_power === 'number' && l.avg_power > 0)
                  ? l.avg_power
                  : (typeof l.watts === 'number' ? l.watts : 0))))));

      const maxWatts = (typeof l.max_watts === 'number' && l.max_watts > 0)
        ? l.max_watts
        : ((typeof l.max_power === 'number' && l.max_power > 0) ? l.max_power : undefined);
      
      // Map HR metrics
      const avgHr = (typeof l.average_heartrate === 'number' && l.average_heartrate > 0)
        ? l.average_heartrate
        : ((typeof l.avg_heartrate === 'number' && l.avg_heartrate > 0)
          ? l.avg_heartrate
          : ((typeof l.avg_hr === 'number' && l.avg_hr > 0)
            ? l.avg_hr
            : ((typeof l.average_hr === 'number' && l.average_hr > 0)
              ? l.average_hr
              : 0)));

      const maxHr = (typeof l.max_heartrate === 'number' && l.max_heartrate > 0)
        ? l.max_heartrate
        : ((typeof l.max_hr === 'number' && l.max_hr > 0) ? l.max_hr : undefined);

      const avgCadence = (typeof l.average_cadence === 'number' && l.average_cadence > 0)
        ? l.average_cadence
        : ((typeof l.avg_cadence === 'number' && l.avg_cadence > 0)
          ? l.avg_cadence
          : (typeof l.cadence === 'number' ? l.cadence : undefined));
      
      // Map duration in seconds
      const movingTime = (typeof l.moving_time === 'number' && l.moving_time > 0)
        ? l.moving_time 
        : ((typeof l.duration === 'number' && l.duration > 0)
          ? l.duration 
          : ((typeof l.elapsed_time === 'number' && l.elapsed_time > 0)
            ? l.elapsed_time 
            : ((typeof l.end_time === 'number' && typeof l.start_time === 'number' && l.end_time > l.start_time)
              ? l.end_time - l.start_time
              : (typeof l.end_index === 'number' && typeof l.start_index === 'number' && l.end_index > l.start_index
                ? l.end_index - l.start_index 
                : 0))));
      
      // Map interval type to WORK | RECOVERY | WARMUP | COOLDOWN
      let type: 'WORK' | 'RECOVERY' | 'WARMUP' | 'COOLDOWN' = 'WORK';
      const rawType = (l.type || '').toUpperCase();
      if (rawType === 'RECOVERY' || rawType === 'REST') type = 'RECOVERY';
      else if (rawType === 'WARMUP' || rawType === 'WU') type = 'WARMUP';
      else if (rawType === 'COOLDOWN' || rawType === 'CD') type = 'COOLDOWN';
      else if (rawType === 'WORK' || rawType === 'ACTIVE' || rawType === 'WORKOUT') type = 'WORK';
      else {
        // Fallback or guess based on label or power
        const label = (l.label || l.name || '').toUpperCase();
        if (label.includes('WARM') || label.includes('WU')) type = 'WARMUP';
        else if (label.includes('REC') || label.includes('REST') || label.includes('EASY')) type = 'RECOVERY';
        else if (label.includes('COOL') || label.includes('CD')) type = 'COOLDOWN';
        else if (label.includes('WORK') || label.includes('INT') || label.includes('EFFORT') || label.includes('SET')) type = 'WORK';
      }

      return {
        id: String(l.id || `lap_${idx + 1}`),
        start_index: l.start_index || (typeof l.start_time === 'number' ? l.start_time : 0),
        end_index: l.end_index || (typeof l.end_time === 'number' ? l.end_time : 0),
        average_watts: Math.round(avgWatts),
        max_watts: maxWatts ? Math.round(maxWatts) : undefined,
        average_heartrate: Math.round(avgHr),
        max_heartrate: maxHr ? Math.round(maxHr) : undefined,
        average_cadence: avgCadence ? Math.round(avgCadence) : undefined,
        moving_time: Math.round(movingTime),
        distance: typeof l.distance === 'number' ? Math.round(l.distance) : undefined,
        type,
        label: l.label || l.name || (l.type ? `${l.type}` : undefined)
      };
    });
  } catch (error) { 
    console.error("fetchActivityIntervals error:", error);
    return []; 
  }
};

/**
 * Helper to extract duration in seconds from any lap/interval object
 */
const getLapTimeHelper = (l: any): number => {
  if (typeof l.moving_time === 'number' && l.moving_time > 0) return l.moving_time;
  if (typeof l.duration === 'number' && l.duration > 0) return l.duration;
  if (typeof l.elapsed_time === 'number' && l.elapsed_time > 0) return l.elapsed_time;
  if (typeof l.end_index === 'number' && typeof l.start_index === 'number' && l.end_index > l.start_index) {
    return l.end_index - l.start_index;
  }
  return 0;
};

/**
 * Helper to extract power in watts from any lap/interval object
 */
const getLapPowerHelper = (l: any): number => {
  if (typeof l.average_watts === 'number' && l.average_watts > 0) return l.average_watts;
  if (typeof l.avg_watts === 'number' && l.avg_watts > 0) return l.avg_watts;
  if (typeof l.average_power === 'number' && l.average_power > 0) return l.average_power;
  if (typeof l.avg_power === 'number' && l.avg_power > 0) return l.avg_power;
  if (typeof l.watts === 'number' && l.watts > 0) return l.watts;
  return 0;
};

/**
 * Checks whether an activity contains genuine, intentional structured interval sets.
 * Prevents minor surges on endurance rides from falsely tagging an entire ride as VO2 Max.
 */
const detectStructuredWorkoutPattern = (laps: any[], ftp: number, totalTime: number): string | null => {
  if (!laps || laps.length === 0 || ftp <= 0) return null;

  // Filter for WORK laps/intervals with meaningful power and duration
  const workLaps = laps.filter(l => {
    const pwr = getLapPowerHelper(l);
    const dur = getLapTimeHelper(l);

    // Skip if duration is too short (< 15s) or represents the whole ride (> 80% total time)
    if (dur < 15 || dur > totalTime * 0.80) return false;

    const rawType = (l.type || '').toUpperCase();
    if (rawType === 'RECOVERY' || rawType === 'WARMUP' || rawType === 'COOLDOWN' || rawType === 'REST') return false;

    const labelLower = (l.label || '').toLowerCase();
    if (labelLower.includes('warm') || labelLower.includes('cool') || labelLower.includes('rest') || labelLower.includes('recov')) return false;

    // Power must be at least 75% FTP to qualify as an intentional work interval
    return pwr >= ftp * 0.75;
  });

  if (workLaps.length === 0) return null;

  // Group similar intervals
  const groups: { duration: number; watts: number; count: number; intervals: any[] }[] = [];
  for (const lap of workLaps) {
    const lPwr = getLapPowerHelper(lap);
    const lDur = getLapTimeHelper(lap);

    const matchedGroup = groups.find(g => {
      const durDiff = Math.abs(g.duration - lDur);
      const wattsDiff = Math.abs(g.watts - lPwr);
      const durMatch = durDiff <= 30 || durDiff / Math.max(g.duration, lDur) <= 0.25;
      const wattsMatch = wattsDiff <= 25 || wattsDiff / Math.max(g.watts, lPwr || 1) <= 0.15;
      return durMatch && wattsMatch;
    });

    if (matchedGroup) {
      matchedGroup.count += 1;
      matchedGroup.intervals.push(lap);
      matchedGroup.duration = Math.round(matchedGroup.intervals.reduce((sum, l) => sum + getLapTimeHelper(l), 0) / matchedGroup.count);
      matchedGroup.watts = Math.round(matchedGroup.intervals.reduce((sum, l) => sum + getLapPowerHelper(l), 0) / matchedGroup.count);
    } else {
      groups.push({
        duration: lDur,
        watts: lPwr,
        count: 1,
        intervals: [lap]
      });
    }
  }

  const formatDurationShort = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.round(secs % 60);
    if (remainingSecs >= 45) return `${mins + 1}m`;
    if (remainingSecs <= 15) return `${mins}m`;
    return `${mins}m ${remainingSecs}s`;
  };

  // Check each group against strict work volume criteria
  for (const g of groups) {
    const pctFtp = g.watts / ftp;
    const totalGroupWork = g.count * g.duration;

    // VO2 Max Intervals (>= 106% FTP): Must have real volume (e.g. 3+ reps of >= 75s, or 6+ reps of >= 25s, or 6+ mins total work)
    if (pctFtp >= 1.06 && pctFtp < 1.30) {
      const isValidVo2 = (g.count >= 3 && g.duration >= 75) || (g.count >= 6 && g.duration >= 25) || totalGroupWork >= 360;
      if (isValidVo2) {
        const durStr = formatDurationShort(g.duration);
        const wStr = g.watts > 0 ? ` @ ${Math.round(g.watts)}W` : '';
        return `VO2 Max Intervals (${g.count}x ${durStr}${wStr})`;
      }
    }

    // Anaerobic / Sprint Intervals (>= 130% FTP): Must have at least 4 reps of hard bursts
    if (pctFtp >= 1.30) {
      if (g.count >= 4 && g.duration <= 90) {
        const durStr = formatDurationShort(g.duration);
        const wStr = g.watts > 0 ? ` @ ${Math.round(g.watts)}W` : '';
        return pctFtp >= 1.55 ? `Sprint Intervals (${g.count}x ${durStr}${wStr})` : `Anaerobic Intervals (${g.count}x ${durStr}${wStr})`;
      }
    }

    // Threshold Intervals (90% - 105% FTP): Must have at least 2 reps >= 5min or 1 rep >= 12min (or 10+ mins work)
    if (pctFtp >= 0.90 && pctFtp < 1.06) {
      const isValidThresh = (g.count >= 2 && g.duration >= 300) || (g.count >= 1 && g.duration >= 720) || totalGroupWork >= 600;
      if (isValidThresh) {
        const durStr = formatDurationShort(g.duration);
        const wStr = g.watts > 0 ? ` @ ${Math.round(g.watts)}W` : '';
        return `Threshold Intervals (${g.count}x ${durStr}${wStr})`;
      }
    }

    // Sweet Spot Intervals (84% - 92% FTP): Must have at least 2 reps >= 8min or 1 rep >= 15min (or 15+ mins work)
    if (pctFtp >= 0.84 && pctFtp < 0.92) {
      const isValidSS = (g.count >= 2 && g.duration >= 480) || (g.count >= 1 && g.duration >= 900) || totalGroupWork >= 900;
      if (isValidSS) {
        const durStr = formatDurationShort(g.duration);
        const wStr = g.watts > 0 ? ` @ ${Math.round(g.watts)}W` : '';
        return `Sweet Spot Intervals (${g.count}x ${durStr}${wStr})`;
      }
    }

    // Tempo Intervals (76% - 83% FTP): Must have at least 2 reps >= 10min or 1 rep >= 20min
    if (pctFtp >= 0.76 && pctFtp < 0.84) {
      const isValidTempo = (g.count >= 2 && g.duration >= 600) || (g.count >= 1 && g.duration >= 1200) || totalGroupWork >= 1200;
      if (isValidTempo) {
        const durStr = formatDurationShort(g.duration);
        const wStr = g.watts > 0 ? ` @ ${Math.round(g.watts)}W` : '';
        return `Tempo Intervals (${g.count}x ${durStr}${wStr})`;
      }
    }
  }

  return null;
};

/**
 * Accurately analyzes activity metrics, time in power zones (Z1-Z7),
 * structured work intervals, Normalized Power, and Intensity Factor
 * to realistically name and categorize the workout.
 */
export const classifyActivityRide = (activity: Activity, passedIntervals?: ActivityInterval[]): string => {
  if (!activity) return 'Activity';

  const rawType = (activity.type || '').trim();
  const rawTypeLower = rawType.toLowerCase();
  const nameTrimmed = (activity.name || '').trim();
  const nameLower = nameTrimmed.toLowerCase();
  const movingTime = activity.moving_time || activity.elapsed_time || (activity as any).time || (activity as any).duration || (activity as any).icu_recording_time || 0;
  const distanceMeters = activity.distance || (activity as any).icu_distance || 0;
  const hours = movingTime / 3600;

  // 1. Walking & Hiking (Check FIRST so a walk is NEVER misclassified or called rest day)
  const isWalkType = rawTypeLower === 'walk' || rawTypeLower === 'walking' || rawTypeLower === 'casualwalk' || rawTypeLower === 'nordicwalking';
  const isHikeType = rawTypeLower === 'hike' || rawTypeLower === 'hiking' || rawTypeLower === 'trek' || rawTypeLower === 'trekking';
  const isWalkName = nameLower.includes('walk') || nameLower.includes('wandelen') || nameLower.includes('wandeling') || nameLower.includes('marche') || nameLower.includes('spaziergang') || nameLower.includes('spazieren') || nameLower.includes('paseo') || nameLower.includes('caminata') || nameLower.includes('passeggiata') || nameLower.includes('camminata');
  const isHikeName = nameLower.includes('hike') || nameLower.includes('randonnée') || nameLower.includes('trek');

  if (isHikeType || isHikeName) {
    return 'Hike';
  }
  if (isWalkType || isWalkName) {
    if (distanceMeters >= 10000 || movingTime >= 7200) return 'Long Walk';
    return 'Walk';
  }

  // 2. Explicit Rest Day Notes (ONLY if explicitly labeled as a rest day by the athlete)
  if (rawTypeLower === 'rest' || nameLower === 'rest day' || nameLower === 'rest' || nameLower === 'rustdag' || nameLower === 'repos' || nameLower === 'ruhetag') {
    return 'Rest Day';
  }

  // 3. Running
  const isRunType = rawTypeLower === 'run' || rawTypeLower === 'virtualrun' || rawTypeLower === 'trailrun' || rawTypeLower === 'treadmill';
  const isRunName = (nameLower.startsWith('run') || nameLower.includes(' run') || nameLower.endsWith('run') || nameLower.includes('hardlopen') || nameLower.includes('course à pied') || nameLower.includes('jog') || nameLower.includes('treadmill') || nameLower.includes('lopen')) && !nameLower.includes('ride') && !nameLower.includes('bike') && !nameLower.includes('cycle') && !nameLower.includes('zwift ride');
  if (isRunType || isRunName) {
    if (rawTypeLower === 'trailrun' || nameLower.includes('trail')) return 'Trail Run';
    if (rawTypeLower === 'virtualrun' || nameLower.includes('treadmill') || nameLower.includes('zwift run')) return 'Treadmill Run';
    if (nameLower.includes('interval') || nameLower.includes('track') || nameLower.includes('reps') || nameLower.includes('tempo')) return 'Interval Run';
    if (movingTime >= 7200 || distanceMeters >= 20000) return 'Long Run';
    return 'Run';
  }

  // 4. Swimming
  const isSwimType = rawTypeLower === 'swim' || rawTypeLower === 'swimming' || rawTypeLower === 'openwaterswim';
  const isSwimName = nameLower.includes('swim') || nameLower.includes('zwemmen') || nameLower.includes('natation') || nameLower.includes('nadar') || nameLower.includes('nuoto');
  if (isSwimType || isSwimName) {
    if (nameLower.includes('open water') || nameLower.includes('lake') || nameLower.includes('sea') || nameLower.includes('ocean')) return 'Open Water Swim';
    return 'Swim';
  }

  // 5. Strength, Gym & Resistance Training
  const isStrengthType = rawTypeLower === 'weighttraining' || rawTypeLower === 'strength' || rawTypeLower === 'crossfit' || rawTypeLower === 'gym';
  const isStrengthName = nameLower.includes('strength') || nameLower.includes('gym') || nameLower.includes('weight') || nameLower.includes('lifting') || nameLower.includes('push pull') || nameLower.includes('upper body') || nameLower.includes('lower body') || nameLower.includes('leg day') || nameLower.includes('kettlebell') || nameLower.includes('dumbbell') || nameLower.includes('bodyweight') || nameLower.includes('krafttraining') || nameLower.includes('kracht') || nameLower.includes('musculation');
  if (isStrengthType || isStrengthName) {
    if (nameLower.includes('crossfit') || rawTypeLower === 'crossfit') return 'CrossFit';
    if (nameLower.includes('core') || nameLower.includes('abs')) return 'Core Workout';
    return 'Strength Training';
  }

  // 6. Yoga, Pilates, Stretching & Mobility
  if (rawTypeLower === 'yoga' || nameLower.includes('yoga')) return 'Yoga';
  if (rawTypeLower === 'pilates' || nameLower.includes('pilates')) return 'Pilates';
  if (rawTypeLower === 'stretching' || nameLower.includes('stretch') || nameLower.includes('mobility') || nameLower.includes('rek')) return 'Mobility & Stretching';

  // 7. Rowing & Water Sports
  if (rawTypeLower === 'rowing' || rawTypeLower === 'virtualrow' || nameLower.includes('rowing') || nameLower.includes('concept2') || nameLower.includes(' erg')) return 'Rowing';
  if (rawTypeLower === 'kayaking' || nameLower.includes('kayak')) return 'Kayaking';
  if (rawTypeLower === 'canoeing' || nameLower.includes('canoe')) return 'Canoeing';
  if (rawTypeLower === 'standuppaddling' || rawTypeLower === 'sup' || nameLower.includes('paddleboard') || nameLower.includes('sup')) return 'Stand Up Paddling';
  if (rawTypeLower === 'surfing' || nameLower.includes('surf')) return 'Surfing';

  // 8. Winter Sports
  if (rawTypeLower === 'alpineski' || rawTypeLower === 'backcountryski' || nameLower.includes('alpine ski') || nameLower.includes('downhill ski')) return 'Skiing';
  if (rawTypeLower === 'nordicski' || nameLower.includes('nordic') || nameLower.includes('cross country ski')) return 'Nordic Ski';
  if (rawTypeLower === 'snowboard' || nameLower.includes('snowboard')) return 'Snowboarding';
  if (rawTypeLower === 'snowshoe' || nameLower.includes('snowshoe')) return 'Snowshoeing';
  if (rawTypeLower === 'iceskate' || nameLower.includes('ice skate')) return 'Ice Skating';
  if (rawTypeLower === 'rollerski' || rawTypeLower === 'inlineskate' || nameLower.includes('inline skate')) return 'Inline Skating';

  // 9. Cardio Machines & Court / Team Sports
  if (rawTypeLower === 'elliptical' || nameLower.includes('elliptical')) return 'Elliptical';
  if (rawTypeLower === 'stairstepper' || nameLower.includes('stair')) return 'Stair Stepper';
  if (rawTypeLower === 'tennis' || nameLower.includes('tennis')) return 'Tennis';
  if (rawTypeLower === 'pickleball' || nameLower.includes('pickleball')) return 'Pickleball';
  if (rawTypeLower === 'padel' || nameLower.includes('padel')) return 'Padel';
  if (rawTypeLower === 'squash' || nameLower.includes('squash')) return 'Squash';
  if (rawTypeLower === 'badminton' || nameLower.includes('badminton')) return 'Badminton';
  if (rawTypeLower === 'soccer' || rawTypeLower === 'football' || nameLower.includes('soccer') || nameLower.includes('football')) return 'Soccer';
  if (rawTypeLower === 'basketball' || nameLower.includes('basketball')) return 'Basketball';
  if (rawTypeLower === 'golf' || nameLower.includes('golf')) return 'Golf';
  if (rawTypeLower === 'workout' || rawTypeLower === 'fitness') return 'Workout';

  // 10. Check if user already provided a custom specific non-ride name and there's no power or cycling data
  const hasCyclingPower = (activity.average_watts && activity.average_watts > 0) || (activity.weighted_average_watts && activity.weighted_average_watts > 0) || (activity.icu_average_watts && activity.icu_average_watts > 0);
  const isExplicitRide = rawTypeLower === 'ride' || rawTypeLower === 'virtualride' || rawTypeLower === 'ebikeride' || rawTypeLower === 'mountainbikeride' || rawTypeLower === 'gravelride';

  if (!hasCyclingPower && !isExplicitRide && nameTrimmed.length > 0 && !nameLower.includes('activity') && !nameLower.includes('morning ride') && !nameLower.includes('evening ride') && !nameLower.includes('afternoon ride')) {
    return nameTrimmed;
  }

  // --- CYCLING RIDE ANALYSIS ---
  
  // 1. Resolve Athlete's FTP
  let ftp = activity.icu_eftp || 0;
  if (!ftp || ftp <= 0) {
    try {
      const savedFtp = localStorage.getItem('wattson_ftp');
      if (savedFtp) ftp = parseInt(savedFtp, 10);
    } catch {}
  }
  if (!ftp || ftp <= 0) ftp = 250;

  // 2. Resolve Power & True Intensity Factor (IF)
  const avgWatts = Math.round(activity.average_watts ?? activity.icu_average_watts ?? 0);
  let npWatts = Math.round(activity.weighted_average_watts ?? activity.icu_weighted_average_watts ?? 0);
  if (npWatts === 0 && avgWatts > 0 && activity.icu_variability_index && activity.icu_variability_index > 1.01) {
    npWatts = Math.round(avgWatts * activity.icu_variability_index);
  }
  const effectivePower = npWatts > 0 ? npWatts : avgWatts;

  let intensity = activity.icu_intensity;
  if (intensity !== undefined && intensity !== null && intensity > 2.0) {
    intensity = intensity / 100; // normalize percentage (e.g. 75.4 -> 0.754)
  }
  if (intensity === undefined || intensity === null || intensity <= 0 || intensity > 2.0 || isNaN(intensity)) {
    if (effectivePower > 0 && ftp > 0) {
      intensity = effectivePower / ftp;
    } else {
      const load = activity.icu_training_load ?? activity.icu_tss ?? activity.training_load ?? 0;
      if (load > 0 && hours > 0) {
        intensity = Math.sqrt(load / (100 * hours));
      } else {
        intensity = 0.70;
      }
    }
  }

  // 3. Structured Work Intervals Detection (if structured intervals exist)
  let laps: any[] = [];
  if (passedIntervals && passedIntervals.length > 0) laps = passedIntervals;
  else if (Array.isArray((activity as any).icu_intervals) && (activity as any).icu_intervals.length > 0) laps = (activity as any).icu_intervals;
  else if (Array.isArray((activity as any).icu_intervals_edited) && (activity as any).icu_intervals_edited.length > 0) laps = (activity as any).icu_intervals_edited;
  else if (Array.isArray((activity as any).icu_laps) && (activity as any).icu_laps.length > 0) laps = (activity as any).icu_laps;
  else if (Array.isArray((activity as any).laps) && (activity as any).laps.length > 0) laps = (activity as any).laps;
  else if (Array.isArray((activity as any).intervals) && (activity as any).intervals.length > 0) laps = (activity as any).intervals;

  const detectedIntervalPattern = detectStructuredWorkoutPattern(laps, ftp, movingTime);
  if (detectedIntervalPattern) {
    return detectedIntervalPattern;
  }

  // 4. Inspect Time in Power Zones (icu_zone_times)
  // Intervals.icu returns [Z1, Z2, Z3, Z4, Z5, Z6, Z7] in seconds
  const zTimes = activity.icu_zone_times;
  let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0, z6 = 0, z7 = 0;
  let hasZoneTimes = false;
  if (Array.isArray(zTimes) && zTimes.length >= 5) {
    hasZoneTimes = true;
    z1 = zTimes[0] || 0; // Active Recovery (<55% FTP)
    z2 = zTimes[1] || 0; // Endurance (56-75% FTP)
    z3 = zTimes[2] || 0; // Tempo (76-90% FTP)
    z4 = zTimes[3] || 0; // Threshold (91-105% FTP)
    z5 = zTimes[4] || 0; // VO2 Max (106-120% FTP)
    z6 = zTimes[5] || 0; // Anaerobic (121-150% FTP)
    z7 = zTimes[6] || 0; // Neuromuscular / Sprint (>150% FTP)
  }
  const totalZoneSeconds = z1 + z2 + z3 + z4 + z5 + z6 + z7;
  const timeAboveFtp = z5 + z6 + z7; // Z5+
  const timeThreshold = z4;
  const timeSweetSpotOrTempo = z3;
  const timeAerobic = z1 + z2;

  // 5. Zone-Based Physiology Classification (Time in Zone)
  if (hasZoneTimes && totalZoneSeconds >= 600) {
    const fracAboveFtp = timeAboveFtp / totalZoneSeconds;
    const fracThreshold = timeThreshold / totalZoneSeconds;
    const fracTempo = timeSweetSpotOrTempo / totalZoneSeconds;
    const fracAerobic = timeAerobic / totalZoneSeconds;

    // VO2 Max check: Requires real, significant time above FTP (at least 8-10 mins OR >8% of ride)
    // AND high overall ride intensity. Never classify an endurance ride with occasional surges as VO2 Max.
    if ((timeAboveFtp >= 480 && fracAboveFtp >= 0.08 && intensity >= 0.80) || (timeAboveFtp >= 720 && intensity >= 0.78)) {
      return 'VO2 Max Ride';
    }

    // Anaerobic / Sprint check
    if ((z6 + z7) >= 300 && (z6 + z7) / totalZoneSeconds >= 0.05 && intensity >= 0.82) {
      return 'Anaerobic Ride';
    }

    // Threshold check: At least 10-12 mins in Z4 Threshold
    if ((timeThreshold >= 600 && fracThreshold >= 0.10 && intensity >= 0.80) || (timeThreshold >= 900 && intensity >= 0.76)) {
      return 'Threshold Ride';
    }

    // Sweet Spot / Tempo check: At least 18-20 mins in Z3/SweetSpot with decent intensity
    if ((timeSweetSpotOrTempo >= 1080 && (fracTempo + fracThreshold) >= 0.20 && intensity >= 0.77) || (timeSweetSpotOrTempo >= 1800 && intensity >= 0.75)) {
      return intensity >= 0.83 ? 'Sweet Spot Ride' : 'Tempo Ride';
    }

    // Endurance / Recovery / Long Ride
    if (fracAerobic >= 0.60 || intensity < 0.77) {
      if (movingTime >= 12600) return 'Long Endurance Ride'; // 3.5h+
      if (movingTime >= 7200) return 'Endurance Ride';       // 2h+
      if (movingTime < 3600 && intensity < 0.62) return 'Recovery Spin';
      return 'Endurance Ride';
    }
  }

  // 6. Intensity Factor & Duration Fallback (when zone times not detailed)
  if (intensity < 0.60 && movingTime < 4500) {
    return 'Recovery Spin';
  } else if (intensity < 0.76) {
    if (movingTime >= 12600) return 'Long Endurance Ride'; // 3.5h+
    if (movingTime >= 7200) return 'Endurance Ride';       // 2h+
    return 'Endurance Ride';
  } else if (intensity < 0.83) {
    return 'Tempo Ride';
  } else if (intensity < 0.90) {
    return 'Sweet Spot Ride';
  } else if (intensity < 1.05) {
    return 'Threshold Ride';
  } else {
    // Only classify as VO2 Max if moving time is <= 2 hours (not a multi-hour ride miscalculation)
    if (movingTime <= 7200) {
      return 'VO2 Max Ride';
    } else {
      return 'Endurance Ride';
    }
  }
};

/**
 * Analyzes intervals/laps and power curves to detect structured workout sets and names the ride accordingly.
 */
export const detectIntervalsFromLaps = (activity: Activity, intervals?: ActivityInterval[]): string | null => {
  return classifyActivityRide(activity, intervals);
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
