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
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

/**
 * Parses daily duration and rest constraints from a weekly schedule directive string,
 * e.g. "Adjusted weekly schedule: MON: 1h, TUE: 1h, WED: 2h, THU: Rest, FRI: 1h, SAT: Rest, SUN: 1h (Total: 5h)"
 */
export function parseScheduleDurationsFromDirective(directiveText: string): Record<string, { durationMins: number; isRest: boolean }> | null {
  if (!directiveText || (!directiveText.toLowerCase().includes('weekly schedule') && !directiveText.includes(':'))) {
    return null;
  }

  const daysMap: Record<string, { durationMins: number; isRest: boolean }> = {};
  const dayTokens = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  dayTokens.forEach(day => {
    const regex = new RegExp(`\\b${day}:?\\s*([0-9.]+\\s*(?:h|m|hours|mins)?|rest)\\b`, 'i');
    const match = directiveText.match(regex);
    if (match) {
      const val = match[1].trim().toLowerCase();
      if (val === 'rest' || val === '0' || val === '0h' || val === '0m') {
        daysMap[day] = { durationMins: 0, isRest: true };
      } else if (val.endsWith('h') || val.endsWith('hours')) {
        const num = parseFloat(val);
        daysMap[day] = { durationMins: Math.round(num * 60), isRest: false };
      } else if (val.endsWith('m') || val.endsWith('mins')) {
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
