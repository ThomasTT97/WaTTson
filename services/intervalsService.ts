
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

const INTERVALS_BASE_DIRECT = 'https://intervals.icu';
const INTERVALS_BASE_PROXY = '/api/intervals-proxy';

/**
 * Robust fetch wrapper for Intervals.icu that handles:
 * - Automatic retry with exponential backoff on 429 rate limits
 * - Transparent fallback to Vite dev proxy if direct CORS / network request is blocked
 * - Transient error resilience
 */
export const intervalsFetch = async (
  endpointOrUrl: string,
  options: RequestInit = {},
  retries = 2
): Promise<Response> => {
  const isAbsolute = endpointOrUrl.startsWith('http://') || endpointOrUrl.startsWith('https://');
  const path = isAbsolute 
    ? endpointOrUrl.replace(/^https?:\/\/[^/]+/, '') 
    : (endpointOrUrl.startsWith('/') ? endpointOrUrl : `/${endpointOrUrl}`);

  const directUrl = `${INTERVALS_BASE_DIRECT}${path}`;
  const proxyUrl = `${INTERVALS_BASE_PROXY}${path}`;

  let attempt = 0;
  let lastError: any = null;

  while (attempt <= retries) {
    try {
      const res = await fetch(directUrl, options);
      if (res.status === 429 && attempt < retries) {
        const delay = (attempt + 1) * 1500;
        console.warn(`[Intervals.icu] Rate limit (429) hit. Backing off ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        attempt++;
        continue;
      }
      return res;
    } catch (err: any) {
      lastError = err;
      // If direct request failed with TypeError (e.g. CORS block, browser ad-blocker, or network drop)
      if (typeof window !== 'undefined') {
        try {
          const proxyRes = await fetch(proxyUrl, options);
          if (proxyRes.ok || proxyRes.status === 401 || proxyRes.status === 404 || proxyRes.status === 422) {
            return proxyRes;
          }
        } catch {
          // proxy fallback also failed
        }
      }

      if (attempt < retries) {
        const delay = (attempt + 1) * 1000;
        await new Promise(r => setTimeout(r, delay));
        attempt++;
      } else {
        break;
      }
    }
  }

  throw lastError || new Error("Failed to connect to Intervals.icu");
};

export const fetchAthleteId = async (apiKey: string): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required.");
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  try {
    const response = await intervalsFetch('/api/v1/whoami', {
      headers: { 
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
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
    
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Intervals.icu returned an unexpected format. Check if the service is down or you are logged out.");
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
  const currentYear = now.getFullYear();
  const oldestAllowedYear = currentYear - Math.ceil(daysBack / 365);

  const activitiesMap = new Map<string, Activity>();

  // Helper to fetch a specific date range with automatic 500-limit sub-division
  const fetchDateRange = async (oldestStr: string, newestStr: string, depth = 0): Promise<Activity[]> => {
    let rateLimitRetries = 0;
    while (rateLimitRetries < 3) {
      try {
        const url = `/api/v1/athlete/${athleteId}/activities?oldest=${oldestStr}&newest=${newestStr}&limit=2000&_t=${Date.now()}`;
        const response = await intervalsFetch(url, { method: 'GET', headers });
        
        if (response.ok) {
          const data = await response.json();
          if (!Array.isArray(data)) return [];

          // If Intervals.icu returned ~500 items (or exactly 500), it hit the platform default page limit!
          // Subdivide the range into two halves to capture all missing rides without truncation
          if (data.length >= 490 && depth < 2) {
            const startD = new Date(oldestStr + 'T00:00:00');
            const endD = new Date(newestStr + 'T23:59:59');
            const midTime = startD.getTime() + (endD.getTime() - startD.getTime()) / 2;
            const midDate = new Date(midTime);
            
            const midStr1 = toLocalDateString(midDate);
            const midDate2 = new Date(midDate);
            midDate2.setDate(midDate2.getDate() + 1);
            const midStr2 = toLocalDateString(midDate2);

            const [part1, part2] = await Promise.all([
              fetchDateRange(oldestStr, midStr1, depth + 1),
              fetchDateRange(midStr2, newestStr, depth + 1)
            ]);

            const combined = [...part1];
            const seen = new Set(part1.map(p => p.id));
            part2.forEach(p => {
              if (!seen.has(p.id)) combined.push(p);
            });
            return combined;
          }

          return data;
        }

        if (response.status === 401) throw new Error("Authentication failed: Invalid API Key.");
        if (response.status === 404) throw new Error(`Athlete ID ${athleteId} not found.`);
        if (response.status === 429) {
          rateLimitRetries++;
          await new Promise(resolve => setTimeout(resolve, 1500 * rateLimitRetries));
          continue;
        }

        console.warn(`[Intervals.icu] HTTP ${response.status} for range ${oldestStr}..${newestStr}`);
        return [];
      } catch (err: any) {
        if (err.message && (err.message.includes('Authentication') || err.message.includes('Athlete ID'))) {
          throw err;
        }
        rateLimitRetries++;
        if (rateLimitRetries >= 3) {
          console.warn(`[Intervals.icu] Failed fetching range ${oldestStr}..${newestStr}:`, err);
          return [];
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * rateLimitRetries));
      }
    }
    return [];
  };

  try {
    let emptyStreak = 0;

    // Fetch year by year backwards, ensuring 2026, 2025, 2024, 2023, 2022, 2021... are all covered
    for (let yr = currentYear; yr >= oldestAllowedYear; yr--) {
      const isCurrent = (yr === currentYear);
      // For current year, buffer forward 2 days to account for UTC vs local offsets
      const newestStr = isCurrent 
        ? toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2))
        : `${yr}-12-31`;
      const oldestStr = `${yr}-01-01`;

      const yearActivities = await fetchDateRange(oldestStr, newestStr);

      if (yearActivities.length === 0) {
        // Only trigger empty streak for years prior to 2023 to protect recent athlete history
        if (yr < 2023) {
          emptyStreak++;
          if (emptyStreak >= 3) {
            // 3 consecutive empty years in the distant past -> reached start of athlete career
            break;
          }
        }
      } else {
        emptyStreak = 0;
        yearActivities.forEach(item => {
          if (item && item.id) {
            activitiesMap.set(String(item.id), item);
          }
        });
      }

      // Safe pacing between years
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    const allActivities = Array.from(activitiesMap.values());

    return allActivities
      .filter(item => {
        const dur = item.moving_time || item.elapsed_time || (item as any).time || (item as any).duration || (item as any).icu_recording_time || 0;
        const dist = item.distance || (item as any).icu_distance || 0;
        return dur >= 60 || dist >= 100;
      })
      .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  } catch (error: any) {
    console.error('Activities Fetch Error:', error);
    const existing = Array.from(activitiesMap.values());
    if (existing.length > 0) return existing;
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
  const currentYear = now.getFullYear();
  const oldestAllowedYear = currentYear - Math.ceil(daysBack / 365);
  
  const wellnessMap = new Map<string, Wellness>();

  try {
    let emptyStreak = 0;

    for (let yr = currentYear; yr >= oldestAllowedYear; yr--) {
      const isCurrent = (yr === currentYear);
      const newestStr = isCurrent 
        ? toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2))
        : `${yr}-12-31`;
      const oldestStr = `${yr}-01-01`;
      
      const url = `/api/v1/athlete/${athleteId}/wellness?oldest=${oldestStr}&newest=${newestStr}&_t=${Date.now()}`;
      
      let rateLimitRetries = 0;
      while (rateLimitRetries < 3) {
        try {
          const response = await intervalsFetch(url, { method: 'GET', headers });
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
              if (data.length === 0) {
                if (yr < 2023) {
                  emptyStreak++;
                  if (emptyStreak >= 3) break;
                }
              } else {
                emptyStreak = 0;
                data.forEach(item => {
                  if (item && item.date) {
                    wellnessMap.set(item.date, item);
                  }
                });
              }
            }
            break;
          } else if (response.status === 429) {
            rateLimitRetries++;
            await new Promise(resolve => setTimeout(resolve, 1500 * rateLimitRetries));
            continue;
          } else {
            break;
          }
        } catch {
          rateLimitRetries++;
          await new Promise(resolve => setTimeout(resolve, 1000 * rateLimitRetries));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 80));
    }
    
    return Array.from(wellnessMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.warn("Could not fetch wellness data:", error);
    return Array.from(wellnessMap.values());
  }
};

export const fetchActivityIntervals = async (activityId: string, creds: IntervalsCredentials): Promise<ActivityInterval[]> => {
  if (creds.apiKey === 'demo') return getMockIntervals();
  const { apiKey } = creds;
  const auth = btoa(`API_KEY:${apiKey.trim()}`);
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
  
  const cleanId = encodeURIComponent(String(activityId).trim());
  const urlWithIntervals = `/api/v1/activity/${cleanId}?intervals=true`;
  const urlStandard = `/api/v1/activity/${cleanId}`;

  try {
    // 1. Fetch with ?intervals=true (Intervals.icu official parameter for detailed intervals & laps)
    let response = await intervalsFetch(urlWithIntervals, { method: 'GET', headers });
    if (!response.ok) {
      // Fallback: try standard activity endpoint if ?intervals=true was rejected
      response = await intervalsFetch(urlStandard, { method: 'GET', headers });
    }
    if (!response.ok) return [];
    
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Intervals.icu returned an unexpected format.");
    }
    const data = await response.json();
    if (!data) return [];
    
    // Check all potential arrays where Intervals.icu provides laps / intervals
    let rawIntervals: any[] = [];
    if (Array.isArray(data)) {
      rawIntervals = data;
    } else if (Array.isArray(data.icu_intervals) && data.icu_intervals.length > 1) {
      // Prefer icu_intervals when it contains multiple intervals
      rawIntervals = data.icu_intervals;
    } else if (Array.isArray(data.laps) && data.laps.length > 1) {
      // Prefer hardware device laps (Wahoo, Garmin) if icu_intervals only had 1
      rawIntervals = data.laps;
    } else if (Array.isArray(data.icu_laps) && data.icu_laps.length > 1) {
      rawIntervals = data.icu_laps;
    } else if (Array.isArray(data.icu_intervals_edited) && data.icu_intervals_edited.length > 1) {
      rawIntervals = data.icu_intervals_edited;
    } else if (Array.isArray(data.icu_intervals) && data.icu_intervals.length > 0) {
      rawIntervals = data.icu_intervals;
    } else if (Array.isArray(data.laps) && data.laps.length > 0) {
      rawIntervals = data.laps;
    } else if (Array.isArray(data.icu_laps) && data.icu_laps.length > 0) {
      rawIntervals = data.icu_laps;
    } else if (Array.isArray(data.icu_intervals_edited) && data.icu_intervals_edited.length > 0) {
      rawIntervals = data.icu_intervals_edited;
    } else if (Array.isArray(data.intervals) && data.intervals.length > 0) {
      rawIntervals = data.intervals;
    }

    // 2. Extra Fallback: if still empty, check if /api/v1/activity/{id} without query has anything
    if (rawIntervals.length === 0 && urlWithIntervals !== urlStandard) {
      try {
        const fallbackResp = await intervalsFetch(urlStandard, { method: 'GET', headers });
        if (fallbackResp.ok) {
          const fallbackData = await fallbackResp.json();
          if (Array.isArray(fallbackData.icu_intervals) && fallbackData.icu_intervals.length > 0) {
            rawIntervals = fallbackData.icu_intervals;
          } else if (Array.isArray(fallbackData.laps) && fallbackData.laps.length > 0) {
            rawIntervals = fallbackData.laps;
          } else if (Array.isArray(fallbackData.icu_laps) && fallbackData.icu_laps.length > 0) {
            rawIntervals = fallbackData.icu_laps;
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
              : (typeof l.hr === 'number' ? l.hr : 0))));

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

      // Map zone and intensity if provided by Intervals.icu
      const zone = typeof l.zone === 'number' ? l.zone : undefined;
      let intensity = typeof l.intensity === 'number' ? l.intensity : undefined;
      if (intensity !== undefined && intensity > 2.0) {
        intensity = intensity / 100;
      }
      
      // Map interval type to WORK | RECOVERY | WARMUP | COOLDOWN
      let type: 'WORK' | 'RECOVERY' | 'WARMUP' | 'COOLDOWN' = 'WORK';
      const rawType = (l.type || '').toUpperCase();
      if (rawType === 'RECOVERY' || rawType === 'REST') type = 'RECOVERY';
      else if (rawType === 'WARMUP' || rawType === 'WU') type = 'WARMUP';
      else if (rawType === 'COOLDOWN' || rawType === 'CD') type = 'COOLDOWN';
      else if (rawType === 'WORK' || rawType === 'ACTIVE' || rawType === 'WORKOUT' || rawType === 'INTERVAL') type = 'WORK';
      else if (zone !== undefined) {
        if (zone <= 2) {
          if (idx === 0) type = 'WARMUP';
          else if (idx === rawIntervals.length - 1) type = 'COOLDOWN';
          else type = 'RECOVERY';
        } else {
          type = 'WORK';
        }
      } else if (intensity !== undefined) {
        if (intensity <= 0.70) {
          if (idx === 0) type = 'WARMUP';
          else if (idx === rawIntervals.length - 1) type = 'COOLDOWN';
          else type = 'RECOVERY';
        } else {
          type = 'WORK';
        }
      } else {
        // Fallback or guess based on label or power
        const label = (l.label || l.name || '').toUpperCase();
        if (label.includes('WARM') || label.includes('WU')) type = 'WARMUP';
        else if (label.includes('REC') || label.includes('REST') || label.includes('EASY')) type = 'RECOVERY';
        else if (label.includes('COOL') || label.includes('CD')) type = 'COOLDOWN';
        else if (label.includes('WORK') || label.includes('INT') || label.includes('EFFORT') || label.includes('SET')) type = 'WORK';
      }

      // Generate a user-friendly label if none was stored
      let label = l.label || l.name;
      if (!label) {
        if (zone !== undefined) {
          if (zone === 1 || zone === 2) {
            label = idx === 0 ? 'Warmup (Z2)' : idx === rawIntervals.length - 1 ? 'Cooldown (Z2)' : 'Recovery (Z2)';
          } else if (zone === 3) {
            label = 'Tempo Effort (Z3)';
          } else if (zone === 4) {
            label = 'Sweet Spot / Threshold (Z4)';
          } else if (zone === 5) {
            label = 'VO2 Max Effort (Z5)';
          } else if (zone === 6) {
            label = 'Anaerobic Effort (Z6)';
          } else if (zone >= 7) {
            label = 'Sprint Burst (Z7)';
          }
        } else {
          label = type === 'WORK' ? 'Work Interval' : type === 'RECOVERY' ? 'Recovery' : type === 'WARMUP' ? 'Warmup' : type === 'COOLDOWN' ? 'Cooldown' : `Lap ${idx + 1}`;
        }
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
        label,
        zone,
        intensity: intensity ? Math.round(intensity * 100) / 100 : undefined
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

  // Check if multiple work intervals exist across the same training zone (e.g. 20m + 10m @ 274W)
  const threshSsLaps = workLaps.filter(l => {
    const pwr = getLapPowerHelper(l);
    const pct = pwr / ftp;
    return pct >= 0.84 && pct <= 1.05 && getLapTimeHelper(l) >= 300;
  });

  if (threshSsLaps.length >= 2) {
    const totalSecs = threshSsLaps.reduce((sum, l) => sum + getLapTimeHelper(l), 0);
    if (totalSecs >= 900) {
      const avgP = Math.round(threshSsLaps.reduce((sum, l) => sum + getLapPowerHelper(l), 0) / threshSsLaps.length);
      const durList = threshSsLaps.map(l => formatDurationShort(getLapTimeHelper(l))).join(', ');
      
      // Check for a secondary high-intensity finish effort (e.g. 5m @ 324W)
      const vo2Laps = workLaps.filter(l => (getLapPowerHelper(l) / ftp) >= 1.06 && getLapTimeHelper(l) >= 120);
      const vo2Suffix = vo2Laps.length > 0 
        ? ` + ${vo2Laps.map(l => `${formatDurationShort(getLapTimeHelper(l))} @ ${Math.round(getLapPowerHelper(l))}W`).join(', ')}`
        : '';

      const isHighThresh = (avgP / ftp) >= 0.93;
      const zoneName = isHighThresh ? 'Threshold / Sweet Spot Intervals' : 'Sweet Spot Intervals';
      return `${zoneName} (${durList} @ ~${avgP}W${vo2Suffix})`;
    }
  }

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
  let npWatts = Math.round(activity.weighted_average_watts ?? activity.icu_weighted_avg_watts ?? activity.icu_weighted_average_watts ?? 0);
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
  const url = `/api/v1/athlete/${athleteId}/events?oldest=${dateStr}&newest=${dateStr}`;
  try {
    const response = await intervalsFetch(url, { method: 'GET', headers });
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
  const url = `/api/v1/athlete/${athleteId}`;
  try {
    const response = await intervalsFetch(url, { method: 'GET', headers });
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

  // Try /power-curve first, fallback to /power-curves
  const endpoints = [
    `/api/v1/athlete/${athleteId}/power-curve?oldest=${oldest}&newest=${newest}`,
    `/api/v1/athlete/${athleteId}/power-curves?oldest=${oldest}&newest=${newest}`
  ];

  for (const url of endpoints) {
    try {
      const response = await intervalsFetch(url, { method: 'GET', headers });
      if (response.ok) {
        const data = await response.json();
        if (data) return data;
      }
    } catch {
      // try next
    }
  }

  return null;
};

/**
 * Gets annual best efforts for standard intervals.
 */
export const getAnnualPowerCurves = async (creds: IntervalsCredentials, yearsCount: number = 6): Promise<any[]> => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: yearsCount }, (_, i) => currentYear - i);
  const results = [];

  const durations = [1, 5, 10, 20, 30, 60, 120, 180, 240, 300, 480, 600, 1200, 1800, 2700, 3600, 5400, 7200, 10800];

  for (const year of years) {
    try {
      const rawData = await fetchPowerCurve(creds, year);
      const data = Array.isArray(rawData) ? rawData[0] : (rawData?.curves ? rawData.curves[0] : rawData);

      if (data && data.watts && data.secs) {
        const bests = durations.map(d => {
          let idx = data.secs.indexOf(d);
          if (idx === -1) {
            idx = data.secs.findIndex((s: number) => s >= d);
          }
          return {
            duration: d,
            watts: idx !== -1 ? Math.round(data.watts[idx]) : 0
          };
        });
        results.push({ year, bests });
      } else if (creds.apiKey === 'demo') {
        results.push({ year, bests: getMockPowerBests(year) });
      }
    } catch (e) {
      console.warn(`Failed to fetch power curve for ${year}, skipping:`, e);
    }
    if (creds.apiKey !== 'demo') await new Promise(r => setTimeout(r, 120));
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

  const url = `/api/v1/athlete/${athleteId}/events`;
  try {
    const response = await intervalsFetch(url, { 
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
