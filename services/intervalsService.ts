
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
    'icu_intervals', 'icu_groups'
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

    return allActivities.sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
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
 * Analyzes intervals/laps and power curves to detect structured workout sets and names the ride accordingly.
 */
export const detectIntervalsFromLaps = (activity: Activity, intervals?: ActivityInterval[]): string | null => {
  // Check if activity contains pre-grouped intervals from Intervals.icu
  const icuGroups = (activity as any).icu_groups;
  if (Array.isArray(icuGroups) && icuGroups.length > 0) {
    const mainG = icuGroups[0];
    if (mainG && mainG.count && mainG.duration) {
      const durSecs = mainG.duration;
      const count = mainG.count;
      const watts = mainG.avg_watts || mainG.average_watts || 0;
      
      let ftp = activity.icu_eftp || 250;
      try {
        const savedFtp = localStorage.getItem('wattson_ftp');
        if (savedFtp) ftp = parseInt(savedFtp, 10);
      } catch {}

      const pct = watts > 0 ? watts / ftp : 1.0;
      let zName = 'Interval';
      if (pct >= 1.05) zName = 'VO2 Max';
      else if (pct >= 0.90) zName = 'Threshold';
      else if (pct >= 0.84) zName = 'Sweet Spot';
      else if (pct >= 0.75) zName = 'Tempo';

      const m = Math.floor(durSecs / 60);
      const s = Math.round(durSecs % 60);
      const durStr = s > 0 && s < 45 ? `${m}m ${s}s` : (s >= 45 ? `${m + 1}m` : `${m}m`);
      const wStr = watts > 0 ? ` @ ${Math.round(watts)}W` : '';
      return `${zName} Ride (${count}x ${durStr}${wStr})`;
    }
  }

  // Combine provided intervals with activity properties if available
  let laps: any[] = [];
  if (intervals && intervals.length > 0) {
    laps = intervals;
  } else if (Array.isArray((activity as any).icu_laps) && (activity as any).icu_laps.length > 0) {
    laps = (activity as any).icu_laps;
  } else if (Array.isArray((activity as any).icu_intervals) && (activity as any).icu_intervals.length > 0) {
    laps = (activity as any).icu_intervals;
  } else if (Array.isArray((activity as any).icu_intervals_edited) && (activity as any).icu_intervals_edited.length > 0) {
    laps = (activity as any).icu_intervals_edited;
  } else if (Array.isArray((activity as any).laps) && (activity as any).laps.length > 0) {
    laps = (activity as any).laps;
  } else if (Array.isArray((activity as any).intervals) && (activity as any).intervals.length > 0) {
    laps = (activity as any).intervals;
  }

  let ftp = activity.icu_eftp || 0;
  if (!ftp || ftp <= 0) {
    try {
      const savedFtp = localStorage.getItem('wattson_ftp');
      if (savedFtp) {
        ftp = parseInt(savedFtp, 10);
      }
    } catch {}
  }
  if (!ftp || ftp <= 0) ftp = 250;

  const totalTime = activity.moving_time || activity.elapsed_time || 3600;

  if (laps && laps.length > 0) {
    const avgActivityPower = activity.average_watts || activity.icu_average_watts || 150;

    // Filter for WORK laps/intervals
    const workLaps = laps.filter(l => {
      const pwr = getLapPowerHelper(l);
      const dur = getLapTimeHelper(l);

      // Skip if duration is too short (< 8s) or is basically the entire ride (> 85% of total time)
      if (dur < 8 || dur > totalTime * 0.85) return false;

      const rawType = (l.type || '').toUpperCase();
      if (rawType === 'RECOVERY' || rawType === 'WARMUP' || rawType === 'COOLDOWN') return false;

      const isWorkType = rawType === 'WORK' || rawType === 'ACTIVE' || rawType === 'WORKOUT' || rawType === 'LAP';
      const labelLower = (l.label || '').toLowerCase();
      const isWorkLabel = labelLower.includes('work') || labelLower.includes('interval') || labelLower.includes('effort') || labelLower.includes('set');
      
      // Check if the average power of the lap is noticeably above ride average or >= 78% FTP
      const isHighPower = pwr > avgActivityPower * 1.06 || pwr >= ftp * 0.78;
      
      return isWorkType || isWorkLabel || isHighPower;
    });

    if (workLaps.length > 0) {
      // Group similar intervals
      const groups: { duration: number; watts: number; count: number; intervals: any[] }[] = [];
      for (const lap of workLaps) {
        const lPwr = getLapPowerHelper(lap);
        const lDur = getLapTimeHelper(lap);

        let matchedGroup = groups.find(g => {
          const durDiff = Math.abs(g.duration - lDur);
          const wattsDiff = Math.abs(g.watts - lPwr);
          
          // durMatch: duration within 40 seconds or 30%
          const durMatch = durDiff <= 40 || durDiff / Math.max(g.duration, lDur) <= 0.30;
          // wattsMatch: power within 35W or 20%
          const wattsMatch = wattsDiff <= 35 || wattsDiff / Math.max(g.watts, lPwr || 1) <= 0.20;
          
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

      // Rank groups by significance score
      const sortedGroups = groups
        .filter(g => {
          const pctFtp = g.watts / ftp;
          return pctFtp >= 0.72 || g.watts > ftp * 0.72;
        })
        .sort((a, b) => {
          const getSignificanceScore = (g: typeof a) => {
            const pctFtp = g.watts / ftp;
            const totalDuration = g.count * g.duration;
            
            let intensityWeight = 1.0;
            if (pctFtp >= 1.50) intensityWeight = 1.2;
            else if (pctFtp >= 1.20) intensityWeight = 1.4;
            else if (pctFtp >= 1.05) intensityWeight = 1.65; // VO2 Max
            else if (pctFtp >= 0.90) intensityWeight = 1.70; // Threshold
            else if (pctFtp >= 0.84) intensityWeight = 1.50; // Sweet Spot
            else if (pctFtp >= 0.75) intensityWeight = 1.25; // Tempo
            
            const repsWeight = g.count === 1 ? 0.75 : (g.count === 2 ? 1.25 : (g.count >= 3 ? 1.55 : 1.0));
            return totalDuration * intensityWeight * repsWeight;
          };

          return getSignificanceScore(b) - getSignificanceScore(a);
        });

      const mainGroup = sortedGroups.find(g => {
        if (g.duration < 300) return g.count >= 2;
        return g.count >= 1;
      });

      if (mainGroup) {
        const pctFtp = mainGroup.watts / ftp;
        let zoneName = 'Endurance';
        if (pctFtp >= 1.50 && mainGroup.duration < 45) zoneName = 'Sprint';
        else if (pctFtp >= 1.20 && mainGroup.duration < 120) zoneName = 'Anaerobic';
        else if (pctFtp >= 1.05) zoneName = 'VO2 Max';
        else if (pctFtp >= 0.90) zoneName = 'Threshold';
        else if (pctFtp >= 0.84) zoneName = 'Sweet Spot';
        else if (pctFtp >= 0.75) zoneName = 'Tempo';

        const formatDurationShort = (secs: number) => {
          if (secs < 60) return `${secs}s`;
          const mins = Math.floor(secs / 60);
          const remainingSecs = Math.round(secs % 60);
          if (remainingSecs >= 45) return `${mins + 1}m`;
          if (remainingSecs <= 15) return `${mins}m`;
          return `${mins}m ${remainingSecs}s`;
        };

        const durStr = formatDurationShort(mainGroup.duration);
        const wattsStr = mainGroup.watts > 0 ? ` @ ${Math.round(mainGroup.watts)}W` : '';
        
        return `${zoneName} Ride (${mainGroup.count}x ${durStr}${wattsStr})`;
      }
    }
  }

  // Fallback: Analyze Power Pattern / Curve through the ride
  const np = activity.weighted_average_watts || activity.icu_weighted_average_watts || 0;
  const avgPwr = activity.average_watts || activity.icu_average_watts || 0;
  const vi = activity.icu_variability_index || (avgPwr > 0 ? np / avgPwr : 1.0);
  const intensity = activity.icu_intensity || (np > 0 ? np / ftp : 0);

  if (vi >= 1.08 || intensity >= 0.82) {
    if (intensity >= 0.98 || (np >= ftp * 1.02 && vi >= 1.10)) {
      return `VO2 Max Ride (Intervals)`;
    } else if (intensity >= 0.88 || (np >= ftp * 0.90 && vi >= 1.08)) {
      return `Threshold Ride (Intervals)`;
    } else if (intensity >= 0.80) {
      return `Sweet Spot Ride (Intervals)`;
    }
  }

  return null;
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
