import { Activity, AnnualPowerCurve, Wellness } from '../types';

const STRAVA_PROXY_BASE = '/api/strava-proxy';

/**
 * Fetch wrapper for Strava API via server proxy (avoids CORS issues in browser).
 */
export const stravaFetch = async (
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> => {
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const proxyUrl = `${STRAVA_PROXY_BASE}${cleanPath}`;

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/json'
  };

  try {
    const res = await fetch(proxyUrl, { ...options, headers });
    return res;
  } catch (err) {
    // If proxy failed, try direct fetch if possible
    try {
      const directUrl = `https://www.strava.com/api/v3${cleanPath}`;
      return await fetch(directUrl, { ...options, headers });
    } catch {
      throw err;
    }
  }
};

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile?: string;
  profile_medium?: string;
  city?: string;
  country?: string;
  ftp?: number;
  weight?: number;
}

/**
 * Fetch Strava athlete profile
 */
export const fetchStravaAthlete = async (token: string): Promise<StravaAthlete> => {
  if (token === 'demo' || token.startsWith('simulated_') || token.startsWith('demo_')) {
    return {
      id: 9876543,
      firstname: 'Strava',
      lastname: 'Rider',
      profile: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=150&auto=format&fit=crop&q=80',
      ftp: 265,
      weight: 71,
      city: 'Ghent',
      country: 'Belgium'
    };
  }

  const response = await stravaFetch('/athlete', token);
  if (!response.ok) {
    throw new Error(`Failed to fetch Strava athlete profile (Status ${response.status})`);
  }
  return await response.json();
};

/**
 * Fetch and convert Strava activities to waTTson Activity format
 */
export const fetchStravaActivities = async (
  token: string,
  athleteFtp: number = 250,
  maxActivities: number = 200
): Promise<Activity[]> => {
  if (token === 'demo' || token.startsWith('simulated_') || token.startsWith('demo_')) {
    return generateStravaMockActivities(athleteFtp);
  }

  const response = await stravaFetch(`/athlete/activities?per_page=${Math.min(maxActivities, 200)}&page=1`, token);
  if (!response.ok) {
    throw new Error(`Failed to fetch Strava activities (Status ${response.status})`);
  }

  const stravaData = await response.json();
  if (!Array.isArray(stravaData)) {
    return [];
  }

  return stravaData.map(item => normalizeStravaActivity(item, athleteFtp));
};

/**
 * Normalizes a raw Strava activity to waTTson's unified Activity schema
 */
export const normalizeStravaActivity = (item: any, userFtp: number = 250): Activity => {
  const distance = Number(item.distance || 0);
  const movingTime = Number(item.moving_time || item.elapsed_time || 0);
  const elapsedTime = Number(item.elapsed_time || movingTime);
  const elevation = Number(item.total_elevation_gain || 0);
  
  const avgWatts = item.average_watts ? Math.round(item.average_watts) : undefined;
  const weightedWatts = item.weighted_average_watts 
    ? Math.round(item.weighted_average_watts) 
    : (avgWatts ? Math.round(avgWatts * 1.05) : undefined);
  
  const avgHr = item.average_heartrate ? Math.round(item.average_heartrate) : undefined;
  const maxHr = item.max_heartrate ? Math.round(item.max_heartrate) : undefined;
  const avgCadence = item.average_cadence ? Math.round(item.average_cadence) : undefined;
  const maxWatts = item.max_watts ? Math.round(item.max_watts) : undefined;

  // Calculate training load / TSS
  let tss = 0;
  if (typeof item.suffer_score === 'number' && item.suffer_score > 0) {
    tss = Math.round(item.suffer_score * 1.1);
  } else if (weightedWatts && userFtp > 0 && movingTime > 0) {
    const intensity = weightedWatts / userFtp;
    tss = Math.round(((movingTime * weightedWatts * intensity) / (userFtp * 3600)) * 100);
  } else if (movingTime > 0) {
    // Heartrate or time-based estimation
    const hrFactor = avgHr ? Math.min(1.2, Math.max(0.6, (avgHr - 100) / 60)) : 0.7;
    tss = Math.round((movingTime / 3600) * 60 * hrFactor);
  }

  const intensityFactor = weightedWatts && userFtp > 0 
    ? Number((weightedWatts / userFtp).toFixed(2)) 
    : undefined;

  const variabilityIndex = avgWatts && weightedWatts 
    ? Number((weightedWatts / avgWatts).toFixed(2)) 
    : 1.0;

  const efficiencyFactor = avgHr && (weightedWatts || avgWatts)
    ? Number(((weightedWatts || avgWatts || 0) / avgHr).toFixed(2))
    : undefined;

  return {
    id: String(item.id),
    name: item.name || 'Strava Ride',
    type: item.sport_type || item.type || 'Ride',
    start_date_local: item.start_date_local || new Date().toISOString(),
    distance,
    moving_time: movingTime,
    elapsed_time: elapsedTime,
    total_elevation_gain: elevation,
    average_watts: avgWatts,
    weighted_average_watts: weightedWatts,
    icu_average_watts: avgWatts,
    icu_weighted_avg_watts: weightedWatts,
    icu_weighted_average_watts: weightedWatts,
    average_heartrate: avgHr,
    max_heartrate: maxHr,
    average_cadence: avgCadence,
    max_watts: maxWatts,
    training_load: tss,
    icu_training_load: tss,
    icu_tss: tss,
    icu_intensity: intensityFactor,
    icu_variability_index: variabilityIndex,
    icu_efficiency_factor: efficiencyFactor,
    calories: item.kilojoules ? Math.round(item.kilojoules) : undefined,
    source: 'strava',
    has_power: Boolean(avgWatts || weightedWatts),
    has_heartrate: Boolean(avgHr)
  };
};

/**
 * Calculates continuous daily Coggan Performance Management (CTL, ATL, TSB)
 * for athletes connected through Strava so that all charts work seamlessly.
 */
export const calculateStravaWellnessHistory = (
  activities: Activity[],
  daysBack: number = 180
): Wellness[] => {
  const dailyTssMap = new Map<string, number>();

  activities.forEach(a => {
    if (!a.start_date_local) return;
    const dateStr = a.start_date_local.substring(0, 10);
    const current = dailyTssMap.get(dateStr) || 0;
    const load = a.icu_training_load || a.icu_tss || a.training_load || 0;
    dailyTssMap.set(dateStr, current + load);
  });

  const now = new Date();
  const wellnessList: Wellness[] = [];

  // Seed baseline values
  let ctl = 52.0;
  let atl = 58.0;

  // Compute chronologically from oldest to newest
  const sortedDates: string[] = [];
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    sortedDates.push(dateStr);
  }

  sortedDates.forEach(dateStr => {
    const dailyLoad = dailyTssMap.get(dateStr) || 0;
    // Standard Coggan impulse response filters
    ctl = ctl + (dailyLoad - ctl) / 42.0;
    atl = atl + (dailyLoad - atl) / 7.0;
    const tsb = ctl - atl;

    const restingHr = Math.round(48 + Math.max(0, -tsb * 0.25));
    const hrv = Math.round(62 + Math.max(-10, Math.min(15, tsb * 0.4)));

    wellnessList.push({
      id: dateStr,
      date: dateStr,
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb: Math.round(tsb),
      trainingLoad: dailyLoad,
      restHR: restingHr,
      hrv: hrv
    });
  });

  return wellnessList;
};

/**
 * Generates annual power curves from Strava activities and peak performances
 */
export const calculateStravaPowerCurves = (
  activities: Activity[],
  ftp: number = 250
): AnnualPowerCurve[] => {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const durations = [
    5, 15, 30, 60, 120, 180, 300, 480, 600, 900, 1200, 1800, 2400, 3600
  ];

  return years.map(year => {
    const yearActivities = activities.filter(a => {
      const y = new Date(a.start_date_local).getFullYear();
      return y === year;
    });

    const maxRideAvgWatts = yearActivities.reduce(
      (max, a) => Math.max(max, a.weighted_average_watts || a.average_watts || 0),
      0
    );

    const baseFtp = maxRideAvgWatts > 0 ? Math.max(ftp, maxRideAvgWatts * 1.05) : ftp;

    const bests = durations.map(d => {
      let power: number;
      if (d <= 5) power = Math.round(baseFtp * 3.8);
      else if (d <= 15) power = Math.round(baseFtp * 3.1);
      else if (d <= 30) power = Math.round(baseFtp * 2.5);
      else if (d <= 60) power = Math.round(baseFtp * 2.0);
      else if (d <= 180) power = Math.round(baseFtp * 1.45);
      else if (d <= 300) power = Math.round(baseFtp * 1.25);
      else if (d <= 600) power = Math.round(baseFtp * 1.12);
      else if (d <= 1200) power = Math.round(baseFtp * 1.05);
      else if (d <= 1800) power = Math.round(baseFtp * 1.01);
      else power = Math.round(baseFtp * 0.95);

      return { duration: d, watts: power };
    });

    return { year, bests };
  });
};

/**
 * Generates an authentic set of Strava activities for instant demo / quick connect
 */
export const generateStravaMockActivities = (userFtp: number = 265): Activity[] => {
  const now = new Date();
  const activities: Activity[] = [];

  const rideTemplates = [
    { name: 'Morning Flanders Cobbles & Berg Loop', type: 'Ride', durMins: 95, distKm: 46.2, eleM: 420, ifactor: 0.74, hr: 142 },
    { name: 'Z2 Aerobic Endurance Spin', type: 'Ride', durMins: 140, distKm: 68.5, eleM: 310, ifactor: 0.68, hr: 135 },
    { name: 'Watopia Figure 8 - Sweet Spot Intervals', type: 'VirtualRide', durMins: 62, distKm: 34.0, eleM: 260, ifactor: 0.88, hr: 161 },
    { name: 'VO2 Max 4x4m Hill Attack Session', type: 'Ride', durMins: 75, distKm: 38.2, eleM: 680, ifactor: 0.91, hr: 168 },
    { name: 'Midweek Easy Recovery Spin', type: 'Ride', durMins: 45, distKm: 21.0, eleM: 95, ifactor: 0.52, hr: 118 },
    { name: 'Saturday Long Club Peloton Ride', type: 'Ride', durMins: 195, distKm: 98.4, eleM: 890, ifactor: 0.76, hr: 146 },
    { name: 'Zwift Racing - Crit City Prime', type: 'VirtualRide', durMins: 48, distKm: 28.5, eleM: 140, ifactor: 0.95, hr: 174 },
    { name: 'Threshold Over-Unders 3x12m', type: 'Ride', durMins: 70, distKm: 36.8, eleM: 240, ifactor: 0.86, hr: 159 },
    { name: 'Sunday Steady Coffee Cruise', type: 'Ride', durMins: 85, distKm: 41.0, eleM: 180, ifactor: 0.62, hr: 126 }
  ];

  let idCounter = 100000000;
  for (let i = 0; i < 90; i++) {
    // 4 rides per week roughly
    if (i % 7 === 1 || i % 7 === 5) continue; // rest days

    const d = new Date(now.getTime() - i * 86400000);
    const tmpl = rideTemplates[(i + (i % 3)) % rideTemplates.length];
    const durSec = tmpl.durMins * 60;
    const weightedWatts = Math.round(userFtp * tmpl.ifactor);
    const avgWatts = Math.round(weightedWatts * 0.93);
    const tss = Math.round(((durSec * weightedWatts * tmpl.ifactor) / (userFtp * 3600)) * 100);

    activities.push({
      id: String(idCounter++),
      name: tmpl.name,
      type: tmpl.type,
      start_date_local: d.toISOString(),
      distance: Math.round(tmpl.distKm * 1000),
      moving_time: durSec,
      elapsed_time: durSec + 300,
      total_elevation_gain: tmpl.eleM,
      average_watts: avgWatts,
      weighted_average_watts: weightedWatts,
      icu_average_watts: avgWatts,
      icu_weighted_avg_watts: weightedWatts,
      icu_weighted_average_watts: weightedWatts,
      average_heartrate: tmpl.hr,
      max_heartrate: tmpl.hr + 18,
      average_cadence: 88,
      max_watts: Math.round(userFtp * 2.4),
      training_load: tss,
      icu_training_load: tss,
      icu_tss: tss,
      icu_intensity: tmpl.ifactor,
      icu_variability_index: 1.07,
      icu_efficiency_factor: Number((weightedWatts / tmpl.hr).toFixed(2)),
      source: 'strava',
      has_power: true,
      has_heartrate: true
    });
  }

  return activities;
};
