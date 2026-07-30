export interface LibraryWorkout {
  id: string;
  title: string;
  description: string;
  category: 'Recovery' | 'Endurance' | 'Tempo/Sweet Spot' | 'Threshold' | 'VO2 Max' | 'Anaerobic';
  intensity: 'Easy' | 'Medium' | 'Hard' | 'Rest';
  duration_minutes: number;
  tss: number;
  workout_steps: {
    duration: number; // minutes
    target_pct: number; // percentage of FTP as decimal, e.g. 0.55
    label: string;
  }[];
}

export const WORKOUT_LIBRARY: LibraryWorkout[] = [
  {
    id: 'active_recovery_spin',
    title: 'Active Recovery Spin',
    description: 'An easy, steady spin designed to promote blood flow, facilitate metabolic clearance, and accelerate recovery without accumulating cardiovascular fatigue.',
    category: 'Recovery',
    intensity: 'Easy',
    duration_minutes: 30,
    tss: 15,
    workout_steps: [
      { duration: 5, target_pct: 0.45, label: 'Spin up warmup' },
      { duration: 20, target_pct: 0.52, label: 'Steady recovery spin' },
      { duration: 5, target_pct: 0.40, label: 'Easy cooldown' }
    ]
  },
  {
    id: 'aerobic_endurance_60',
    title: 'Aerobic Base Builder (60 Min)',
    description: 'Standard Zone 2 endurance ride focusing on aerobic efficiency, fat utilization, and building muscle mitochondria.',
    category: 'Endurance',
    intensity: 'Easy',
    duration_minutes: 60,
    tss: 40,
    workout_steps: [
      { duration: 10, target_pct: 0.55, label: 'Gradual warmup' },
      { duration: 45, target_pct: 0.65, label: 'Steady Zone 2 endurance' },
      { duration: 5, target_pct: 0.50, label: 'Easy cooldown spin' }
    ]
  },
  {
    id: 'aerobic_endurance_90',
    title: 'Aerobic Base Builder (90 Min)',
    description: 'Extended Zone 2 ride designed to challenge metabolic resilience and increase lipid oxidation efficiency over a longer duration.',
    category: 'Endurance',
    intensity: 'Easy',
    duration_minutes: 90,
    tss: 65,
    workout_steps: [
      { duration: 10, target_pct: 0.55, label: 'Gradual warmup' },
      { duration: 75, target_pct: 0.65, label: 'Steady Zone 2 endurance' },
      { duration: 5, target_pct: 0.50, label: 'Easy cooldown spin' }
    ]
  },
  {
    id: 'sweet_spot_2x15',
    title: 'Sweet Spot Progression (2x15m)',
    description: 'A classic aerobic engine builder. Two 15-minute intervals at sweet spot intensity (88% FTP) to maximize threshold gains with moderate physiological fatigue.',
    category: 'Tempo/Sweet Spot',
    intensity: 'Medium',
    duration_minutes: 60,
    tss: 55,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Progressive warmup' },
      { duration: 15, target_pct: 0.88, label: 'Sweet Spot Rep 1 @ 88% FTP' },
      { duration: 5, target_pct: 0.55, label: 'Recovery spin' },
      { duration: 15, target_pct: 0.88, label: 'Sweet Spot Rep 2 @ 88% FTP' },
      { duration: 5, target_pct: 0.55, label: 'Recovery spin' },
      { duration: 10, target_pct: 0.50, label: 'Cooldown spin' }
    ]
  },
  {
    id: 'steady_tempo_aerobic',
    title: 'Aerobic Tempo Steady State',
    description: 'One long, continuous tempo block to develop structural strength, muscle glycogen storage, and muscular endurance.',
    category: 'Tempo/Sweet Spot',
    intensity: 'Medium',
    duration_minutes: 50,
    tss: 42,
    workout_steps: [
      { duration: 10, target_pct: 0.58, label: 'Aerobic warmup' },
      { duration: 30, target_pct: 0.80, label: 'Continuous Tempo @ 80% FTP' },
      { duration: 10, target_pct: 0.50, label: 'Easy recovery spin' }
    ]
  },
  {
    id: 'threshold_ladder_4x8',
    title: 'Threshold Interval Ladder (4x8m)',
    description: 'Four 8-minute efforts right at your functional threshold (100% FTP) designed to increase your maximum steady-state lactate clearance capacity.',
    category: 'Threshold',
    intensity: 'Hard',
    duration_minutes: 60,
    tss: 62,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Warmup with 30s openers' },
      { duration: 8, target_pct: 1.00, label: 'Threshold Rep 1 @ 100% FTP' },
      { duration: 3, target_pct: 0.55, label: 'Active recovery' },
      { duration: 8, target_pct: 1.00, label: 'Threshold Rep 2 @ 100% FTP' },
      { duration: 3, target_pct: 0.55, label: 'Active recovery' },
      { duration: 8, target_pct: 1.00, label: 'Threshold Rep 3 @ 100% FTP' },
      { duration: 3, target_pct: 0.55, label: 'Active recovery' },
      { duration: 8, target_pct: 1.00, label: 'Threshold Rep 4 @ 100% FTP' },
      { duration: 7, target_pct: 0.48, label: 'Thorough cooldown' }
    ]
  },
  {
    id: 'threshold_over_under_3x9',
    title: 'Over-Under Adaptations (3x9m)',
    description: 'Three 9-minute blocks oscillating between 95% and 105% FTP. Teaches the body to clear accumulated lactate while maintaining high power output.',
    category: 'Threshold',
    intensity: 'Hard',
    duration_minutes: 60,
    tss: 58,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Aerobic warmup with openers' },
      
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      
      { duration: 5, target_pct: 0.55, label: 'Recovery rest spin' },
      
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      
      { duration: 5, target_pct: 0.55, label: 'Recovery rest spin' },
      
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      { duration: 2, target_pct: 0.95, label: 'Under block @ 95% FTP' },
      { duration: 1, target_pct: 1.05, label: 'Over surge @ 105% FTP' },
      
      { duration: 6, target_pct: 0.50, label: 'Spinning cooldown' }
    ]
  },
  {
    id: 'vo2max_boost_5x3',
    title: 'VO2 Max Engine Booster (5x3m)',
    description: 'Five 3-minute high-intensity intervals at 115% of FTP with equal rest. Highly effective at raising your maximum aerobic capacity (VO2max).',
    category: 'VO2 Max',
    intensity: 'Hard',
    duration_minutes: 45,
    tss: 52,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Warmup with 2x30s openers' },
      { duration: 3, target_pct: 1.15, label: 'VO2 Max Rep 1 @ 115% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 3, target_pct: 1.15, label: 'VO2 Max Rep 2 @ 115% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 3, target_pct: 1.15, label: 'VO2 Max Rep 3 @ 115% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 3, target_pct: 1.15, label: 'VO2 Max Rep 4 @ 115% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 3, target_pct: 1.15, label: 'VO2 Max Rep 5 @ 115% FTP' },
      { duration: 8, target_pct: 0.45, label: 'Thorough cooldown' }
    ]
  },
  {
    id: 'norwegian_4x4',
    title: 'Norwegian Aerobic Power (4x4m)',
    description: 'The standard Norwegian style: four 4-minute maximum sustainable aerobic intervals at 110-112% FTP with 3-minute active recoveries.',
    category: 'VO2 Max',
    intensity: 'Hard',
    duration_minutes: 45,
    tss: 48,
    workout_steps: [
      { duration: 10, target_pct: 0.58, label: 'Gradual warmup' },
      { duration: 4, target_pct: 1.10, label: 'Norwegian Rep 1 @ 110% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Active recovery' },
      { duration: 4, target_pct: 1.10, label: 'Norwegian Rep 2 @ 110% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Active recovery' },
      { duration: 4, target_pct: 1.10, label: 'Norwegian Rep 3 @ 110% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Active recovery' },
      { duration: 4, target_pct: 1.10, label: 'Norwegian Rep 4 @ 110% FTP' },
      { duration: 10, target_pct: 0.45, label: 'Easy cooldown spin' }
    ]
  },
  {
    id: 'microbursts_30_30',
    title: 'Microburst Capacitance (30/30s)',
    description: 'Two sets of 8 reps of 30 seconds at 130% FTP followed by 30 seconds recovery. Great for building punch and anaerobic repeat capacity.',
    category: 'Anaerobic',
    intensity: 'Hard',
    duration_minutes: 40,
    tss: 45,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Progressive warmup' },
      // Set 1 (8 reps of 30s/30s = 8 minutes)
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 1.1 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 1.2 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 1.3 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 1.4 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 1.5 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 1.6 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 1.7 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 1.8 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      
      { duration: 6, target_pct: 0.50, label: 'Mid-set recovery' },
      
      // Set 2 (8 reps of 30s/30s = 8 minutes)
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 2.1 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 2.2 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 2.3 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 2.4 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 2.5 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 2.6 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 2.7 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      { duration: 0.5, target_pct: 1.30, label: 'Microburst Rep 2.8 @ 130%' },
      { duration: 0.5, target_pct: 0.45, label: 'Spin' },
      
      { duration: 6, target_pct: 0.45, label: 'Easy cooldown' }
    ]
  },
  {
    id: 'sprint_power_builder',
    title: 'Sprint Power Accelerator (6x15s)',
    description: 'Six 15-second maximal neuromuscular sprint efforts with full 4-minute active recoveries. Improves max power output, neuromuscular recruitment, and speed.',
    category: 'Anaerobic',
    intensity: 'Hard',
    duration_minutes: 40,
    tss: 35,
    workout_steps: [
      { duration: 10, target_pct: 0.55, label: 'Warmup with cadence spins' },
      { duration: 0.25, target_pct: 2.00, label: 'All-Out Sprint 1 (15s)' },
      { duration: 4, target_pct: 0.50, label: 'Active recovery' },
      { duration: 0.25, target_pct: 2.00, label: 'All-Out Sprint 2 (15s)' },
      { duration: 4, target_pct: 0.50, label: 'Active recovery' },
      { duration: 0.25, target_pct: 2.00, label: 'All-Out Sprint 3 (15s)' },
      { duration: 4, target_pct: 0.50, label: 'Active recovery' },
      { duration: 0.25, target_pct: 2.00, label: 'All-Out Sprint 4 (15s)' },
      { duration: 4, target_pct: 0.50, label: 'Active recovery' },
      { duration: 0.25, target_pct: 2.00, label: 'All-Out Sprint 5 (15s)' },
      { duration: 4, target_pct: 0.50, label: 'Active recovery' },
      { duration: 0.25, target_pct: 2.00, label: 'All-Out Sprint 6 (15s)' },
      { duration: 7, target_pct: 0.45, label: 'Easy cooldown' }
    ]
  },
  {
    id: 'climbing_sweet_spot',
    title: 'Climbing Force Sweet Spot (3x10m)',
    description: 'Three 10-minute Sweet Spot blocks (85% FTP) conducted at low cadence (55-65 RPM) to build specific climbing muscular force.',
    category: 'Tempo/Sweet Spot',
    intensity: 'Medium',
    duration_minutes: 50,
    tss: 45,
    workout_steps: [
      { duration: 10, target_pct: 0.58, label: 'Progressive warmup' },
      { duration: 10, target_pct: 0.85, label: 'Sweet Spot Climbing @ 85%' },
      { duration: 3, target_pct: 0.50, label: 'Active recovery spin' },
      { duration: 10, target_pct: 0.85, label: 'Sweet Spot Climbing @ 85%' },
      { duration: 3, target_pct: 0.50, label: 'Active recovery spin' },
      { duration: 10, target_pct: 0.85, label: 'Sweet Spot Climbing @ 85%' },
      { duration: 4, target_pct: 0.45, label: 'Easy cooldown spin' }
    ]
  }
];

export const matchWorkoutToLibrary = (focus: string, duration: number, intensity: string): LibraryWorkout | null => {
  const normalizedFocus = (focus || '').toLowerCase();
  const normalizedIntensity = (intensity || '').toLowerCase();

  if (normalizedIntensity === 'rest' || normalizedFocus.includes('rest') || normalizedFocus.includes('off')) {
    return null;
  }

  // Filter library by closest category
  let candidateCategory: LibraryWorkout['category'][] = [];
  if (normalizedFocus.includes('vo2') || normalizedFocus.includes('aerobic capacity') || normalizedFocus.includes('norwegian')) {
    candidateCategory = ['VO2 Max'];
  } else if (normalizedFocus.includes('sprint') || normalizedFocus.includes('anaerobic') || normalizedFocus.includes('burst') || normalizedFocus.includes('micro')) {
    candidateCategory = ['Anaerobic', 'VO2 Max'];
  } else if (normalizedFocus.includes('threshold') || normalizedFocus.includes('under') || normalizedFocus.includes('lthr')) {
    candidateCategory = ['Threshold'];
  } else if (normalizedFocus.includes('sweet spot') || normalizedFocus.includes('sweetspot') || normalizedFocus.includes('sst') || normalizedFocus.includes('tempo')) {
    candidateCategory = ['Tempo/Sweet Spot'];
  } else if (normalizedFocus.includes('recovery') || normalizedFocus.includes('easy')) {
    candidateCategory = ['Recovery'];
  } else if (normalizedFocus.includes('endurance') || normalizedFocus.includes('base') || normalizedFocus.includes('steady') || normalizedFocus.includes('zone 2') || normalizedFocus.includes('z2')) {
    candidateCategory = ['Endurance'];
  }

  // Fallback to intensity mapping if category didn't narrow it down perfectly
  let candidates = WORKOUT_LIBRARY.filter(w => candidateCategory.includes(w.category));
  if (candidates.length === 0) {
    if (normalizedIntensity === 'hard') {
      candidates = WORKOUT_LIBRARY.filter(w => ['Threshold', 'VO2 Max', 'Anaerobic'].includes(w.category));
    } else if (normalizedIntensity === 'medium') {
      candidates = WORKOUT_LIBRARY.filter(w => ['Tempo/Sweet Spot', 'Threshold'].includes(w.category));
    } else {
      candidates = WORKOUT_LIBRARY.filter(w => ['Recovery', 'Endurance'].includes(w.category));
    }
  }

  if (candidates.length === 0) {
    candidates = WORKOUT_LIBRARY;
  }

  // Select the candidate with the closest duration
  return candidates.reduce((best, cur) => {
    const bestDiff = Math.abs(best.duration_minutes - duration);
    const curDiff = Math.abs(cur.duration_minutes - duration);
    return curDiff < bestDiff ? cur : best;
  }, candidates[0]);
};
