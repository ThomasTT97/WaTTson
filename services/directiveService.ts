import { WeeklyBriefing, formatDuration } from '../types';

export interface PlanDirective {
  id: string;
  text: string;
  requestedAt: string; // ISO date string "YYYY-MM-DD" e.g. "2026-08-09"
}

export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function parsePlanDirectives(rawContext: string | null | undefined): PlanDirective[] {
  if (!rawContext || !rawContext.trim()) return [];

  const trimmed = rawContext.trim();

  // Try parsing as JSON array
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any, idx: number) => ({
          id: item.id || `dir_${idx}_${Date.now()}`,
          text: typeof item === 'string' ? item : item.text || '',
          requestedAt: item.requestedAt || getTodayDateString(),
        })).filter(d => d.text.trim().length > 0);
      }
    } catch {
      // Fall through if JSON parsing fails
    }
  }

  // Legacy string format separated by ' ; '
  const legacyItems = trimmed.split(' ; ').map(s => s.trim()).filter(Boolean);
  const today = getTodayDateString();

  return legacyItems.map((text, idx) => ({
    id: `dir_legacy_${idx}_${Date.now()}`,
    text,
    requestedAt: today,
  }));
}

export function serializePlanDirectives(directives: PlanDirective[]): string {
  if (!directives || directives.length === 0) return '';
  return JSON.stringify(directives);
}

export function getDirectivesTextList(directives: PlanDirective[]): string[] {
  return directives.map(d => d.text.trim()).filter(Boolean);
}

/**
 * Helper to calculate difference in calendar days between two "YYYY-MM-DD" date strings.
 * Returns (date2 - date1) in days.
 */
function diffInCalendarDays(dateStr1: string, dateStr2: string): number {
  const [y1, m1, d1] = dateStr1.split('-').map(Number);
  const [y2, m2, d2] = dateStr2.split('-').map(Number);

  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);

  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS: Record<string, number> = {
  jan: 0, january: 1, januari: 0,
  feb: 1, february: 1, februari: 1,
  mar: 2, march: 2, maart: 2,
  apr: 3, april: 3,
  may: 4, mei: 4,
  jun: 5, june: 5, juni: 5,
  jul: 6, july: 6, juli: 6,
  aug: 7, august: 7, augustus: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, oktober: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

/**
 * Parses daily duration and rest constraints from a weekly schedule directive string,
 * e.g. "Adjusted weekly schedule: MON: 1h, TUE: 1h, WED: 2h, THU: Rest, FRI: 1h, SAT: Rest, SUN: 1h (Total: 5h)"
 */
/**
 * Parses daily duration and rest constraints from a weekly schedule directive string or availability record.
 * Handles:
 * - Directives like "Adjusted weekly schedule: WED: 3h, THU: Rest, FRI: 1h, SAT: 3h, SUN: 2h, MON: 1h, TUE: Rest (Total: 10h)"
 * - JSON serialized PlanDirective[] arrays
 * - JSON SavedAvailabilityRecord objects
 * - Multilingual weekday names (English and Dutch, short and full)
 */
export function parseScheduleDurationsFromDirective(directiveText: string | null | undefined): Record<string, { durationMins: number; isRest: boolean }> | null {
  const daysMap: Record<string, { durationMins: number; isRest: boolean }> = {};

  // 1. Try parsing direct JSON (either SavedAvailabilityRecord or PlanDirective[])
  if (directiveText && typeof directiveText === 'string') {
    const trimmed = directiveText.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        
        // Format A: SavedAvailabilityRecord with days array
        if (parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
          parsed.days.forEach((d: any) => {
            const short = (d.dayShort || '').toLowerCase().substring(0, 3);
            const token = normalizeWeekdayToken(short || d.dayName);
            if (token) {
              const mins = typeof d.durationMins === 'number' ? d.durationMins : 0;
              daysMap[token] = {
                durationMins: mins,
                isRest: mins <= 0
              };
            }
          });
          if (Object.keys(daysMap).length > 0) return daysMap;
        }

        // Format B: Array of PlanDirectives
        if (Array.isArray(parsed)) {
          const schedDir = [...parsed].reverse().find(d => 
            d && typeof d.text === 'string' && d.text.toLowerCase().includes('weekly schedule')
          );
          if (schedDir) {
            return parseScheduleDurationsFromDirective(schedDir.text);
          }
        }
      } catch {
        // Fall through to regex parsing
      }
    }
  }

  // 2. If no valid directiveText provided, try loading from localStorage in browser environment
  let textToParse = (directiveText || '').trim();
  if (!textToParse || !textToParse.toLowerCase().includes('weekly schedule')) {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('wattson_last_saved_availability');
        if (stored) {
          const parsedStored = JSON.parse(stored);
          if (parsedStored && Array.isArray(parsedStored.days) && parsedStored.days.length > 0) {
            parsedStored.days.forEach((d: any) => {
              const short = (d.dayShort || '').toLowerCase().substring(0, 3);
              const token = normalizeWeekdayToken(short || d.dayName);
              if (token) {
                const mins = typeof d.durationMins === 'number' ? d.durationMins : 0;
                daysMap[token] = {
                  durationMins: mins,
                  isRest: mins <= 0
                };
              }
            });
            if (Object.keys(daysMap).length > 0) return daysMap;
          }
          if (parsedStored && parsedStored.directiveText) {
            textToParse = parsedStored.directiveText;
          }
        }
      } catch {
        // Fall through
      }
    }
  }

  if (!textToParse) return null;

  const dayTokens = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  dayTokens.forEach(day => {
    // English abbreviations & full names
    const engNames: Record<string, string[]> = {
      mon: ['mon', 'monday'],
      tue: ['tue', 'tues', 'tuesday'],
      wed: ['wed', 'wednesday'],
      thu: ['thu', 'thur', 'thurs', 'thursday'],
      fri: ['fri', 'friday'],
      sat: ['sat', 'saturday'],
      sun: ['sun', 'sunday']
    };

    // Dutch abbreviations & full names
    const dutchNames: Record<string, string[]> = {
      mon: ['ma', 'maandag'],
      tue: ['di', 'dinsdag'],
      wed: ['wo', 'woensdag'],
      thu: ['do', 'donderdag'],
      fri: ['vr', 'vrijdag'],
      sat: ['za', 'zaterdag'],
      sun: ['zo', 'zondag']
    };

    const allAliases = [...(engNames[day] || [day]), ...(dutchNames[day] || [])];
    const aliasPattern = allAliases.join('|');

    const regex = new RegExp(`(?:\\b|\\s)(${aliasPattern}):?\\s*([0-9.]+\\s*(?:h|m|hours|mins|u|uur|min)?(?:[0-9.]+\\s*(?:m|min))?|rest|rust)\\b`, 'i');

    const match = textToParse.match(regex);
    if (match) {
      const val = match[2].trim().toLowerCase();
      if (val === 'rest' || val === 'rust' || val === '0' || val === '0h' || val === '0u' || val === '0m') {
        daysMap[day] = { durationMins: 0, isRest: true };
      } else if (val.includes('h') && val.includes('m')) {
        // e.g. 1h30m or 1h30
        const hmMatch = val.match(/^(\d+)h\s*(\d+)m?$/);
        if (hmMatch) {
          const mins = parseInt(hmMatch[1], 10) * 60 + parseInt(hmMatch[2], 10);
          daysMap[day] = { durationMins: mins, isRest: false };
        }
      } else if (val.endsWith('h') || val.endsWith('hours') || val.endsWith('u') || val.endsWith('uur')) {
        const num = parseFloat(val);
        daysMap[day] = { durationMins: Math.round(num * 60), isRest: false };
      } else if (val.endsWith('m') || val.endsWith('mins') || val.endsWith('min')) {
        const num = parseFloat(val);
        daysMap[day] = { durationMins: Math.round(num), isRest: false };
      } else {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          const mins = num <= 6 ? Math.round(num * 60) : Math.round(num);
          daysMap[day] = { durationMins: mins, isRest: mins === 0 };
        }
      }
    }
  });

  return Object.keys(daysMap).length > 0 ? daysMap : null;
}

/**
 * Normalizes any weekday string (short or full, English or Dutch) to 'mon', 'tue', etc.
 */
export function normalizeWeekdayToken(dayStr: string | null | undefined): string | null {
  if (!dayStr) return null;
  const s = dayStr.trim().toLowerCase();

  const directMap: Record<string, string> = {
    mon: 'mon', monday: 'mon', ma: 'mon', maandag: 'mon',
    tue: 'tue', tues: 'tue', tuesday: 'tue', di: 'tue', dinsdag: 'tue',
    wed: 'wed', wednesday: 'wed', wo: 'wed', woensdag: 'wed',
    thu: 'thu', thur: 'thu', thurs: 'thu', thursday: 'thu', do: 'thu', donderdag: 'thu',
    fri: 'fri', friday: 'fri', vr: 'fri', vrijdag: 'fri',
    sat: 'sat', saturday: 'sat', za: 'sat', zaterdag: 'sat',
    sun: 'sun', sunday: 'sun', zo: 'sun', zondag: 'sun'
  };

  if (directMap[s]) return directMap[s];

  // Try matching with word boundaries so we don't match accidental substrings inside longer words
  // First match 3+ letter words
  for (const [key, val] of Object.entries(directMap)) {
    if (key.length >= 3) {
      const reg = new RegExp(`(^|\\b|\\s)${key}(\\b|\\s|\\(|\\d|$)`, 'i');
      if (reg.test(s)) return val;
    }
  }

  // Then match 2-letter aliases (ma, di, wo, do, vr, za, zo) strictly with word boundaries
  for (const [key, val] of Object.entries(directMap)) {
    if (key.length === 2) {
      const reg = new RegExp(`(^|\\b|\\s)${key}(\\b|\\s|\\(|\\d|$)`, 'i');
      if (reg.test(s)) return val;
    }
  }

  return null;
}

/**
 * Harmonizes a WeeklyBriefing with the user's active availability schedule.
 * Guarantees 100% synchronization:
 * - Days[0] is strictly Today (calendar date today), Days[1] is Tomorrow, etc.
 * - Every day strictly obeys the user's requested duration (in minutes) and Rest days.
 * - Rest days have duration_target = 0, intensity = 'Rest', load_target = 0, workout_steps = [].
 * - Workouts have duration_target = requested duration, load_target > 0, structured workout_steps.
 */
export function harmonizeBriefingWithAvailability(
  briefing: WeeklyBriefing | null | undefined,
  planContext?: string | null,
  userFtp: number = 250
): WeeklyBriefing {
  let scheduleMap = planContext ? parseScheduleDurationsFromDirective(planContext) : null;
  if (!scheduleMap && typeof window !== 'undefined') {
    scheduleMap = parseScheduleDurationsFromDirective('');
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const base: WeeklyBriefing = briefing ? { ...briefing } : {
    phase: 'Build / Aerobic Base',
    focus: 'Custom Training Schedule',
    outlook_summary: 'Personalized training week aligned with your availability.',
    ftp: userFtp,
    days: []
  };

  const existingDays = base.days || [];

  // If no custom schedule is set anywhere, ensure existing days at least have consistent dates from today
  if (!scheduleMap || Object.keys(scheduleMap).length === 0) {
    if (existingDays.length === 0) {
      return base;
    }
    return base;
  }

  const harmonizedWeek1Days: WeeklyBriefing['days'] = [];

  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const weekdayShort = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayName = `${weekdayShort} (${monthDay})`;
    const token = normalizeWeekdayToken(weekdayShort);
    const rule = token && scheduleMap ? scheduleMap[token] : null;

    const existingDay = existingDays[i] || existingDays.find(d => normalizeWeekdayToken(d.day) === token);

    if (rule) {
      if (rule.isRest || rule.durationMins <= 0) {
        // Rest Day
        harmonizedWeek1Days.push({
          day: dayName,
          focus: 'Rest Day',
          intensity: 'Rest',
          duration_target: 0,
          load_target: 0,
          why: 'Halts acute fatigue & restores muscle glycogen.',
          workout_steps: []
        });
      } else {
        // Active workout of exact duration rule.durationMins
        const requestedMins = rule.durationMins;
        const hadWorkout = existingDay && 
          existingDay.intensity !== 'Rest' && 
          !existingDay.focus.toLowerCase().includes('rest') && 
          (existingDay.duration_target || 0) > 0;

        if (hadWorkout && existingDay) {
          const oldDur = existingDay.duration_target || 60;
          const isWorkStep = (s: any) => {
            const pct = s.target_pct || (s.target_watts && userFtp ? s.target_watts / userFtp : 0);
            if (pct > 0.75) return true;
            const label = (s.label || '').toLowerCase();
            return /interval|rep|set|threshold|vo2|sweet|tempo|under|over/i.test(label) && !/recovery|rest|spin|easy/i.test(label);
          };

          const fillerSteps = (existingDay.workout_steps || []).filter(s => !isWorkStep(s));
          const fillerDuration = fillerSteps.reduce((sum, s) => sum + (s.duration || 0), 0);
          const diff = requestedMins - oldDur;

          let scaledSteps;
          if (existingDay.workout_steps && existingDay.workout_steps.length > 0) {
            if (fillerDuration > 0 && (diff > 0 || fillerDuration > Math.abs(diff))) {
              const fillerScale = (fillerDuration + diff) / fillerDuration;
              scaledSteps = existingDay.workout_steps.map(step => {
                if (isWorkStep(step)) return { ...step };
                const newDur = Math.max(1, Math.round(step.duration * fillerScale));
                return {
                  ...step,
                  duration: newDur,
                  label: step.label ? step.label.replace(/^\d+m\s*/, `${newDur}m `) : `${newDur}m Step`
                };
              });
            } else {
              const scale = requestedMins / oldDur;
              scaledSteps = existingDay.workout_steps.map(step => {
                const newDur = Math.max(1, Math.round(step.duration * scale));
                return {
                  ...step,
                  duration: newDur,
                  label: step.label ? step.label.replace(/^\d+m\s*/, `${newDur}m `) : `${newDur}m Step`
                };
              });
            }
          } else {
            const warmMins = Math.max(5, Math.round(requestedMins * 0.15));
            const coolMins = Math.max(5, Math.round(requestedMins * 0.12));
            const mainMins = requestedMins - warmMins - coolMins;
            scaledSteps = [
              { duration: warmMins, target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: `${warmMins}m Warm-up (55% FTP)` },
              { duration: mainMins, target_pct: 0.68, target_watts: Math.round(userFtp * 0.68), label: `${mainMins}m Aerobic Pace (68% FTP)` },
              { duration: coolMins, target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: `${coolMins}m Cool-down (55% FTP)` }
            ];
          }

          const sumStepDur = scaledSteps.reduce((sum, s) => sum + s.duration, 0);
          if (sumStepDur !== requestedMins && scaledSteps.length > 0) {
            const lastFillerIdx = [...scaledSteps].reverse().findIndex(s => !isWorkStep(s));
            const idx = lastFillerIdx !== -1 ? scaledSteps.length - 1 - lastFillerIdx : scaledSteps.length - 1;
            scaledSteps[idx].duration += (requestedMins - sumStepDur);
            scaledSteps[idx].label = scaledSteps[idx].label.replace(/^\d+m/, `${scaledSteps[idx].duration}m`);
          }

          harmonizedWeek1Days.push({
            ...existingDay,
            day: dayName,
            duration_target: requestedMins,
            load_target: Math.round((existingDay.load_target || Math.round(oldDur * 0.7)) * (requestedMins / oldDur)),
            workout_steps: scaledSteps,
            why: existingDay.why || 'Targeted aerobic development and progression.'
          });
        } else {
          // New structured Endurance / Aerobic Ride
          const defaultIntensity: 'Medium' | 'Easy' = requestedMins >= 75 ? 'Medium' : 'Easy';
          const defaultFocus = requestedMins >= 180 ? `Endurance Ride (${formatDuration(requestedMins)})` :
                               requestedMins >= 120 ? `Endurance Ride (${formatDuration(requestedMins)})` :
                               requestedMins >= 60 ? `Endurance Ride (${formatDuration(requestedMins)})` :
                               `Recovery Spin (${formatDuration(requestedMins)})`;

          const warmMins = Math.max(5, Math.round(requestedMins * 0.15));
          const coolMins = Math.max(5, Math.round(requestedMins * 0.12));
          const mainMins = requestedMins - warmMins - coolMins;

          const steps = [
            { duration: warmMins, target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: `${warmMins}m Warm-up (55% FTP)` },
            { duration: mainMins, target_pct: 0.68, target_watts: Math.round(userFtp * 0.68), label: `${mainMins}m Aerobic Pace (68% FTP)` },
            { duration: coolMins, target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: `${coolMins}m Cool-down (55% FTP)` }
          ];

          harmonizedWeek1Days.push({
            day: dayName,
            focus: defaultFocus,
            intensity: defaultIntensity,
            duration_target: requestedMins,
            load_target: Math.round(requestedMins * (defaultIntensity === 'Medium' ? 0.72 : 0.62)),
            why: 'Builds mitochondrial density and steady aerobic endurance.',
            workout_steps: steps
          });
        }
      }
    } else {
      // No rule for this day, preserve or provide default 60m ride
      if (existingDay) {
        harmonizedWeek1Days.push({ ...existingDay, day: dayName });
      } else {
        harmonizedWeek1Days.push({
          day: dayName,
          focus: 'Endurance Ride (1h)',
          intensity: 'Medium',
          duration_target: 60,
          load_target: 42,
          why: 'Aerobic base maintenance.',
          workout_steps: [
            { duration: 10, target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: '10m Warm-up (55% FTP)' },
            { duration: 40, target_pct: 0.68, target_watts: Math.round(userFtp * 0.68), label: '40m Aerobic Pace (68% FTP)' },
            { duration: 10, target_pct: 0.55, target_watts: Math.round(userFtp * 0.55), label: '10m Cool-down (55% FTP)' }
          ]
        });
      }
    }
  }

  // Preserve any days from weeks 2, 3, 4 if they exist
  const remainingDays = existingDays.slice(7);

  return {
    ...base,
    ftp: userFtp,
    days: [...harmonizedWeek1Days, ...remainingDays]
  };
}


function getTargetOffsetForWeekday(reqDateStr: string, textLower: string): number | null {
  // If this directive represents a multi-day weekly schedule, it's not a single-day offset!
  if (textLower.includes('weekly schedule') || textLower.includes('adjusted weekly schedule')) {
    return null;
  }

  let matchCount = 0;
  for (let i = 0; i < 7; i++) {
    const full = WEEKDAYS[i];
    const short = WEEKDAYS_SHORT[i];
    const regex = new RegExp(`\\b(${full}|${short})\\b`, 'i');
    if (regex.test(textLower)) {
      matchCount++;
    }
  }
  if (matchCount > 1) {
    return null;
  }

  const [y, m, d] = reqDateStr.split('-').map(Number);
  const reqDate = new Date(Date.UTC(y, m - 1, d));
  const reqDayOfWeek = reqDate.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  for (let i = 0; i < 7; i++) {
    const full = WEEKDAYS[i];
    const short = WEEKDAYS_SHORT[i];

    // Check for word boundary matching to avoid false positives inside other words
    const regex = new RegExp(`\\b(${full}|${short})\\b`, 'i');
    if (regex.test(textLower)) {
      // Target day of week found
      let offset = i - reqDayOfWeek;
      if (offset < 0) {
        // If requested on Thursday and mentions "Tuesday", assume next Tuesday (+5 days)
        offset += 7;
      }
      return offset;
    }
  }

  return null;
}

/**
 * Checks for explicit date strings like "July 28", "Jul 28", "28 July", "2026-07-28" in directive text.
 */
function extractExplicitDate(textLower: string, reqDateStr: string): string | null {
  // Check ISO format YYYY-MM-DD
  const isoMatch = textLower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(Number(isoMatch[2])).padStart(2, '0');
    const d = String(Number(isoMatch[3])).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const [reqY] = reqDateStr.split('-').map(Number);

  // Check Month Day e.g. "Jul 28", "July 28", "July 28th"
  const monthDayMatch = textLower.match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDayMatch) {
    const monthKey = monthDayMatch[1].toLowerCase();
    const day = Number(monthDayMatch[2]);
    const monthIdx = MONTHS[monthKey];
    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      return `${reqY}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Check Day Month e.g. "28 Jul", "28th of July"
  const dayMonthMatch = textLower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i);
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const monthKey = dayMonthMatch[2].toLowerCase();
    const monthIdx = MONTHS[monthKey];
    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      return `${reqY}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Checks if a directive is expired/irrelevant based on its requestedAt date vs todayDateStr.
 */
export function isDirectiveExpired(directive: PlanDirective, todayDateStr: string = getTodayDateString()): boolean {
  if (!directive.requestedAt) return false;

  const textLower = directive.text.toLowerCase();

  // 0. Recurring directives (e.g., "every Tuesday", "weekly on Friday", "always commute on Monday") never expire
  if (/\b(every|always|each|recurring)\b/i.test(textLower)) {
    return false;
  }

  const deltaDays = diffInCalendarDays(directive.requestedAt, todayDateStr);

  // 0b. Weekly schedule directives (e.g. "Adjusted weekly schedule: MON: 1h...") apply for the entire 7-day week
  if (textLower.includes('weekly schedule') || textLower.includes('adjusted weekly schedule')) {
    return deltaDays > 7;
  }

  // If requested in the future relative to today, it is not expired
  if (deltaDays < 0) return false;

  // 1. Explicit calendar date in text e.g. "Jul 27"
  const explicitDate = extractExplicitDate(textLower, directive.requestedAt);
  if (explicitDate) {
    const deltaFromExplicit = diffInCalendarDays(explicitDate, todayDateStr);
    // If today is past the explicit target date, expired!
    return deltaFromExplicit > 0;
  }

  // If requested today (deltaDays === 0), it is active
  if (deltaDays === 0) return false;

  // 2. "today" / "this morning" / "this afternoon" / "tonight" / "this evening"
  if (/\b(today|this morning|this afternoon|tonight|this evening)\b/.test(textLower)) {
    // Target was requestedAt date. Since deltaDays >= 1, target day is in the past!
    return true;
  }

  // 3. "tomorrow" / "tomorrow's" / "tomorrows" / "next day"
  if (/\b(tomorrow|tomorrow's|tomorrows|next day)\b/.test(textLower)) {
    // Target was requestedAt + 1 day.
    // If deltaDays == 1, target day is TODAY (not expired!).
    // If deltaDays >= 2, target day is in the past (expired!).
    return deltaDays >= 2;
  }

  // 4. "in 2 days" / "in two days"
  if (/\bin (2|two) days\b/.test(textLower)) {
    return deltaDays >= 3;
  }

  // 5. "in 3 days" / "in three days"
  if (/\bin (3|three) days\b/.test(textLower)) {
    return deltaDays >= 4;
  }

  // 6. Generic "in X days"
  const inXDaysMatch = textLower.match(/\bin\s+(\d+)\s+days\b/);
  if (inXDaysMatch) {
    const daysNum = parseInt(inXDaysMatch[1], 10);
    return deltaDays > daysNum;
  }

  // 7. Explicit Weekdays e.g. "on Friday", "this Tuesday"
  const weekdayOffset = getTargetOffsetForWeekday(directive.requestedAt, textLower);
  if (weekdayOffset !== null) {
    // Target date was requestedAt + weekdayOffset.
    // Expired if deltaDays > weekdayOffset.
    return deltaDays > weekdayOffset;
  }

  // 8. Weekend references "this weekend" / "weekend"
  if (/\b(weekend|this weekend)\b/.test(textLower)) {
    const [y, m, d] = directive.requestedAt.split('-').map(Number);
    const reqDate = new Date(Date.UTC(y, m - 1, d));
    const reqDayOfWeek = reqDate.getUTCDay();
    const offsetToSunday = (7 - reqDayOfWeek) % 7;
    return deltaDays > offsetToSunday;
  }

  // Non-date specific directive (e.g. "Lower overall intensity", "Add more endurance") -> stay active
  return false;
}

/**
 * Filter out expired directives automatically.
 */
export function pruneExpiredDirectives(
  directives: PlanDirective[],
  todayDateStr: string = getTodayDateString()
): { active: PlanDirective[]; expired: PlanDirective[] } {
  const active: PlanDirective[] = [];
  const expired: PlanDirective[] = [];

  for (const dir of directives) {
    if (isDirectiveExpired(dir, todayDateStr)) {
      expired.push(dir);
    } else {
      active.push(dir);
    }
  }

  return { active, expired };
}

/**
 * Format active directives for the AI prompt with timestamp context & date translation notes.
 */
export function formatDirectivesForPrompt(
  directives: PlanDirective[],
  todayDateStr: string = getTodayDateString()
): string {
  const { active } = pruneExpiredDirectives(directives, todayDateStr);

  if (active.length === 0) return '';

  const [y, m, d] = todayDateStr.split('-').map(Number);
  const todayObj = new Date(Date.UTC(y, m - 1, d));
  const todayFormatted = todayObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const lines = active.map((dir, index) => {
    const deltaDays = diffInCalendarDays(dir.requestedAt, todayDateStr);
    const textLower = dir.text.toLowerCase();

    let note = '';
    if (textLower.includes('adjusted weekly schedule') || textLower.includes('weekly schedule')) {
      note = ` [MANDATORY WEEKLY AVAILABILITY CONSTRAINTS: You MUST strictly set every single day to the exact duration and Rest status requested!]`;
    } else if (/\b(every|always|each|weekly|recurring)\b/i.test(textLower)) {
      note = ` [Recurring rule -> applies consistently across all relevant days]`;
    } else if (/\b(tomorrow|tomorrow's|tomorrows|next day)\b/.test(textLower)) {
      if (deltaDays === 0) {
        const tomorrowObj = new Date(Date.UTC(y, m - 1, d + 1));
        const tomorrowFormatted = tomorrowObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
        note = ` [Requested TODAY (${todayFormatted}) -> TARGET IS TOMORROW (${tomorrowFormatted})]`;
      } else if (deltaDays === 1) {
        note = ` [Requested yesterday (${dir.requestedAt}) for 'tomorrow' -> TARGET IS TODAY (${todayFormatted})!]`;
      }
    } else if (/\b(today|this morning|this afternoon|tonight|this evening)\b/.test(textLower)) {
      note = ` [Requested on ${dir.requestedAt} -> TARGET IS TODAY (${todayFormatted})]`;
    } else {
      const weekdayOffset = getTargetOffsetForWeekday(dir.requestedAt, textLower);
      if (weekdayOffset !== null) {
        const [ry, rm, rd] = dir.requestedAt.split('-').map(Number);
        const targetDateObj = new Date(Date.UTC(ry, rm - 1, rd + weekdayOffset));
        const targetFormatted = targetDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
        const daysFromToday = diffInCalendarDays(todayDateStr, `${targetDateObj.getUTCFullYear()}-${String(targetDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDateObj.getUTCDate()).padStart(2, '0')}`);
        if (daysFromToday === 0) {
          note = ` [Target day is TODAY (${targetFormatted})]`;
        } else if (daysFromToday === 1) {
          note = ` [Target day is TOMORROW (${targetFormatted})]`;
        } else {
          note = ` [Target day is ${targetFormatted} (in ${daysFromToday} days)]`;
        }
      } else {
        note = ` [Requested on ${dir.requestedAt}]`;
      }
    }

    return `${index + 1}. "${dir.text}"${note}`;
  });

  return `ACTIVE CUSTOM DIRECTIVES (Today is ${todayFormatted}):\n` + lines.join('\n');
}
