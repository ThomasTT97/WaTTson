# waTTson — Intelligent Cycling Coach Architecture & Documentation

waTTson is a high-performance, responsive Single Page Application (SPA) and Progressive Web App (PWA) built with **React**, **Vite**, and **TypeScript**, styled using **Tailwind CSS**, and powered by **Google Gemini** models via `@google/genai`. It integrates with **Intervals.icu** to analyze training history, physical load, power curves, and wellness trends, paired with **Firebase Authentication & Firestore** for cross-device cloud profile synchronization.

---

## 1. System Architecture Diagram

```
                                  +------------------------+
                                  |     User Browser       |
                                  |   (React 19 + Vite)    |
                                  +-----------+------------+
                                              |
                   +--------------------------+--------------------------+
                   |                          |                          |
                   v                          v                          v
      +------------+-----------+ +------------+-----------+ +------------+-----------+
      |   Intervals.icu API    | |   Google Gemini API     | |  Firebase Auth & Cloud    |
      |  (Athlete metrics,     | |  (Coaching intelligence | |  Firestore Database       |
      |   rides, wellness)     | |   via @google/genai)    | |  (User profiles & sync)   |
      +------------------------+ +------------------------+ +------------------------+
```

waTTson is designed as a **serverless client-centric architecture** running directly in the browser. It connects to Intervals.icu for athlete telemetry, Google Gemini for cycling intelligence and periodization, and Firebase for authentication and preferences persistence.

---

## 2. Key Modules & Directory Structure

*   `/App.tsx`: Main application coordinator, state manager, view router (Dashboard, Power & Decoupling Analytics, Coach Chat, Settings), and responsive timeline.
*   `/types.ts`: Strictly typed TypeScript declarations defining models for activities, intervals, wellness, daily/weekly suggestions, and API credentials.
*   `/services/`:
    *   `intervalsService.ts`: Standardized wrappers for fetching workouts, annual power curves, wellness stats, and uploading planned workouts to Intervals.icu.
    *   `geminiService.ts`: Core AI reasoning wrapper utilizing the `@google/genai` client with structured JSON outputs, model fallbacks, and multi-tier caching.
    *   `promptTemplates.ts`: **Centralized AI prompt registry** containing system instructions, physiological rules, periodization guidelines, and contextual schemas.
    *   `directiveService.ts`: Manages user directives and availability schedules, parsing constraints, checking expiration dates, and pruning stale prompts.
    *   `restRationaleService.ts`: Generates data-driven rest day rationales based on acute load (ATL), chronic fitness (CTL), form (TSB), and surrounding workout intensity.
    *   `workoutLibrary.ts`: Curated catalog of standard cycling workouts across intensity zones, with automatic FTP scaling and library matching.
    *   `firebase.ts`: Firebase Auth and Firestore integration with real-time profile listeners, offline support, and synchronization.
*   `/components/`:
    *   `ActivityCard.tsx`: Render component for completed physical rides, displaying power, HR, elevation, and intensity badges.
    *   `CoachingModal.tsx`: In-depth AI ride analysis modal breaking down goal contribution, execution score, physiological adaptations, and intervals comparison.
    *   `PlanAndChangeModal.tsx`: Modal interface for adjusting weekly schedules (day durations, rest days) and adding natural language directives.
    *   `RiderPowerCurve.tsx`: Power Duration Curve (MMP) multi-year comparison with phenotype identification (Sprinter, Puncheur, Climber, Time Trialist).
    *   `AerobicEfficiencyDecouplingChart.tsx`: Aerobic efficiency (EF = NP / HR) and cardiac drift decoupling (Pw:HR) regression analysis over configurable timeframes.
    *   `SuggestedWorkoutCard.tsx`: Compact and expanded views for AI-recommended workouts and rest days.
    *   `StepLabel.tsx`: Interval formatting, scaling, visual workout charts (`VisualProfileChart`), and minimalist repetition grouping (`GroupedWorkoutStepsList`).
    *   `WorkoutLibrary.tsx`: Searchable cycling workout catalog with FTP scaling and 1-click calendar sync.
    *   `FirebaseAuthCard.tsx`: Google Sign-In authentication card and cloud synchronization status monitor.
    *   `ChangelogModal.tsx`: Informative version changelog and release history modal.

---

## 3. Core Features & Data Flow

### 3.1. Daily Ride Analysis & Feedback (`CoachingModal`)
Every workout completed by the cyclist is cross-referenced with pre-planned intervals and user goals:
*   **Workflow**: When a ride is selected, the app fetches specific power/HR interval steps from Intervals.icu and passes them alongside the user's overarching goal to Gemini.
*   **Output**: Structured executive summary, execution score (1–10), physiological adaptations (mitochondrial density, lactate clearance, fat oxidation), actionable improvement tips, and planned vs. actual interval comparisons.

### 3.2. 4-Week Dynamic Periodization & Adaptive Planning
Provides an overview of 28 consecutive days mapped into 4 training phases:
*   **Phases**: Week 1 (Build & Adapt), Week 2 (Peak Progression), Week 3 (Target Taper), Week 4 (Recovery & Test).
*   **Adaptive Tweaks & Directives**: Users can input custom constraints (e.g., *"Wednesday max 45 mins"*, *"Add VO2max on Saturday"*). The directive engine validates and serializes these instructions, passing them to Gemini to adjust the plan while preserving history.
*   **Intervals.icu Calendar Sync**: Any planned workout can be uploaded directly to the athlete's external Intervals.icu calendar with one click.

### 3.3. Dual-Model Resilient Chat Interface
Interactive AI coach conversation engine:
*   **Contextual Telemetry**: Aggregates the athlete's 30-day load history, power duration bests, 14-day wellness metrics, and active schedule into the prompt.
*   **Actionable Directives**: When the athlete mentions schedule conflicts or fatigue in chat, the model can emit `[UPDATE_PLAN: ...]` directives that seamlessly update the 4-week training schedule.

### 3.4. Holistic Athlete Profile Analysis & 3-Month Reviews
*   **Phenotype & Strengths**: Evaluates historical power curves and volume to determine rider profile (e.g., "Endurance Diesel", "Puncheur") and physiological strengths/weaknesses.
*   **Quarterly Review**: 90-day training review assessing volume, consistency, load progression, and goal alignment.

### 3.5. Aerobic Efficiency (EF) & Decoupling (Pw:HR) Analysis
*   Calculates Efficiency Factor ($EF = \text{Normalized Power} / \text{Average Heart Rate}$) for aerobic workouts.
*   Tracks cardiac drift and aerobic decoupling over 8 to 26 weeks to monitor aerobic base development.

---

## 4. UI/UX Paradigm & Styling

waTTson is engineered with a **Cosmic Sleek Theme** designed for athletes and coaches who demand elite data readability and modern aesthetics:
1.  **Immersive Dark Canvas**: Utilizes `#05070a` backing paired with subtle slate overlays (`rgba(20, 25, 35, 0.6)`), preventing screen glare during early morning or late night planning.
2.  **Generous Layout Rhythm**: Clean information hierarchy with minimum 44px touch targets on mobile and clear hover interactions on desktop.
3.  **Unified Micro-Animations**: Smooth sliding transitions and entry animations powered by `motion` (`motion/react`).
4.  **Zero-Telemetry Noise**: No simulated terminal logs or mock telemetry; text labels and metrics are strictly athlete-focused.
