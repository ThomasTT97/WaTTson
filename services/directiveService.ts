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
  jan: 0, january: 0, januari: 0,
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
 * Parses a calendar date from a briefing day label like "Sun (Nov 15)", "Mon (Jan 2)", or "2026-11-15".
 * Resolves year boundaries cleanly relative to referenceDate (default: today).
 * Returns a Date at local midnight, or null if no calendar month+day can be parsed.
 */
export function parseBriefingDayDate(dayStr: string | null | undefined, referenceDate: Date = new Date()): Date | null {
  if (!dayStr) return null;
  const trimmed = dayStr.trim();

  // ISO format YYYY-MM-DD
  const isoMatch = trimmed.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]) - 1;
    const d = Number(isoMatch[3]);
    const candidate = new Date(y, m, d, 0, 0, 0, 0);
    if (!isNaN(candidate.getTime()) && candidate.getMonth() === m && candidate.getDate() === d) {
      return candidate;
    }
  }

  // Month Day format e.g. "Sun (Nov 15)" or "Nov 15"
  const monthDayMatch = trimmed.match(/\b(jan|january|januari|feb|february|februari|mar|march|maart|apr|april|may|mei|jun|june|juni|jul|july|juli|aug|august|augustus|sep|sept|september|oct|october|oktober|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  const dayMonthMatch = !monthDayMatch
    ? trimmed.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|january|januari|feb|february|februari|mar|march|maart|apr|april|may|mei|jun|june|juni|jul|july|juli|aug|august|augustus|sep|sept|september|oct|october|oktober|nov|november|dec|december)\b/i)
    : null;

  let monthIdx: number | undefined;
  let dayNum: number | undefined;

  if (monthDayMatch) {
    monthIdx = MONTHS[monthDayMatch[1].toLowerCase()];
    dayNum = Number(monthDayMatch[2]);
  } else if (dayMonthMatch) {
    dayNum = Number(dayMonthMatch[1]);
    monthIdx = MONTHS[dayMonthMatch[2].toLowerCase()];
  }

  if (monthIdx === undefined || dayNum === undefined || dayNum < 1 || dayNum > 31) {
    return null;
  }

  const refMidnight = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const refYear = refMidnight.getFullYear();

  // Pick year among refYear - 1, refYear, refYear + 1 closest to referenceDate
  let bestCandidate: Date | null = null;
  let bestDiff = Infinity;
  const candidateYears: number[] = [refYear - 1, refYear, refYear + 1];
  for (const yr of candidateYears) {
    const candidate: Date = new Date(yr, monthIdx, dayNum, 0, 0, 0, 0);
    if (candidate.getMonth() === monthIdx && candidate.getDate() === dayNum) {
      const diff = Math.abs(candidate.getTime() - refMidnight.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCandidate = candidate;
      }
    }
  }

  return bestCandidate;
}

export type WorkoutFocusType =
  | 'vo2'
  | 'anaerobic'
  | 'threshold'
  | 'sweetspot'
  | 'tempo'
  | 'endurance'
  | 'recovery';

export interface ScheduleRule {
  durationMins: number;
  isRest: boolean;
  targetDateStr?: string;
  workoutType?: WorkoutFocusType;
  preserveDuration?: boolean;
}

export interface DetailedScheduleMap {
  byWeekday: Record<string, ScheduleRule>;
  byDate: Record<string, ScheduleRule>;
}

export function detectWorkoutFocusType(text?: string | null): WorkoutFocusType | undefined {
  const lower = (text || '').toLowerCase();
  if (!lower) return undefined;
  if (/(?:vo2|v02|aerobic\s*capacity|norwegian|30\/30)/.test(lower)) return 'vo2';
  if (/(?:anaerobic|sprint|burst|micro|ronnestad|rønnestad|30\/15|neuromuscular)/.test(lower)) return 'anaerobic';
  if (/(?:threshold|over[\s/-]*under|lthr|lactate|\bftp\b)/.test(lower)) return 'threshold';
  if (/(?:sweet\s*spot|sweetspot|\bsst\b)/.test(lower)) return 'sweetspot';
  if (/\b(?:tempo|zone\s*3|z3)\b/.test(lower)) return 'tempo';
  if (/(?:recovery|recup|flush|\bspin\b)/.test(lower)) return 'recovery';
  if (/(?:endurance|zone\s*2|\bz2\b|aerobic\s*base|\bbase\b)/.test(lower)) return 'endurance';
  if (/\bintervals?\b/.test(lower)) return 'vo2';
  return undefined;
}

export function buildStructuredWorkoutForType(
  workoutType: WorkoutFocusType,
  durationMins: number,
  userFtp: number = 250
): {
  focus: string;
  intensity: 'Easy' | 'Medium' | 'Hard';
  load_target: number;
  why: string;
  workout_steps: { duration: number; target_pct: number; target_watts: number; label: string }[];
} {
  const safeMins = Math.max(15, Math.round(durationMins || 60));
  const ftp = Math.max(50, Math.round(userFtp || 250));
  const durLabel = formatDuration(safeMins);

  const makeStep = (duration: number, pct: number, name: string) => ({
    duration,
    target_pct: pct,
    target_watts: Math.round(ftp * pct),
    label: `${duration}m ${name} (${Math.round(pct * 100)}% FTP)`
  });

  if (workoutType === 'vo2') {
    let warmMins = Math.min(18, Math.max(8, Math.round(safeMins * 0.22)));
    let coolMins = Math.min(15, Math.max(5, Math.round(safeMins * 0.15)));
    const workPool = Math.max(6, safeMins - warmMins - coolMins);
    const repDur = safeMins < 40 ? 3 : 4;
    const recDur = 3;
    const reps = Math.max(2, Math.min(5, Math.floor((workPool + recDur) / (repDur + recDur))));
    const intervalBlockMins = reps * repDur + Math.max(0, reps - 1) * recDur;
    const leftover = Math.max(0, safeMins - warmMins - coolMins - intervalBlockMins);

    let aerobicTailMins = 0;
    if (leftover > 12) {
      aerobicTailMins = leftover;
    } else if (leftover > 0) {
      const addWarm = Math.ceil(leftover / 2);
      const addCool = leftover - addWarm;
      warmMins += addWarm;
      coolMins += addCool;
    }

    const steps: { duration: number; target_pct: number; target_watts: number; label: string }[] = [
      makeStep(warmMins, 0.55, 'Progressive Warm-up')
    ];
    for (let r = 1; r <= reps; r++) {
      steps.push(makeStep(repDur, 1.12, `VO2 Max Interval ${r}`));
      if (r < reps) {
        steps.push(makeStep(recDur, 0.50, `Active Recovery ${r}`));
      }
    }
    if (aerobicTailMins > 0) {
      steps.push(makeStep(aerobicTailMins, 0.65, 'Steady Zone 2 Aerobic Extension'));
    }
    steps.push(makeStep(coolMins, 0.45, 'Easy Spin Cool-down'));

    // Guarantee exact sum
    const sum = steps.reduce((s, st) => s + st.duration, 0);
    if (sum !== safeMins && steps.length > 0) {
      const lastIdx = steps.length - 1;
      steps[lastIdx].duration = Math.max(1, steps[lastIdx].duration + (safeMins - sum));
      steps[lastIdx].label = steps[lastIdx].label.replace(/^\d+m/, `${steps[lastIdx].duration}m`);
    }

    return {
      focus: `VO2 Max Intervals (${durLabel})`,
      intensity: 'Hard',
      load_target: Math.round(safeMins * 0.92),
      why: 'High-intensity VO2 max intervals to expand aerobic ceiling and maximal oxygen uptake.',
      workout_steps: steps
    };
  }

  if (workoutType === 'anaerobic') {
    let warmMins = Math.min(18, Math.max(8, Math.round(safeMins * 0.25)));
    let coolMins = Math.min(15, Math.max(5, Math.round(safeMins * 0.18)));
    const workPool = Math.max(6, safeMins - warmMins - coolMins);
    const repDur = 1;
    const recDur = 3;
    const reps = Math.max(3, Math.min(8, Math.floor((workPool + recDur) / (repDur + recDur))));
    const intervalBlockMins = reps * repDur + Math.max(0, reps - 1) * recDur;
    const leftover = Math.max(0, safeMins - warmMins - coolMins - intervalBlockMins);

    let aerobicTailMins = 0;
    if (leftover > 12) {
      aerobicTailMins = leftover;
    } else if (leftover > 0) {
      const addWarm = Math.ceil(leftover / 2);
      warmMins += addWarm;
      coolMins += leftover - addWarm;
    }

    const steps = [makeStep(warmMins, 0.55, 'Progressive Warm-up')];
    for (let r = 1; r <= reps; r++) {
      steps.push(makeStep(repDur, 1.30, `Anaerobic Surge ${r}`));
      if (r < reps) {
        steps.push(makeStep(recDur, 0.48, `Spin Recovery ${r}`));
      }
    }
    if (aerobicTailMins > 0) {
      steps.push(makeStep(aerobicTailMins, 0.65, 'Steady Zone 2 Aerobic Extension'));
    }
    steps.push(makeStep(coolMins, 0.45, 'Easy Spin Cool-down'));

    return {
      focus: `Anaerobic Intervals (${durLabel})`,
      intensity: 'Hard',
      load_target: Math.round(safeMins * 0.90),
      why: 'Supra-threshold repeats to elevate anaerobic capacity and peak sprint repeatability.',
      workout_steps: steps
    };
  }

  if (workoutType === 'threshold') {
    let warmMins = Math.min(18, Math.max(8, Math.round(safeMins * 0.20)));
    let coolMins = Math.min(15, Math.max(5, Math.round(safeMins * 0.13)));
    const workPool = Math.max(8, safeMins - warmMins - coolMins);
    const repDur = safeMins >= 60 ? 8 : 6;
    const recDur = 3;
    const reps = Math.max(2, Math.min(4, Math.floor((workPool + recDur) / (repDur + recDur))));
    const intervalBlockMins = reps * repDur + Math.max(0, reps - 1) * recDur;
    const leftover = Math.max(0, safeMins - warmMins - coolMins - intervalBlockMins);

    let aerobicTailMins = 0;
    if (leftover > 12) {
      aerobicTailMins = leftover;
    } else if (leftover > 0) {
      const addWarm = Math.ceil(leftover / 2);
      warmMins += addWarm;
      coolMins += leftover - addWarm;
    }

    const steps = [makeStep(warmMins, 0.58, 'Progressive Warm-up')];
    for (let r = 1; r <= reps; r++) {
      steps.push(makeStep(repDur, 0.98, `Threshold Block ${r}`));
      if (r < reps) {
        steps.push(makeStep(recDur, 0.55, `Active Recovery ${r}`));
      }
    }
    if (aerobicTailMins > 0) {
      steps.push(makeStep(aerobicTailMins, 0.66, 'Steady Zone 2 Endurance'));
    }
    steps.push(makeStep(coolMins, 0.48, 'Easy Cool-down'));

    return {
      focus: `Threshold Intervals (${durLabel})`,
      intensity: 'Hard',
      load_target: Math.round(safeMins * 0.88),
      why: 'Sustained lactate threshold efforts to raise functional threshold power and clearance.',
      workout_steps: steps
    };
  }

  if (workoutType === 'sweetspot') {
    let warmMins = Math.min(15, Math.max(6, Math.round(safeMins * 0.18)));
    let coolMins = Math.min(12, Math.max(5, Math.round(safeMins * 0.12)));
    const workPool = Math.max(10, safeMins - warmMins - coolMins);
    const repDur = safeMins >= 75 ? 15 : 12;
    const recDur = 3;
    const reps = Math.max(2, Math.min(4, Math.floor((workPool + recDur) / (repDur + recDur))));
    const intervalBlockMins = reps * repDur + Math.max(0, reps - 1) * recDur;
    const leftover = Math.max(0, safeMins - warmMins - coolMins - intervalBlockMins);

    let aerobicTailMins = 0;
    if (leftover > 12) {
      aerobicTailMins = leftover;
    } else if (leftover > 0) {
      const addWarm = Math.ceil(leftover / 2);
      warmMins += addWarm;
      coolMins += leftover - addWarm;
    }

    const steps = [makeStep(warmMins, 0.56, 'Progressive Warm-up')];
    for (let r = 1; r <= reps; r++) {
      steps.push(makeStep(repDur, 0.90, `Sweet Spot Block ${r}`));
      if (r < reps) {
        steps.push(makeStep(recDur, 0.55, `Easy Spin Recovery ${r}`));
      }
    }
    if (aerobicTailMins > 0) {
      steps.push(makeStep(aerobicTailMins, 0.68, 'Steady Zone 2 Endurance'));
    }
    steps.push(makeStep(coolMins, 0.50, 'Easy Cool-down'));

    return {
      focus: `Sweet Spot Intervals (${durLabel})`,
      intensity: 'Medium',
      load_target: Math.round(safeMins * 0.80),
      why: 'High-efficiency sweet spot intervals to build aerobic power with manageable fatigue.',
      workout_steps: steps
    };
  }

  if (workoutType === 'tempo') {
    const warmMins = Math.max(5, Math.round(safeMins * 0.16));
    const coolMins = Math.max(5, Math.round(safeMins * 0.14));
    const mainMins = Math.max(5, safeMins - warmMins - coolMins);
    return {
      focus: `Tempo Ride (${durLabel})`,
      intensity: 'Medium',
      load_target: Math.round(safeMins * 0.76),
      why: 'Sustained Zone 3 aerobic tempo block to enhance muscular endurance.',
      workout_steps: [
        makeStep(warmMins, 0.55, 'Progressive Warm-up'),
        makeStep(mainMins, 0.80, 'Steady Tempo Block'),
        makeStep(coolMins, 0.50, 'Easy Cool-down')
      ]
    };
  }

  if (workoutType === 'recovery') {
    const warmMins = Math.max(4, Math.round(safeMins * 0.15));
    const coolMins = Math.max(4, Math.round(safeMins * 0.15));
    const mainMins = Math.max(5, safeMins - warmMins - coolMins);
    return {
      focus: `Recovery Spin (${durLabel})`,
      intensity: 'Easy',
      load_target: Math.round(safeMins * 0.45),
      why: 'Low-intensity active recovery spin to flush fatigue and promote blood flow.',
      workout_steps: [
        makeStep(warmMins, 0.45, 'Spin-up Warm-up'),
        makeStep(mainMins, 0.52, 'Steady Recovery Spin'),
        makeStep(coolMins, 0.40, 'Easy Cool-down')
      ]
    };
  }

  // Default: endurance
  const intensity: 'Easy' | 'Medium' = safeMins >= 75 ? 'Medium' : 'Easy';
  const warmMins = Math.max(5, Math.round(safeMins * 0.15));
  const coolMins = Math.max(5, Math.round(safeMins * 0.12));
  const mainMins = Math.max(5, safeMins - warmMins - coolMins);
  return {
    focus: safeMins >= 60 ? `Endurance Ride (${durLabel})` : `Recovery Spin (${durLabel})`,
    intensity,
    load_target: Math.round(safeMins * (intensity === 'Medium' ? 0.72 : 0.62)),
    why: 'Builds mitochondrial density and steady aerobic endurance.',
    workout_steps: [
      makeStep(warmMins, 0.55, 'Progressive Warm-up'),
      makeStep(mainMins, 0.68, 'Steady Zone 2 Endurance'),
      makeStep(coolMins, 0.50, 'Easy Cool-down')
    ]
  };
}

export function doesDayMatchWorkoutType(
  day: WeeklyBriefing['days'][0] | undefined,
  expectedType: WorkoutFocusType,
  userFtp: number = 250
): boolean {
  if (!day || !Array.isArray(day.workout_steps) || day.workout_steps.length === 0) return false;
  const ftp = userFtp > 0 ? userFtp : 250;
  const maxPct = day.workout_steps.reduce((mx, s) => {
    const pct = s.target_pct || (s.target_watts ? s.target_watts / ftp : 0);
    return Math.max(mx, pct);
  }, 0);
  const detectedFocus = detectWorkoutFocusType(day.focus);
  if (detectedFocus && detectedFocus !== expectedType) return false;

  switch (expectedType) {
    case 'vo2':
      return maxPct >= 1.00;
    case 'anaerobic':
      return maxPct >= 1.15;
    case 'threshold':
      return maxPct >= 0.92 && maxPct < 1.15;
    case 'sweetspot':
      return maxPct >= 0.85 && maxPct < 1.02;
    case 'tempo':
      return maxPct >= 0.75 && maxPct < 0.92;
    case 'recovery':
      return maxPct <= 0.65;
    case 'endurance':
      return maxPct <= 0.78;
  }
}

function toIsoDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysToIso(isoStr: string, offsetDays: number): string {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + offsetDays);
  return toIsoDateStr(dt);
}

function weekdayTokenFromIso(isoStr: string): string {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return WEEKDAYS_SHORT[dt.getDay()];
}

function parseDurationValueToMins(rawVal: string): { durationMins: number; isRest: boolean } | null {
  const val = rawVal.trim().toLowerCase();
  if (!val) return null;

  if (/^(rest|rest\s*day|rust|rust\s*dag|off|day\s*off|0|0h|0u|0m|0\s*hours?|0\s*mins?)$/.test(val)) {
    return { durationMins: 0, isRest: true };
  }

  const hmMatch = val.match(/^(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?|u|uur)\s*(\d+)\s*(?:m|mins?|minutes?|min)?$/i);
  if (hmMatch) {
    const mins = Math.round(parseFloat(hmMatch[1]) * 60) + parseInt(hmMatch[2], 10);
    return { durationMins: mins, isRest: mins <= 0 };
  }

  const hMatch = val.match(/^(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?|u|uur)$/i);
  if (hMatch) {
    const mins = Math.round(parseFloat(hMatch[1]) * 60);
    return { durationMins: mins, isRest: mins <= 0 };
  }

  const mMatch = val.match(/^(\d+)\s*(?:m|mins?|minutes?|min)$/i);
  if (mMatch) {
    const mins = parseInt(mMatch[1], 10);
    return { durationMins: mins, isRest: mins <= 0 };
  }

  const num = parseFloat(val);
  if (!isNaN(num)) {
    const mins = num <= 6 ? Math.round(num * 60) : Math.round(num);
    return { durationMins: mins, isRest: mins <= 0 };
  }

  return null;
}

function parseSingleTextIntoScheduleMap(
  text: string,
  refDateStr: string,
  target: DetailedScheduleMap
): boolean {
  if (!text || !text.trim()) return false;
  let matchedAny = false;
  const trimmed = text.trim();
  const isMultiDaySchedule =
    /weekly\s+schedule/i.test(trimmed) ||
    WEEKDAYS_SHORT.filter((short, idx) =>
      new RegExp(`\\b(${short}|${WEEKDAYS[idx]})\\b`, 'i').test(trimmed)
    ).length >= 2;

  const dayAliases: Record<string, string[]> = {
    mon: ['mon', 'monday', 'ma', 'maandag'],
    tue: ['tue', 'tues', 'tuesday', 'di', 'dinsdag'],
    wed: ['wed', 'wednesday', 'wo', 'woensdag'],
    thu: ['thu', 'thur', 'thurs', 'thursday', 'do', 'donderdag'],
    fri: ['fri', 'friday', 'vr', 'vrijdag'],
    sat: ['sat', 'saturday', 'za', 'zaterdag'],
    sun: ['sun', 'sunday', 'zo', 'zondag']
  };

  const dayTokens = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const durationAtom = `(?:\\d+(?:\\.\\d+)?\\s*(?:h|hrs?|hours?|u|uur)\\s*(?:\\d+\\s*(?:m|mins?|minutes?|min))?|\\d+\\s*(?:m|mins?|minutes?|min)|rest\\s*day|rust\\s*dag|day\\s*off|rest|rust|off)`;

  // 1. Parse relative "today" / "tomorrow" / "vandaag" / "morgen"
  const relativeSpecs: { pattern: string; offset: number }[] = [
    { pattern: 'today|vandaag|tonight|this afternoon|this evening', offset: 0 },
    { pattern: 'tomorrow|morgen', offset: 1 }
  ];

  for (const rel of relativeSpecs) {
    const relDateStr = addDaysToIso(refDateStr, rel.offset);
    const relToken = weekdayTokenFromIso(relDateStr);
    const hasRelMention = new RegExp(`\\b(?:${rel.pattern})\\b`, 'i').test(trimmed);
    if (!hasRelMention) continue;

    // Format A: "Today: Rest", "Today (Mon): 1h", "Today (Monday, Nov 23): 60m VO2 Max"
    const colonRegex = new RegExp(`(?:^|[\\s,;])(?:${rel.pattern})(?:\\s*\\([^)]*\\))?\\s*[:=\\-]\\s*(${durationAtom})\\b`, 'i');
    // Format B: "Make/set/schedule today ... to/as 1h / 60m / Rest"
    const verbRegex = new RegExp(`\\b(?:make|set|schedule|keep|change|adapt|update|turn|plan|zet|maak)\\s+(?:my\\s+|the\\s+)?(?:workout\\s+(?:for|on|of)\\s+)?(?:${rel.pattern})(?:\\s*\\([^)]*\\))?(?:\\s+(?:should\\s+(?:only\\s+)?be|as|to|into|for|with|op|als))?(?:\\s+(?:a|an|een))?\\s+(${durationAtom})\\b`, 'i');
    // Format C: "Schedule a 60m VO2 Max interval session for Today (Saturday, 2026-11-28)" / "1h endurance ride for today"
    const reverseRegex = new RegExp(`\\b(${durationAtom})(?:\\s+[^,.;\\n()]{1,65}?)?\\s+(?:for|on|voor|op)\\s+(?:${rel.pattern})\\b`, 'i');
    // Format D: "workout of today should only be 1 hour" / "today's workout ... 1 hour"
    const subjectVerbRegex = new RegExp(`\\b(?:${rel.pattern})(?:'s)?(?:\\s+\\w+){0,4}\\s+(?:should|must|can|will)?\\s*(?:only\\s+)?(?:be|last)\\s+(?:a\\s+|an\\s+)?(${durationAtom})\\b`, 'i');
    // Format E: "<rel> as/is/will be (a) rest day"
    const isRestRegex = new RegExp(`\\b(?:${rel.pattern})(?:\\s*\\([^)]*\\))?\\s+(?:is|as|will\\s+be|wordt|als)\\s+(?:a\\s+|an\\s+|een\\s+)?(rest\\s*day|rust\\s*dag|day\\s*off|rest|rust|off)\\b`, 'i');

    const match =
      trimmed.match(colonRegex) ||
      trimmed.match(verbRegex) ||
      trimmed.match(reverseRegex) ||
      trimmed.match(subjectVerbRegex) ||
      trimmed.match(isRestRegex);

    const workoutType = !isMultiDaySchedule ? detectWorkoutFocusType(trimmed) : undefined;

    if (match && match[1]) {
      const parsed = parseDurationValueToMins(match[1]);
      if (parsed) {
        const rule: ScheduleRule = {
          ...parsed,
          targetDateStr: relDateStr,
          ...(workoutType && !parsed.isRest ? { workoutType } : {})
        };
        target.byDate[relDateStr] = rule;
        target.byWeekday[relToken] = rule;
        matchedAny = true;
      }
    } else if (!isMultiDaySchedule && workoutType) {
      // Type-only directive for Today/Tomorrow (e.g. "Change today's workout to VO2 Max intervals")
      const existingRule = target.byDate[relDateStr] || target.byWeekday[relToken];
      const rule: ScheduleRule = {
        durationMins: existingRule && existingRule.durationMins > 0 ? existingRule.durationMins : 60,
        isRest: false,
        targetDateStr: relDateStr,
        workoutType,
        preserveDuration: !(existingRule && existingRule.durationMins > 0)
      };
      target.byDate[relDateStr] = rule;
      target.byWeekday[relToken] = rule;
      matchedAny = true;
    }
  }

  // 2. Parse explicit weekday rules (e.g., "MON: Rest", "Monday (Nov 23): 1h", "60m VO2 Max ride on Tuesday")
  dayTokens.forEach(day => {
    const aliasPattern = dayAliases[day].join('|');

    // Colon/equals or direct follow: "MON: 1h", "Monday (Nov 23): Rest", "Tue 90m"
    const directRegex = new RegExp(`(?:^|[\\s,;])(${aliasPattern})(?:\\s*\\([^)]*\\))?\\s*(?::|=|\\s)\\s*(${durationAtom})\\b`, 'i');
    // Verb phrasing: "make/set/schedule/change Monday (as/to/for) (a) Rest day / 1h"
    const verbRegex = new RegExp(`\\b(?:make|set|schedule|keep|change|adapt|update|turn|plan|zet|maak)\\s+(?:my\\s+|the\\s+)?(?:workout\\s+(?:for|on|of)\\s+)?(${aliasPattern})(?:\\s*\\([^)]*\\))?(?:\\s+(?:as|to|into|for|with|op|als))?(?:\\s+(?:a|an|een))?\\s+(${durationAtom})\\b`, 'i');
    // Reverse phrasing: "60m VO2 Max ride on Tuesday" / "Rest day on Monday" (guarded against crossing parentheses or commas)
    const reverseRegex = isMultiDaySchedule
      ? null
      : new RegExp(`\\b(${durationAtom})(?:\\s+[^,.;\\n()]{1,65}?)?\\s+(?:for|on|voor|op)\\s+(${aliasPattern})\\b`, 'i');

    const match =
      trimmed.match(directRegex) ||
      trimmed.match(verbRegex) ||
      (reverseRegex ? trimmed.match(reverseRegex) : null);

    if (match) {
      // Avoid matching a parenthetical weekday that follows "today/tomorrow" e.g. "for Today (Saturday, 2026-11-28)"
      const matchedStr = match[0] || '';
      const beforeMatch = trimmed.slice(0, match.index || 0);
      if (/\(\s*$/.test(beforeMatch) && !matchedStr.includes(':')) {
        return;
      }

      const durStr = match[2] ?? match[1];
      const parsed = parseDurationValueToMins(durStr);
      if (parsed) {
        const workoutType = !isMultiDaySchedule ? detectWorkoutFocusType(trimmed) : undefined;
        target.byWeekday[day] = {
          ...parsed,
          ...(workoutType && !parsed.isRest ? { workoutType } : {})
        };
        matchedAny = true;
      }
    }
  });

  return matchedAny;
}

/**
 * Parses daily duration and rest constraints from a weekly schedule directive string,
 * PlanDirective[] JSON, or SavedAvailabilityRecord JSON, preserving both weekday rules
 * and exact calendar date rules (including "today"/"tomorrow" resolved from requestedAt).
 */
export function parseDetailedScheduleFromDirective(
  directiveText: string | null | undefined
): DetailedScheduleMap | null {
  const result: DetailedScheduleMap = {
    byWeekday: {},
    byDate: {}
  };

  const loadFromLocalStorage = (): DetailedScheduleMap | null => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('wattson_last_saved_availability');
      if (!stored) return null;
      const parsedStored = JSON.parse(stored);
      const localMap: DetailedScheduleMap = { byWeekday: {}, byDate: {} };
      if (parsedStored && Array.isArray(parsedStored.days) && parsedStored.days.length > 0) {
        parsedStored.days.forEach((d: any) => {
          const short = (d.dayShort || '').toLowerCase().substring(0, 3);
          const token = normalizeWeekdayToken(short || d.dayName);
          const mins = typeof d.durationMins === 'number' ? d.durationMins : 0;
          const rule: ScheduleRule = {
            durationMins: mins,
            isRest: mins <= 0,
            targetDateStr: typeof d.dateStr === 'string' && d.dateStr ? d.dateStr : undefined
          };
          if (token) {
            localMap.byWeekday[token] = rule;
          }
          if (rule.targetDateStr) {
            localMap.byDate[rule.targetDateStr] = rule;
          }
        });
        if (Object.keys(localMap.byWeekday).length > 0 || Object.keys(localMap.byDate).length > 0) {
          return localMap;
        }
      }
      if (parsedStored && parsedStored.directiveText) {
        parseSingleTextIntoScheduleMap(parsedStored.directiveText, getTodayDateString(), localMap);
        if (Object.keys(localMap.byWeekday).length > 0 || Object.keys(localMap.byDate).length > 0) {
          return localMap;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  };

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
            const mins = typeof d.durationMins === 'number' ? d.durationMins : 0;
            const rule: ScheduleRule = {
              durationMins: mins,
              isRest: mins <= 0,
              targetDateStr: typeof d.dateStr === 'string' && d.dateStr ? d.dateStr : undefined
            };
            if (token) result.byWeekday[token] = rule;
            if (rule.targetDateStr) result.byDate[rule.targetDateStr] = rule;
          });
          if (Object.keys(result.byWeekday).length > 0 || Object.keys(result.byDate).length > 0) {
            return result;
          }
        }

        // Format B: Array of PlanDirectives (apply oldest -> newest so newer directives override older ones)
        if (Array.isArray(parsed)) {
          const today = getTodayDateString();
          const { active } = pruneExpiredDirectives(
            parsed.filter((d: any) => d && typeof d.text === 'string' && d.text.trim().length > 0),
            today
          );

          let hasWeeklyScheduleInDirectives = false;
          for (const dir of active) {
            const refDate = dir.requestedAt || today;
            const isWeeklySched = dir.text.toLowerCase().includes('weekly schedule');
            if (isWeeklySched) {
              // New weekly schedule resets earlier weekday rules before layering subsequent tweaks
              result.byWeekday = {};
              result.byDate = {};
              hasWeeklyScheduleInDirectives = true;
            }
            parseSingleTextIntoScheduleMap(dir.text, refDate, result);
          }

          if (Object.keys(result.byWeekday).length > 0 || Object.keys(result.byDate).length > 0) {
            // If no weekly schedule directive existed in planContext, seed missing days from localStorage availability ONLY for days not overridden
            if (!hasWeeklyScheduleInDirectives) {
              const fallback = loadFromLocalStorage();
              if (fallback) {
                return {
                  byWeekday: { ...fallback.byWeekday, ...result.byWeekday },
                  byDate: { ...fallback.byDate, ...result.byDate }
                };
              }
            }
            return result;
          }

          return loadFromLocalStorage();
        }
      } catch {
        // Fall through to plain-text parsing
      }
    }

    // Plain-text directive
    if (trimmed) {
      const matched = parseSingleTextIntoScheduleMap(trimmed, getTodayDateString(), result);
      if (matched) {
        return result;
      }
    }
  }

  return loadFromLocalStorage();
}

/**
 * Parses daily duration and rest constraints from a weekly schedule directive string or availability record.
 * Handles:
 * - Directives like "Adjusted weekly schedule: WED: 3h, THU: Rest, FRI: 1h, SAT: 3h, SUN: 2h, MON: 1h, TUE: Rest (Total: 10h)"
 * - JSON serialized PlanDirective[] arrays (including "today" / "tomorrow" / per-day overrides)
 * - JSON SavedAvailabilityRecord objects
 * - Multilingual weekday names (English and Dutch, short and full)
 */
export function parseScheduleDurationsFromDirective(directiveText: string | null | undefined): Record<string, { durationMins: number; isRest: boolean }> | null {
  const detailed = parseDetailedScheduleFromDirective(directiveText);
  if (!detailed) return null;
  if (Object.keys(detailed.byWeekday).length > 0) {
    const out: Record<string, { durationMins: number; isRest: boolean }> = {};
    for (const [k, v] of Object.entries(detailed.byWeekday)) {
      out[k] = { durationMins: v.durationMins, isRest: v.isRest };
    }
    return out;
  }
  return null;
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
  let detailed = planContext ? parseDetailedScheduleFromDirective(planContext) : null;
  if (!detailed && typeof window !== 'undefined') {
    detailed = parseDetailedScheduleFromDirective('');
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week2Start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

  const base: WeeklyBriefing = briefing ? { ...briefing } : {
    phase: 'Build / Aerobic Base',
    focus: 'Custom Training Schedule',
    outlook_summary: 'Personalized training week aligned with your availability.',
    ftp: userFtp,
    days: []
  };

  const existingDays = base.days || [];

  // If no custom schedule is set anywhere, return base unchanged
  if (!detailed || (Object.keys(detailed.byWeekday).length === 0 && Object.keys(detailed.byDate).length === 0)) {
    return base;
  }

  const anyExistingHasDate = existingDays.some(d => parseBriefingDayDate(d.day, today) !== null);
  const harmonizedWeek1Days: WeeklyBriefing['days'] = [];

  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const targetIso = toIsoDateStr(targetDate);
    const weekdayShort = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayName = `${weekdayShort} (${monthDay})`;
    const token = normalizeWeekdayToken(weekdayShort);
    const rule = detailed.byDate[targetIso] || (token ? detailed.byWeekday[token] : null) || null;

    const existingDayByExactDate = existingDays.find(d => {
      const parsed = parseBriefingDayDate(d.day, today);
      return parsed &&
        parsed.getFullYear() === targetDate.getFullYear() &&
        parsed.getMonth() === targetDate.getMonth() &&
        parsed.getDate() === targetDate.getDate();
    });
    const existingDayTodayLabel = i === 0
      ? existingDays.find(d => /\btoday\b/i.test(d.day || ''))
      : undefined;
    const existingDayByWeekdayInWeek1 = existingDays.find(d => {
      if (normalizeWeekdayToken(d.day) !== token) return false;
      const parsed = parseBriefingDayDate(d.day, today);
      return !parsed || (parsed >= today && parsed < week2Start);
    });
    const existingDay = existingDayByExactDate ||
      existingDayTodayLabel ||
      existingDayByWeekdayInWeek1 ||
      (!anyExistingHasDate ? existingDays[i] : undefined);

    if (existingDay?.manualOverride) {
      harmonizedWeek1Days.push({
        ...existingDay,
        day: dayName
      });
    } else if (rule) {
      if (rule.isRest || (!rule.preserveDuration && rule.durationMins <= 0)) {
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
        // Active workout of exact duration requestedMins
        const requestedMins = rule.preserveDuration
          ? (existingDay && existingDay.duration_target > 0 ? existingDay.duration_target : rule.durationMins || 60)
          : rule.durationMins;

        const hadWorkout = existingDay && 
          existingDay.intensity !== 'Rest' && 
          !existingDay.focus.toLowerCase().includes('rest') && 
          (existingDay.duration_target || 0) > 0;

        const impliedExistingType = existingDay ? detectWorkoutFocusType(existingDay.focus) : undefined;
        const requiredType = rule.workoutType || impliedExistingType;
        const existingMatchesRequiredType = requiredType
          ? doesDayMatchWorkoutType(existingDay, requiredType, userFtp)
          : true;

        if (hadWorkout && existingDay && existingMatchesRequiredType) {
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
            const built = buildStructuredWorkoutForType(requiredType || 'endurance', requestedMins, userFtp);
            scaledSteps = built.workout_steps;
          }

          const sumStepDur = scaledSteps.reduce((sum, s) => sum + s.duration, 0);
          if (sumStepDur !== requestedMins && scaledSteps.length > 0) {
            const lastFillerIdx = [...scaledSteps].reverse().findIndex(s => !isWorkStep(s));
            const idx = lastFillerIdx !== -1 ? scaledSteps.length - 1 - lastFillerIdx : scaledSteps.length - 1;
            scaledSteps[idx].duration = Math.max(1, scaledSteps[idx].duration + (requestedMins - sumStepDur));
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
          // Build a fresh structured workout matching the requested type (VO2 Max, Threshold, Sweet Spot, Endurance, etc.)
          const targetType: WorkoutFocusType = requiredType || (requestedMins >= 60 ? 'endurance' : 'recovery');
          const built = buildStructuredWorkoutForType(targetType, requestedMins, userFtp);

          harmonizedWeek1Days.push({
            day: dayName,
            focus: built.focus,
            intensity: built.intensity,
            duration_target: requestedMins,
            load_target: built.load_target,
            why: built.why,
            workout_steps: built.workout_steps
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

  // Preserve any days from weeks 2, 3, 4 without leaking stale Week 1 days by calendar date
  const remainingDays = anyExistingHasDate
    ? existingDays.filter(d => {
        const parsed = parseBriefingDayDate(d.day, today);
        return parsed ? parsed >= week2Start : false;
      })
    : existingDays.slice(7);

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

  // 0b. Weekly / multi-day schedule directives apply for the entire 7-day week
  const distinctWeekdaysCount = WEEKDAYS_SHORT.filter((short, idx) =>
    new RegExp(`\\b(${short}|${WEEKDAYS[idx]})\\b`, 'i').test(textLower)
  ).length;
  if (textLower.includes('weekly schedule') || textLower.includes('adjusted weekly schedule') || distinctWeekdaysCount >= 2) {
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

    const distinctWeekdaysCount = WEEKDAYS_SHORT.filter((short, idx) =>
      new RegExp(`\\b(${short}|${WEEKDAYS[idx]})\\b`, 'i').test(textLower)
    ).length;

    let note = '';
    if (textLower.includes('adjusted weekly schedule') || textLower.includes('weekly schedule') || distinctWeekdaysCount >= 2) {
      note = ` [MANDATORY WEEKLY AVAILABILITY CONSTRAINTS: You MUST strictly set every single specified day — INCLUDING TODAY (Day 1) — to the exact duration and Rest status requested!]`;
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
