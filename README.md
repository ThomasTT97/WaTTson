# waTTson — Intelligent AI Cycling & Endurance Coach

**waTTson** is a full-stack web application and Progressive Web App (PWA) that integrates with **Intervals.icu** and **Strava** to analyze training load, power curves, and recovery trends, delivering personalized daily coaching, post-ride analyses, and adaptive 4-week training plans powered by the **Google Gemini API**.

---

## Key Features

- **Telemetry & Platform Sync (Intervals.icu / Strava)**
  - Fetches historical activities, interval laps, wellness metrics (`CTL`, `ATL`, `TSB`, resting HR, HRV), and annual Mean Maximal Power (MMP) curves.
  - One-click push of structured planned workouts directly to your Intervals.icu calendar.
- **Adaptive 4-Week Training Plans & Availability Harmonization**
  - Supports **Polarized**, **Pyramidal**, and **Norwegian** training methodologies across **Cycling**, **Triathlon**, and **Running** modes (Power or Heart Rate targets).
  - Interactive weekly availability editor (`PlanAndChangeModal`) with deterministic harmonization that keeps rest days, exact session durations, and FTP-scaled workout steps 100% aligned across the feed, local storage, and cloud sync.
- **Post-Ride Coaching & Performance Analytics**
  - Detailed interval-level ride breakdowns comparing execution against targets (`CoachingModal`).
  - Interactive charts for **Rider Power Curves** (`RiderPowerCurve`) and **Aerobic Efficiency & Pw:HR Decoupling** (`AerobicEfficiencyDecouplingChart`).
  - Built-in curated **Workout Library** with physiology-focused sessions.
- **Context-Aware AI Coach Chat**
  - Streaming conversational coach (`ChatWindow`) enriched with 30-day load history, wellness trends, and upcoming planned sessions.
  - Supports live natural-language schedule directives that automatically update the active training plan.
- **Cross-Device Cloud Sync & Offline PWA Support**
  - **Firebase Authentication** and **Cloud Firestore** synchronize athlete goals, settings, chat history, and weekly plans across devices.
  - Installable PWA with service-worker caching.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Motion (`motion/react`), Lucide React, Recharts |
| **Backend / Proxy** | Node.js, Express 5 (`server.ts`), Helmet, `express-rate-limit`, Cloudflare Pages Functions (`/functions/api/*`) |
| **AI & Prompting** | Google Gemini API (`@google/genai`) with structured JSON outputs, streaming, and model fallbacks |
| **Database & Auth** | Firebase Authentication, Cloud Firestore (`firestore.rules`, `firebase-blueprint.json`) |
| **Integrations** | Intervals.icu REST API, Strava OAuth & API |

---

## Project Structure

```text
├── App.tsx                         # Main application coordinator, state management & timeline feed
├── server.ts                       # Express full-stack server, Vite dev middleware & secure API proxies
├── types.ts                        # Shared TypeScript interfaces (activities, wellness, briefings)
├── components/                     # UI modules (CoachingModal, PlanAndChangeModal, ChatWindow, Charts, etc.)
├── services/
│   ├── directiveService.ts         # Natural-language directives & deterministic availability harmonization
│   ├── firebase.ts                 # Firebase Auth & Cloud Firestore profile synchronization
│   ├── geminiService.ts            # Gemini client orchestration, caching & workout normalization
│   ├── intervalsService.ts         # Intervals.icu API client & workout upload logic
│   ├── promptTemplates.ts          # Centralized AI system prompts & structured instructions
│   ├── restRationaleService.ts     # Data-driven physiological rest-day explanations
│   ├── stravaService.ts            # Strava OAuth & activity mapping
│   └── workoutLibrary.ts           # Curated library of structured training sessions
├── functions/api/                  # Cloudflare Pages serverless proxy endpoints
├── firestore.rules                 # Cloud Firestore security rules
├── firebase-blueprint.json         # Firestore data model specification
├── ARCHITECTURE.md                 # High-level system architecture documentation
├── CODEBASE.md                     # Detailed module-by-module documentation (NL)
└── security_spec.md                # Security architecture & hardening notes
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (or **Bun**)
- A **Google Gemini API key**
- An **Intervals.icu** account / API key (or Strava credentials)
- A **Firebase** project (configured via `firebase-applet-config.json`)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` or `.env.local` file in the root directory (never commit secrets):

```env
GEMINI_API_KEY=your_gemini_api_key
PORT=3000

# Optional OAuth configuration
APP_URL=http://localhost:3000
STRAVA_CLIENT_ID=your_strava_client_id
INTERVALS_CLIENT_ID=your_intervals_client_id
```

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express server with Vite middleware on port `3000` (`tsx server.ts`) |
| `npm run build` | Type-checks with TypeScript and builds the production bundle into `dist/` |
| `npm start` | Runs the production Node.js server (`node server.ts`) serving `dist/` and `/api/*` |
| `npm run lint` | Runs `tsc --noEmit` to validate TypeScript types across the codebase |
| `npm run preview` | Previews the built Vite bundle locally |

---

## Architecture & Security Highlights

- **Server-Side API Proxy:** All Gemini API requests (`/api/gemini/generate`, `/api/gemini/stream`) and Intervals.icu proxy calls (`/api/intervals-proxy`) route through Express (`server.ts`) or Cloudflare Pages Functions (`/functions/api/*`) so API credentials remain protected server-side.
- **Rate Limiting & Headers:** Protected with `helmet` security headers, 2 MB JSON payload limits, and separate rate limiters for AI generations and external proxy traffic.
- **Deterministic Post-Processing:** AI-generated weekly briefings are validated and harmonized client-side (`harmonizeBriefingWithAvailability`) so calendar dates, rest days, and session durations remain consistent regardless of model variance or remote snapshot updates.

---

## Additional Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System architecture overview and core coaching workflows
- [`CODEBASE.md`](./CODEBASE.md) — Complete file-by-file documentation
- [`security_spec.md`](./security_spec.md) — Security controls and proxy specifications
