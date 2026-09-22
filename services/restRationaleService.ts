import { Activity, Wellness, WeeklyBriefing } from '../types';

export interface AthleteStatsContext {
  ctl?: number;
  atl?: number;
  form?: number; // TSB = CTL - ATL
  total7DayLoad?: number;
  statusLabel?: string;
  readiness?: number;
}

export interface DayPlanItem {
  day: string;
  focus?: string;
  duration_target?: number;
  load_target?: number;
  intensity?: string;
  why?: string;
}

export interface RestDayDataRationale {
  headline: string;
  explanation: string;
  metrics: {
    label: string;
    value: string;
    subtext: string;
    tone: 'emerald' | 'amber' | 'rose' | 'blue';
  }[];
  physiologicalFocus: {
    icon: string;
    title: string;
    description: string;
  }[];
  summaryQuote: string;
}

/**
 * Normalizes day strings to weekday tokens (MON, TUE, etc.)
 */
function getWeekdayToken(dayStr: string): string {
  if (!dayStr) return '';
  const clean = dayStr.toUpperCase().trim();
  const match = clean.match(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)\b/);
  if (match) return match[1];
  if (clean.includes('MONDAY')) return 'MON';
  if (clean.includes('TUESDAY')) return 'TUE';
  if (clean.includes('WEDNESDAY')) return 'WED';
  if (clean.includes('THURSDAY')) return 'THU';
  if (clean.includes('FRIDAY')) return 'FRI';
  if (clean.includes('SATURDAY')) return 'SAT';
  if (clean.includes('SUNDAY')) return 'SUN';
  return '';
}

/**
 * Computes a data-driven rationale explaining why a rest day is scheduled on a specific day,
 * factoring in acute fatigue (ATL), fitness (CTL), form (TSB), preceding consecutive days,
 * prior TSS accumulation, and the demands of upcoming key workouts.
 */
export function generateDataDrivenRestRationale(params: {
  dayName: string;
  dayIndex?: number;
  stats?: AthleteStatsContext | null;
  allDays?: DayPlanItem[] | WeeklyBriefing['days'] | null;
  recentActivities?: Activity[] | null;
  wellness?: Wellness[] | null;
}): RestDayDataRationale {
  const { dayName, stats, allDays, recentActivities, wellness } = params;

  const atl = Math.round(stats?.atl ?? 0);
  const ctl = Math.round(stats?.ctl ?? 0);
  const form = Math.round(stats?.form ?? (ctl - atl));
  const sevenDayLoad = Math.round(stats?.total7DayLoad ?? 0);

  // 1. Analyze surrounding days in the weekly briefing or schedule
  const daysList: DayPlanItem[] = (allDays && Array.isArray(allDays)) ? (allDays as DayPlanItem[]) : [];
  
  let targetIdx = typeof params.dayIndex === 'number' && params.dayIndex >= 0 ? params.dayIndex : -1;
  if (targetIdx === -1 && daysList.length > 0) {
    const targetToken = getWeekdayToken(dayName);
    targetIdx = daysList.findIndex(d => {
      if (!d?.day) return false;
      if (d.day === dayName) return true;
      if (targetToken && getWeekdayToken(d.day) === targetToken) return true;
      return false;
    });
  }

  // Count active consecutive days and load immediately preceding this day
  let precedingDaysCount = 0;
  let precedingTss = 0;
  let lastActiveWorkoutFocus = '';
  let lastActiveDuration = 0;

  if (targetIdx > 0 && daysList.length > 0) {
    for (let i = targetIdx - 1; i >= 0; i--) {
      const d = daysList[i];
      const isDayRest = d.intensity === 'Rest' || 
                        (d.focus || '').toLowerCase().includes('rest') || 
                        (d.duration_target || 0) <= 0;
      if (isDayRest) {
        break;
      }
      precedingDaysCount += 1;
      precedingTss += Math.round(d.load_target || (d.duration_target ? d.duration_target * 0.7 : 0));
      if (!lastActiveWorkoutFocus) {
        lastActiveWorkoutFocus = d.focus || 'Training Session';
        lastActiveDuration = d.duration_target || 60;
      }
    }
  }

  // If no preceding days found in weekly plan (e.g. target is Day 0 / Monday / Today), check recent activities
  if (precedingDaysCount === 0 && recentActivities && recentActivities.length > 0) {
    const now = new Date();
    const sorted = [...recentActivities].sort((a, b) => 
      new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime()
    );

    // Look at activities within the last 4 days
    for (let dAgo = 1; dAgo <= 4; dAgo++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() - dAgo);
      const ds = checkDate.toISOString().split('T')[0];
      const actOnDay = sorted.find(a => (a.start_date_local || '').startsWith(ds));
      if (actOnDay) {
        precedingDaysCount += 1;
        const load = actOnDay.icu_training_load || actOnDay.icu_tss || actOnDay.training_load || 50;
        precedingTss += Math.round(load);
        if (!lastActiveWorkoutFocus) {
          lastActiveWorkoutFocus = actOnDay.name || 'Recent Ride';
          lastActiveDuration = Math.round((actOnDay.moving_time || 3600) / 60);
        }
      } else {
        if (precedingDaysCount > 0) break;
      }
    }
  }

  // Identify next upcoming key session
  let nextWorkoutFocus = '';
  let nextWorkoutDuration = 0;
  let nextWorkoutIntensity = '';

  if (targetIdx !== -1 && targetIdx < daysList.length - 1) {
    for (let i = targetIdx + 1; i < daysList.length; i++) {
      const d = daysList[i];
      const isDayRest = d.intensity === 'Rest' || 
                        (d.focus || '').toLowerCase().includes('rest') || 
                        (d.duration_target || 0) <= 0;
      if (!isDayRest) {
        nextWorkoutFocus = d.focus || 'Key Session';
        nextWorkoutDuration = d.duration_target || 60;
        nextWorkoutIntensity = d.intensity || 'Medium';
        break;
      }
    }
  }

  // 2. Determine Form (TSB) and Acute Fatigue status
  const isHighFatigue = form < -15 || atl >= 75;
  const isProductiveFatigue = form >= -15 && form < -5;
  const isModerateFatigue = form >= -5 && form <= 5;
  const isFresh = form > 5;

  let formStatusLabel = 'Optimal';
  let formTone: 'emerald' | 'amber' | 'rose' | 'blue' = 'emerald';
  if (isHighFatigue) {
    formStatusLabel = 'High Fatigue';
    formTone = 'rose';
  } else if (isProductiveFatigue) {
    formStatusLabel = 'Productive Load';
    formTone = 'amber';
  } else if (isFresh) {
    formStatusLabel = 'Fresh / Rested';
    formTone = 'blue';
  }

  // 3. Build data-driven metrics for display
  const metrics: RestDayDataRationale['metrics'] = [];

  // Metric 1: Form (TSB)
  metrics.push({
    label: 'Form (TSB)',
    value: form > 0 ? `+${form}` : `${form}`,
    subtext: formStatusLabel,
    tone: formTone
  });

  // Metric 2: Acute Fatigue (ATL)
  metrics.push({
    label: 'Acute Fatigue',
    value: atl > 0 ? `${atl} ATL` : 'Baseline',
    subtext: atl > 70 ? 'High systemic load' : (atl > 45 ? 'Steady training stimulus' : 'Low acute stress'),
    tone: atl > 70 ? 'rose' : (atl > 45 ? 'amber' : 'emerald')
  });

  // Metric 3: Preceding Workload or 7-Day Load
  if (precedingDaysCount > 0 && precedingTss > 0) {
    metrics.push({
      label: 'Preceding Load',
      value: `${precedingTss} TSS`,
      subtext: `${precedingDaysCount} consecutive active day${precedingDaysCount > 1 ? 's' : ''}`,
      tone: precedingTss > 180 ? 'rose' : (precedingTss > 100 ? 'amber' : 'emerald')
    });
  } else if (sevenDayLoad > 0) {
    metrics.push({
      label: '7-Day Rolling Load',
      value: `${sevenDayLoad} TSS`,
      subtext: 'Weekly cumulative stress',
      tone: sevenDayLoad > 400 ? 'amber' : 'emerald'
    });
  } else if (ctl > 0) {
    metrics.push({
      label: 'Fitness Base',
      value: `${ctl} CTL`,
      subtext: 'Chronic training load',
      tone: 'blue'
    });
  }

  // 4. Construct Data-Driven Explanation & Summary Quote
  let headline = 'Physiological Adaptation Window';
  let explanation = '';
  let summaryQuote = '';

  const precedingText = precedingDaysCount > 0 && precedingTss > 0
    ? `Following ${precedingDaysCount} consecutive active day${precedingDaysCount > 1 ? 's' : ''} accumulating ${precedingTss} TSS`
    : (sevenDayLoad > 0 ? `With ${sevenDayLoad} TSS accumulated over recent training` : 'Following recent training blocks');

  const formText = atl > 0
    ? `with Acute Fatigue at ${atl} ATL and Form at ${form > 0 ? `+${form}` : form} TSB`
    : `with current Form at ${form > 0 ? `+${form}` : form} TSB`;

  const upcomingText = nextWorkoutFocus
    ? `ahead of upcoming ${nextWorkoutFocus}${nextWorkoutDuration ? ` (${nextWorkoutDuration}m)` : ''}`
    : 'to prime your neuromuscular system for upcoming sessions';

  if (isHighFatigue) {
    headline = 'Critical Fatigue Dissipation';
    explanation = `${precedingText} and ${formText}, your acute workload has reached an elevated strain zone. Today's rest day halts non-functional overreaching, suppresses systemic cortisol, and activates deep parasympathetic recovery so you absorb recent training gains.`;
    summaryQuote = `${precedingText} and ${formText}, full rest is critical to dissipate acute fatigue and restore glycogen stores ${upcomingText}.`;
  } else if (isProductiveFatigue) {
    headline = 'Supercompensation & Glycogen Synthesis';
    explanation = `${precedingText} and ${formText}, your body is in an optimal supercompensation window. Muscle glycogen pools require 24 to 36 hours of low systemic strain to fully replenish, while mitochondrial protein synthesis peaks during zero-load recovery.`;
    summaryQuote = `${precedingText} (${formText}), zero load allows muscle glycogen repletion and supercompensation ${upcomingText}.`;
  } else if (isFresh) {
    headline = 'Freshness & Motor Unit Priming';
    explanation = `${precedingText} with Form at +${form} TSB, your physiological readiness is elevated. Scheduling rest today consolidates recent neuromuscular adaptations and preserves central nervous system freshness ${upcomingText}.`;
    summaryQuote = `With Form at +${form} TSB, resting preserves neuromuscular freshness and glycogen stores ${upcomingText}.`;
  } else {
    headline = 'Strategic Adaptation & Balance';
    explanation = `${precedingText} and ${formText}, this scheduled rest day balances adaptation with fatigue clearance. It clears metabolic byproducts and stabilizes heart rate variability (HRV) ${upcomingText}.`;
    summaryQuote = `${precedingText} (${formText}), rest balances training adaptation and clears fatigue ${upcomingText}.`;
  }

  // 5. Build tailored physiological recovery focus items
  const physiologicalFocus: RestDayDataRationale['physiologicalFocus'] = [
    {
      icon: '⚡',
      title: 'Glycogen Resynthesis',
      description: isHighFatigue || precedingTss > 120
        ? `Intense prior load depleted muscle glycogen. Target 4–7g carbs/kg body weight today to fully reload intramuscular glycogen before ${nextWorkoutFocus || 'upcoming rides'}.`
        : 'Consume complex carbohydrates and clean hydration to restore liver and muscle glycogen pools without digestive stress.'
    },
    {
      icon: '🧬',
      title: 'Mitochondrial & Fiber Remodeling',
      description: isHighFatigue
        ? `Elevated muscle breakdown markers require structural repair. Prioritize 1.6–2.0g protein/kg and light mobility to enhance microvascular blood flow.`
        : 'Rest allows satellite cell activation and cellular repair of microscopic muscle fiber microtears accumulated during training.'
    },
    {
      icon: '🧠',
      title: 'Autonomic Nervous System Rebound',
      description: 'Zero training load reactivates the parasympathetic branch, reducing resting heart rate and elevating HRV for complete neuromuscular readiness.'
    }
  ];

  return {
    headline,
    explanation,
    metrics,
    physiologicalFocus,
    summaryQuote
  };
}
