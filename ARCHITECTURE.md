# waTTson — Intelligent Cycling Coach Architecture & Documentation

waTTson is a high-performance, responsive Single Page Application (SPA) built with **React**, **Vite**, and **TypeScript**, styled using **Tailwind CSS**, and powered by the **Gemini 3.5 Flash** model. It integrates seamlessly with the **Intervals.icu** platform to analyze training history, physical load, power curves, and wellness trends to generate expert-level training plans and ride analytics.

---

## 1. System Architecture Diagram

```
                             +------------------------+
                             |     User Browser       |
                             +-----------+------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
          +------------+-----------+          +------------+-----------+
          |   Intervals.icu API     |          |  Google Gemini API     |
          |  (Athlete metrics,     |          |  (Coaching model via   |
          |   rides, wellness)     |          |   @google/genai SDK)   |
          +------------------------+          +------------------------+
```

waTTson is designed as a **serverless client-centric full-stack architecture** running directly in the browser. It securely connects to both the Intervals.icu API and the Gemini API (using platform-managed secure environment credentials during build/run).

---

## 2. Key Modules & Directory Structure

*   `/App.tsx`: Main application coordinator, state manager, and tab router (Dashboard, Rides, Coach Chat, Settings).
*   `/types.ts`: Strictly typed TypeScript declarations defining models for activities, intervals, wellness, daily/weekly suggestions, and API credentials.
*   `/services/`:
    *   `intervalsService.ts`: Standardized wrappers for fetching workouts, annual power curves, wellness stats, and uploading planned workouts.
    *   `firebase.ts`: Handles authentication, cloud profile persistence, and data synchronization across devices.
    *   `geminiService.ts`: Core wrapper utilizing the `@google/genai` client, complete with model fallbacks and state cache managers.
    *   `promptTemplates.ts`: **Centralized AI prompt registry** containing all system instructions, formatting parameters, and contextual wrappers passed to Gemini models.
*   `/components/`:
    *   `ActivityCard.tsx`: Render component for detailed physical rides.
    *   `WeeklyBriefingModal.tsx`: Comprehensive sliding interface housing the scrollable 4-week calendar and the live AI plan adaptation.
    *   `CoachingModal.tsx`: Detailed modal with a custom loading state, metric comparison charts, and specialized ride summaries.
    *   `FirebaseAuthCard.tsx`: Authentication and cloud sync status management interface.

---

## 3. Core Features

### 3.1. Daily Ride Analysis & Feedback (`CoachingModal`)
Every single workout completed by the cyclist is cross-referenced with any pre-planned intervals. 
*   **How it works**: When a ride is clicked, the app requests the specific power/HR interval steps from Intervals.icu and passes them alongside the user's overarching goal to the Gemini model.
*   **Result**: The user receives a sharp coaching breakdown summarizing the purpose of the session and how it contributes directly to their training goal.

### 3.2. 4-Week Dynamic Trainings Plan (`WeeklyBriefingModal`)
Provides an outlook of exactly 28 days mapped out sequentially.
*   **Weekly Phases**:
    *   *Week 1*: Build & Adapt
    *   *Week 2*: Peak Progression
    *   *Week 3*: Target Taper
    *   *Week 4*: Recovery & Test
*   **Adaptive Prompt Modification**: Prominently displayed at the top of the plan interface, users can type natural language instructions (e.g., *"taper for an event next Sunday"* or *"add more VO2max work"*). The model adapts the entire calendar instantly, preserving previous context through a structured directive stack.
*   **Intervals.icu Calendar Sync**: Any specific suggested workout step (targets, durations, zones) can be pushed directly to the athlete's real Intervals.icu calendar with a single click.

### 3.3. Dual-Model Resilient Chat Interface
A real-time coaching discussion board.
*   **Telemetry Sync**: The chat system doesn't just pass standard text. It aggregates the athlete's last 30 days of load history, annual power curves, and 14-day wellness metrics directly into the system prompt.
*   **Intelligent Directives**: If a user chats, *"I feel too tired for tomorrow's run"*, waTTson replies with coaching advice and appends a hidden `[UPDATE_PLAN: ...]` tag which automatically updates the underlying 4-week schedule builder, bridging chat directly with planning state.

### 3.4. Holistic Athlete Profile Analysis
Accessible from the settings tab, waTTson runs an in-depth analysis of the athlete's historical distribution.
*   **Results**: Generates custom categorizations (e.g., "Endurance Diesel"), highlights physiological strengths and improvements, and warns about training responses (e.g., ineffective methods like back-to-back high-intensity intervals).

### 3.5. Persistence & Authentication
Utilizes Firebase (Firestore and Auth) to ensure a seamless experience across multiple devices.
*   **Cloud Sync**: User goals, training preferences, chat history, and generated plans are persisted to the cloud, allowing for automatic state recovery on new devices or browsers.

---

## 4. UI/UX Paradigm & Styling

waTTson is engineered with a **Cosmic Sleek Theme** designed for athletes and coaches who demand elite data readability and modern aesthetics:
1.  **Immersive Dark Canvas**: Utilizes a deep `#05070a` backing paired with subtle slate overlays, preventing screen glare during early morning or late night planning.
2.  **Generous Layout Rhythm**: Generous negative space is utilized rather than cluttering cards together. Sizing targets are set at comfortable touch zones (minimum 44px on mobile, clear hover transitions on desktop).
3.  **Unified Micro-Animations**: Smooth sliding route transitions and entry animations are powered by `motion` (`motion/react`) for fluid screen changes.
4.  **No Status Indicator Clutter**: The layout avoids mock telemetry logs or fake terminal indicators. Text labels are strictly human-focused, ensuring clean, high-end credibility.
