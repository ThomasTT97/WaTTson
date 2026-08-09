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
  Helper to calculate difference in calendar days between two "YYYY-MM-DD" date strings.
  Returns (date2 - date1) in days.
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

function getTargetOffsetForWeekday(reqDateStr: string, textLower: string): number | null {
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
 * Checks if a directive is expired/irrelevant based on its requestedAt date vs todayDateStr.
 */
export function isDirectiveExpired(directive: PlanDirective, todayDateStr: string = getTodayDateString()): boolean {
  if (!directive.requestedAt) return false;

  const deltaDays = diffInCalendarDays(directive.requestedAt, todayDateStr);

  // If requested in the future or today, it is not expired
  if (deltaDays <= 0) return false;

  const textLower = directive.text.toLowerCase();

  // 1. "today" / "this morning" / "this afternoon" / "tonight"
  if (/\b(today|this morning|this afternoon|tonight|this evening)\b/.test(textLower)) {
    // Target was requestedAt date. Since deltaDays >= 1, target day is in the past!
    return true;
  }

  // 2. "tomorrow" / "tomorrow's" / "tomorrows"
  if (/\b(tomorrow|tomorrow's|tomorrows)\b/.test(textLower)) {
    // Target was requestedAt + 1 day.
    // If deltaDays == 1, target day is TODAY (not expired!).
    // If deltaDays >= 2, target day is in the past!
    return deltaDays >= 2;
  }

  // 3. "in 2 days" / "in two days"
  if (/\bin (2|two) days\b/.test(textLower)) {
    return deltaDays >= 3;
  }

  // 4. "in 3 days" / "in three days"
  if (/\bin (3|three) days\b/.test(textLower)) {
    return deltaDays >= 4;
  }

  // 5. Explicit Weekdays e.g. "on Friday", "this Tuesday"
  const weekdayOffset = getTargetOffsetForWeekday(directive.requestedAt, textLower);
  if (weekdayOffset !== null) {
    // Target date was requestedAt + weekdayOffset.
    // Expired if deltaDays > weekdayOffset.
    return deltaDays > weekdayOffset;
  }

  // 6. Weekend references "this weekend" / "weekend"
  if (/\b(weekend|this weekend)\b/.test(textLower)) {
    const [y, m, d] = directive.requestedAt.split('-').map(Number);
    const reqDate = new Date(Date.UTC(y, m - 1, d));
    const reqDayOfWeek = reqDate.getUTCDay();
    const offsetToSunday = (7 - reqDayOfWeek) % 7;
    return deltaDays > offsetToSunday;
  }

  // Non-date specific directive (e.g. "Lower overall intensity") -> stay active
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
    if (/\b(tomorrow|tomorrow's|tomorrows)\b/.test(textLower)) {
      if (deltaDays === 0) {
        note = ` [Requested today (${dir.requestedAt}) -> applies to TOMORROW relative to ${todayFormatted}]`;
      } else if (deltaDays === 1) {
        note = ` [Requested on ${dir.requestedAt} for 'tomorrow' -> NOTE: Today is ${todayFormatted}, so this request applies to TODAY (${todayFormatted})!]`;
      }
    } else if (/\b(today|this morning|this afternoon|tonight|this evening)\b/.test(textLower)) {
      note = ` [Requested on ${dir.requestedAt} -> applies to TODAY (${todayFormatted})]`;
    } else {
      note = ` [Requested on ${dir.requestedAt}]`;
    }

    return `${index + 1}. "${dir.text}"${note}`;
  });

  return `ACTIVE CUSTOM DIRECTIVES (Current Date: ${todayFormatted}):\n` + lines.join('\n');
}
