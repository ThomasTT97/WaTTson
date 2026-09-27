export interface LibraryWorkout {
  id: string;
  title: string;
  description: string;
  category: 'Recovery' | 'Endurance' | 'Tempo/Sweet Spot' | 'Threshold' | 'VO2 Max' | 'Anaerobic';
  intensity: 'Easy' | 'Medium' | 'Hard' | 'Rest';
  sport: 'Cycling' | 'Running' | 'Swimming';
  duration_minutes: number;
  tss: number;
  workout_steps: {
    duration: number; // minutes
    target_pct: number; // percentage of FTP as decimal, e.g. 0.55
    label: string;
  }[];
}

export const WORKOUT_LIBRARY: LibraryWorkout[] = [
  // --- RECOVERY ---
  {
    id: 'active_recovery_spin',
    title: 'Recovery Spin (30m)',
    description: 'An easy, steady spin designed to promote blood flow, facilitate metabolic clearance, and accelerate muscle recovery without accumulating cardiovascular fatigue.',
    category: 'Recovery',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 30,
    tss: 15,
    workout_steps: [
      { duration: 5, target_pct: 0.45, label: 'Spin up warmup' },
      { duration: 20, target_pct: 0.52, label: 'Steady recovery spin' },
      { duration: 5, target_pct: 0.40, label: 'Easy cooldown' }
    ]
  },
  {
    id: 'mitochondrial_flush',
    title: 'Recovery Flush (40m)',
    description: 'Designed to relieve muscular stiffness. Features highly efficient Zone 1 recovery pacing combined with brief high-cadence, ultra-low-load micro-spinups to flush the legs.',
    category: 'Recovery',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 40,
    tss: 20,
    workout_steps: [
      { duration: 10, target_pct: 0.45, label: 'Easy progressive warmup' },
      { duration: 10, target_pct: 0.50, label: 'Flat aerobic flush' },
      { duration: 0.25, target_pct: 0.85, label: 'High cadence spin-up (no torque)' },
      { duration: 2.75, target_pct: 0.45, label: 'Active recovery spin' },
      { duration: 0.25, target_pct: 0.85, label: 'High cadence spin-up (no torque)' },
      { duration: 2.75, target_pct: 0.45, label: 'Active recovery spin' },
      { duration: 0.25, target_pct: 0.85, label: 'High cadence spin-up (no torque)' },
      { duration: 3.75, target_pct: 0.45, label: 'Active recovery spin' },
      { duration: 10, target_pct: 0.40, label: 'Easy spinning cooldown' }
    ]
  },
  
  // --- ENDURANCE ---
  {
    id: 'aerobic_endurance_60',
    title: 'Endurance Ride (1h)',
    description: '1-hour Zone 2 endurance ride. Great for active fat oxidation, baseline mitochondrial development, and cardiovascular health on limited time.',
    category: 'Endurance',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 60,
    tss: 40,
    workout_steps: [
      { duration: 10, target_pct: 0.55, label: 'Gradual warmup' },
      { duration: 45, target_pct: 0.65, label: 'Steady Zone 2 endurance' },
      { duration: 5, target_pct: 0.50, label: 'Easy cooldown spin' }
    ]
  },
  {
    id: 'aerobic_endurance_75',
    title: 'Endurance Ride (1h15)',
    description: '1h15 Zone 2 endurance ride. Highly effective for building mitochondrial density, increasing fat oxidation efficiency, and strengthening capillary networks.',
    category: 'Endurance',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 75,
    tss: 50,
    workout_steps: [
      { duration: 10, target_pct: 0.55, label: 'Gradual warmup' },
      { duration: 60, target_pct: 0.65, label: 'Steady Zone 2 endurance' },
      { duration: 5, target_pct: 0.50, label: 'Easy cooldown spin' }
    ]
  },
  {
    id: 'aerobic_engine_90',
    title: 'Endurance Ride (1h30)',
    description: '1.5-hour Zone 2 ride designed to trigger deeper cardiovascular adaptations and stimulate muscle glycogen conservation and endurance fat-burning enzymes.',
    category: 'Endurance',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 90,
    tss: 62,
    workout_steps: [
      { duration: 10, target_pct: 0.55, label: 'Gradual progressive warmup' },
      { duration: 75, target_pct: 0.67, label: 'Steady Zone 2 endurance block' },
      { duration: 5, target_pct: 0.50, label: 'Easy spinning cooldown' }
    ]
  },
  {
    id: 'aerobic_endurance_120',
    title: 'Endurance Ride (2h)',
    description: '2-hour Zone 2 base building endurance ride. Teaches the body to conserve glycogen reserves, utilizes fat as a primary fuel source, and strengthens muscular resilience.',
    category: 'Endurance',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 120,
    tss: 82,
    workout_steps: [
      { duration: 15, target_pct: 0.55, label: 'Thorough gradual warmup' },
      { duration: 100, target_pct: 0.65, label: 'Steady Zone 2 endurance focus' },
      { duration: 5, target_pct: 0.50, label: 'Spin out legs cooldown' }
    ]
  },
  {
    id: 'aerobic_endurance_180',
    title: 'Endurance Ride (3h)',
    description: '3-hour Zone 2 steady-state aerobic endurance block. Promotes deeper adaptation in slow-twitch muscle fibers, improving cardiac output and fat clearance rates.',
    category: 'Endurance',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 180,
    tss: 125,
    workout_steps: [
      { duration: 15, target_pct: 0.55, label: 'Thorough gradual warmup' },
      { duration: 160, target_pct: 0.65, label: 'Main steady Zone 2 endurance block' },
      { duration: 5, target_pct: 0.50, label: 'Spin out legs cooldown' }
    ]
  },
  {
    id: 'aerobic_endurance_240',
    title: 'Endurance Ride (4h)',
    description: '4-hour long aerobic endurance ride. Essential for ultra-endurance event preparation. Builds exceptional physical and mental stamina while optimizing metabolic efficiency.',
    category: 'Endurance',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 240,
    tss: 165,
    workout_steps: [
      { duration: 15, target_pct: 0.55, label: 'Thorough gradual warmup' },
      { duration: 220, target_pct: 0.65, label: 'Sustained endurance pacing' },
      { duration: 5, target_pct: 0.50, label: 'Spin out legs cooldown' }
    ]
  },
  {
    id: 'aerobic_endurance_300',
    title: 'Endurance Ride (5h)',
    description: '5-hour epic Zone 2 base endurance ride. The ultimate simulation of long-distance events to maximize fat utilization pathways, skeletal muscle fatigue resistance, and endurance pacing.',
    category: 'Endurance',
    intensity: 'Easy',
    sport: 'Cycling',
    duration_minutes: 300,
    tss: 205,
    workout_steps: [
      { duration: 15, target_pct: 0.55, label: 'Thorough gradual warmup' },
      { duration: 280, target_pct: 0.65, label: 'Unbroken steady-state Zone 2 endurance' },
      { duration: 5, target_pct: 0.50, label: 'Spin out legs cooldown' }
    ]
  },

  // --- TEMPO / SWEET SPOT ---
  {
    id: 'sweet_spot_2x15',
    title: 'Sweet Spot Ride (2x15m)',
    description: 'The premier aerobic engine builder. Two 15-minute efforts at 88% FTP. Delivers maximal aerobic adaptations with significantly less physiological strain than threshold work.',
    category: 'Tempo/Sweet Spot',
    intensity: 'Medium',
    sport: 'Cycling',
    duration_minutes: 60,
    tss: 55,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Progressive warmup' },
      { duration: 15, target_pct: 0.88, label: 'Sweet Spot Rep 1 @ 88% FTP' },
      { duration: 5, target_pct: 0.55, label: 'Recovery spin' },
      { duration: 15, target_pct: 0.88, label: 'Sweet Spot Rep 2 @ 88% FTP' },
      { duration: 15, target_pct: 0.50, label: 'Cooldown spin' }
    ]
  },
  {
    id: 'sweet_spot_sustained_3x12',
    title: 'Sweet Spot Ride (3x12m)',
    description: 'Three 12-minute blocks at 90% FTP. Maximizes cumulative time-in-zone to heavily tax glycogen stores and drive muscular threshold improvements.',
    category: 'Tempo/Sweet Spot',
    intensity: 'Medium',
    sport: 'Cycling',
    duration_minutes: 60,
    tss: 62,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Aerobic warmup with build' },
      { duration: 12, target_pct: 0.90, label: 'Sweet Spot Block 1 @ 90% FTP' },
      { duration: 3, target_pct: 0.55, label: 'Active recovery' },
      { duration: 12, target_pct: 0.90, label: 'Sweet Spot Block 2 @ 90% FTP' },
      { duration: 3, target_pct: 0.55, label: 'Active recovery' },
      { duration: 12, target_pct: 0.90, label: 'Sweet Spot Block 3 @ 90% FTP' },
      { duration: 8, target_pct: 0.50, label: 'Spinning cooldown' }
    ]
  },
  {
    id: 'sweet_spot_long_2h',
    title: 'Sweet Spot Endurance (2h)',
    description: 'A long endurance block featuring two sustained 25-minute Sweet Spot efforts. Designed for riders building massive aerobic durability and event-specific muscular stamina.',
    category: 'Tempo/Sweet Spot',
    intensity: 'Medium',
    sport: 'Cycling',
    duration_minutes: 120,
    tss: 105,
    workout_steps: [
      { duration: 20, target_pct: 0.60, label: 'Gradual progressive warmup' },
      { duration: 25, target_pct: 0.88, label: 'Sweet Spot Block 1 @ 88% FTP' },
      { duration: 10, target_pct: 0.55, label: 'Active recovery spin' },
      { duration: 25, target_pct: 0.88, label: 'Sweet Spot Block 2 @ 88% FTP' },
      { duration: 40, target_pct: 0.62, label: 'Zone 2 endurance finish' }
    ]
  },
  {
    id: 'threshold_sustained_90',
    title: 'Threshold Foundation (1h30)',
    description: 'Three 15-minute Threshold intervals at 96% FTP. A rigorous session designed to lift your functional threshold power and improve your ability to sustain high-intensity efforts.',
    category: 'Threshold',
    intensity: 'Hard',
    sport: 'Cycling',
    duration_minutes: 90,
    tss: 85,
    workout_steps: [
      { duration: 15, target_pct: 0.60, label: 'Thorough warm-up with ramp' },
      { duration: 15, target_pct: 0.96, label: 'Threshold Interval 1 @ 96% FTP' },
      { duration: 5, target_pct: 0.55, label: 'Active recovery' },
      { duration: 15, target_pct: 0.96, label: 'Threshold Interval 2 @ 96% FTP' },
      { duration: 5, target_pct: 0.55, label: 'Active recovery' },
      { duration: 15, target_pct: 0.96, label: 'Threshold Interval 3 @ 96% FTP' },
      { duration: 20, target_pct: 0.52, label: 'Easy spinning cooldown' }
    ]
  },

  // --- THRESHOLD ---
  {
    id: 'threshold_over_under_3x9',
    title: 'Threshold Over-Unders (3x9m)',
    description: 'Three 9-minute blocks oscillating between 95% (under) and 105% (over) FTP. Scientifically proven to train the body to actively buffer and clear lactate under systemic load.',
    category: 'Threshold',
    intensity: 'Hard',
    sport: 'Cycling',
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
    id: 'threshold_classic_2x20',
    title: 'Threshold Ride (2x20m)',
    description: 'The absolute gold standard for muscular threshold conditioning. Develops outstanding physical stamina, high fractional utilization of VO2 max, and elite mental toughness.',
    category: 'Threshold',
    intensity: 'Hard',
    sport: 'Cycling',
    duration_minutes: 60,
    tss: 68,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Thorough warm-up with ramp' },
      { duration: 20, target_pct: 0.98, label: 'Sustained Threshold Rep 1 @ 98% FTP' },
      { duration: 5, target_pct: 0.55, label: 'Active recovery spin' },
      { duration: 20, target_pct: 0.98, label: 'Sustained Threshold Rep 2 @ 98% FTP' },
      { duration: 5, target_pct: 0.50, label: 'Spinning cooldown' }
    ]
  },

  // --- VO2 MAX ---
  {
    id: 'norwegian_4x4',
    title: 'VO2 Max Intervals (4x4m)',
    description: 'The legendary Helgerud & Hoff 4x4-minute protocol (110-112% FTP) with 3-minute active recoveries. Extensively proven in clinical studies to yield the largest VO2 max increases.',
    category: 'VO2 Max',
    intensity: 'Hard',
    sport: 'Cycling',
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
    id: 'billat_30_30',
    title: 'VO2 Max 30/30s',
    description: "Dr. Veronique Billat's classic 30s intervals. Maximizes cumulative time spent at VO2 max (aerobic capacity peak) while minimizing neuromuscular depletion via active recovery intervals.",
    category: 'VO2 Max',
    intensity: 'Hard',
    sport: 'Cycling',
    duration_minutes: 40,
    tss: 44,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Thorough warm-up with build' },
      // 15 repeats of 30s @ 130% / 30s @ 50%
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.30, label: 'Billat Interval @ 130% FTP' },
      { duration: 0.5, target_pct: 0.50, label: 'Spin recovery' },
      { duration: 15, target_pct: 0.45, label: 'Spinning cooldown' }
    ]
  },

  // --- ANAEROBIC ---
  {
    id: 'ronnestad_30_15',
    title: 'Anaerobic Intervals (30/15s)',
    description: 'Two sets of 10 microbursts (30s at 125% FTP / 15s at 45% FTP). Proven by Dr. Bent Rønnestad to stimulate greater mitochondrial signaling and power at VO2 max than traditional intervals.',
    category: 'Anaerobic',
    intensity: 'Hard',
    sport: 'Cycling',
    duration_minutes: 40,
    tss: 46,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Progressive warmup' },
      // Set 1 (10 reps of 30s/15s = 7.5 minutes)
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.1 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.2 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.3 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.4 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.5 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.6 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.7 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.8 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.9 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 1.10 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      
      { duration: 5, target_pct: 0.50, label: 'Mid-set active recovery' },
      
      // Set 2 (10 reps of 30s/15s = 7.5 minutes)
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.1 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.2 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.3 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.4 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.5 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.6 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.7 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.8 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.9 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      { duration: 0.5, target_pct: 1.25, label: 'Rønnestad Rep 2.10 @ 125% FTP' },
      { duration: 0.25, target_pct: 0.45, label: 'Spin recovery' },
      
      { duration: 7.5, target_pct: 0.45, label: 'Easy spinning cooldown' }
    ]
  },
  {
    id: 'anaerobic_capacity_6x1',
    title: 'Anaerobic Repeats (6x1m)',
    description: 'Six 1-minute anaerobic capacity repeats at 135% FTP with full 3-minute active recovery intervals. Forces profound cellular and neural adaptations in lactic/anaerobic reserves.',
    category: 'Anaerobic',
    intensity: 'Hard',
    sport: 'Cycling',
    duration_minutes: 40,
    tss: 52,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Thorough progressive warm-up' },
      { duration: 1, target_pct: 1.35, label: 'Anaerobic Repeat 1 @ 135% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Active spinning recovery' },
      { duration: 1, target_pct: 1.35, label: 'Anaerobic Repeat 2 @ 135% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Active spinning recovery' },
      { duration: 1, target_pct: 1.35, label: 'Anaerobic Repeat 3 @ 135% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Active spinning recovery' },
      { duration: 1, target_pct: 1.35, label: 'Anaerobic Repeat 4 @ 135% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Active spinning recovery' },
      { duration: 1, target_pct: 1.35, label: 'Anaerobic Repeat 5 @ 135% FTP' },
      { duration: 3, target_pct: 0.50, label: 'Active spinning recovery' },
      { duration: 1, target_pct: 1.35, label: 'Anaerobic Repeat 6 @ 135% FTP' },
      { duration: 9, target_pct: 0.45, label: 'Easy spinning cooldown' }
    ]
  },

  // --- RUNNING ---
  {
    id: 'base_run_45',
    title: 'Aerobic Base Run (45m)',
    description: 'Steady Zone 2 run to build aerobic capacity and joint durability.',
    category: 'Endurance',
    intensity: 'Easy',
    sport: 'Running',
    duration_minutes: 45,
    tss: 35,
    workout_steps: [
      { duration: 5, target_pct: 0.55, label: 'Easy walk/jog warmup' },
      { duration: 35, target_pct: 0.70, label: 'Steady Z2 run' },
      { duration: 5, target_pct: 0.50, label: 'Cool-down walk' }
    ]
  },
  {
    id: 'tempo_run_60',
    title: 'Tempo Run (1h)',
    description: 'Sustained effort at moderate-high intensity to lift lactate threshold.',
    category: 'Tempo/Sweet Spot',
    intensity: 'Medium',
    sport: 'Running',
    duration_minutes: 60,
    tss: 55,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Progressive warmup' },
      { duration: 40, target_pct: 0.85, label: 'Steady Tempo block' },
      { duration: 10, target_pct: 0.55, label: 'Easy recovery jog' }
    ]
  },
  {
    id: 'run_intervals_4x4',
    title: 'Run Intervals (4x4m)',
    description: 'VO2 max running repeats with active recovery.',
    category: 'VO2 Max',
    intensity: 'Hard',
    sport: 'Running',
    duration_minutes: 45,
    tss: 50,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Jogging warmup' },
      { duration: 4, target_pct: 1.10, label: 'Hard Interval 1' },
      { duration: 3, target_pct: 0.50, label: 'Walking recovery' },
      { duration: 4, target_pct: 1.10, label: 'Hard Interval 2' },
      { duration: 3, target_pct: 0.50, label: 'Walking recovery' },
      { duration: 4, target_pct: 1.10, label: 'Hard Interval 3' },
      { duration: 3, target_pct: 0.50, label: 'Walking recovery' },
      { duration: 4, target_pct: 1.10, label: 'Hard Interval 4' },
      { duration: 10, target_pct: 0.50, label: 'Cool-down jog' }
    ]
  },

  // --- SWIMMING ---
  {
    id: 'swim_endurance_1500',
    title: 'Endurance Swim (1500m)',
    description: 'Continuous aerobic swimming focused on technique and breath control.',
    category: 'Endurance',
    intensity: 'Medium',
    sport: 'Swimming',
    duration_minutes: 40,
    tss: 30,
    workout_steps: [
      { duration: 10, target_pct: 0.60, label: 'Warmup mix (swim/drill)' },
      { duration: 25, target_pct: 0.75, label: 'Main set: Steady aerobic' },
      { duration: 5, target_pct: 0.50, label: 'Cool-down easy' }
    ]
  },
  {
    id: 'swim_sprints_10x50',
    title: 'Swim Sprints (10x50m)',
    description: 'High-intensity swim repeats with generous rest.',
    category: 'Anaerobic',
    intensity: 'Hard',
    sport: 'Swimming',
    duration_minutes: 30,
    tss: 35,
    workout_steps: [
      { duration: 5, target_pct: 0.60, label: 'Warmup' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 1 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 2 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 3 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 4 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 5 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 6 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 7 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 8 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 9 (50m)' },
      { duration: 1, target_pct: 0.40, label: 'Rest' },
      { duration: 1, target_pct: 1.30, label: 'Sprint 10 (50m)' },
      { duration: 5, target_pct: 0.50, label: 'Cool-down' }
    ]
  }
];

export const matchWorkoutToLibrary = (focus: string, duration: number, intensity: string): LibraryWorkout | null => {
  const normalizedFocus = (focus || '').toLowerCase();
  const normalizedIntensity = (intensity || '').toLowerCase();

  if (normalizedIntensity === 'rest' || normalizedFocus.includes('rest') || normalizedFocus.includes('off')) {
    return null;
  }

  // Determine sport from focus
  let targetSport: LibraryWorkout['sport'] = 'Cycling';
  if (normalizedFocus.includes('run') || normalizedFocus.includes('jog') || normalizedFocus.includes('brick')) {
    targetSport = 'Running';
  } else if (normalizedFocus.includes('swim') || normalizedFocus.includes('pool') || normalizedFocus.includes('lap')) {
    targetSport = 'Swimming';
  }

  // Check if focus has an explicit duration pattern like (60m), (90m), (120m), etc.
  const minuteMatch = normalizedFocus.match(/\((\d+)\s*m\)/i);
  let effectiveDuration = duration;
  if (minuteMatch) {
    effectiveDuration = parseInt(minuteMatch[1], 10);
  } else if (duration > 0 && duration <= 6) {
    // LLM outputted duration in hours (e.g. 1.5, 2, 4) -> convert to minutes
    effectiveDuration = Math.round(duration * 60);
  } else if (!duration || duration <= 0) {
    effectiveDuration = 60;
  }

  // Filter library by sport first
  let candidates = WORKOUT_LIBRARY.filter(w => w.sport === targetSport);

  // Filter library by closest category
  let candidateCategory: LibraryWorkout['category'][] = [];
  if (normalizedFocus.includes('vo2') || normalizedFocus.includes('aerobic capacity') || normalizedFocus.includes('norwegian')) {
    candidateCategory = ['VO2 Max'];
  } else if (normalizedFocus.includes('sprint') || normalizedFocus.includes('anaerobic') || normalizedFocus.includes('burst') || normalizedFocus.includes('micro') || normalizedFocus.includes('ronnestad')) {
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
  let filteredCandidates = candidates.filter(w => candidateCategory.includes(w.category));
  if (filteredCandidates.length === 0) {
    if (normalizedIntensity === 'hard') {
      filteredCandidates = candidates.filter(w => ['Threshold', 'VO2 Max', 'Anaerobic'].includes(w.category));
    } else if (normalizedIntensity === 'medium') {
      filteredCandidates = candidates.filter(w => ['Tempo/Sweet Spot', 'Threshold'].includes(w.category));
    } else {
      filteredCandidates = candidates.filter(w => ['Recovery', 'Endurance'].includes(w.category));
    }
  }

  if (filteredCandidates.length === 0) {
    filteredCandidates = candidates;
  }

  if (filteredCandidates.length === 0) return null;

  // Select the candidate with the closest duration
  const bestMatch = filteredCandidates.reduce((best, cur) => {
    const bestDiff = Math.abs(best.duration_minutes - effectiveDuration);
    const curDiff = Math.abs(cur.duration_minutes - effectiveDuration);
    return curDiff < bestDiff ? cur : best;
  }, filteredCandidates[0]);

  // If the duration difference is too large (e.g. > 25%), avoid forcing a library match 
  // to prevent unrealistic scaling of core interval structures.
  const durationDiffPct = Math.abs(bestMatch.duration_minutes - effectiveDuration) / (bestMatch.duration_minutes || 60);
  if (durationDiffPct > 0.25) {
    return null;
  }

  return bestMatch;
};
