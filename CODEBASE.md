# waTTson — Codebase Bestandsdocumentatie

Dit document biedt een gedetailleerd overzicht en een functionele uitleg van **elk bestand** in de waTTson codebase.

---

## Inhoudsopgave
1. [Algemene Architectuur & Mappenstructuur](#1-algemene-architectuur--mappenstructuur)
2. [Hoofdbestanden & Applicatie-entrees](#2-hoofdbestanden--applicatie-entrees)
3. [Configuratie & Build Bestanden](#3-configuratie--build-bestanden)
4. [Componenten (`/components`)](#4-componenten-components)
5. [Services & Datamodellen (`/services` & `/types.ts`)](#5-services--datamodellen-services--typests)
6. [Publieke Assets & PWA (`/public` & root)](#6-publieke-assets--pwa-public--root)
7. [Hulpscripts & Debug Artifacts](#7-hulpscripts--debug-artifacts)
8. [Overzicht van de Datastroom](#8-overzicht-van-de-datastroom)

---

## 1. Algemene Architectuur & Mappenstructuur

waTTson is een **client-side Single Page Application (SPA)** en **Progressive Web App (PWA)** gebouwd met:
- **Framework**: React 19 + TypeScript
- **Bundler & Dev Server**: Vite
- **Styling**: Tailwind CSS met custom dark/cosmic thema
- **Visualisaties**: Recharts (grafieken en power curves)
- **Animaties & Iconen**: Motion (`motion/react`) en Lucide React
- **AI Integratie**: Google Gemini API via `@google/genai`
- **Data Integratie**: Intervals.icu REST API

```
├── ARCHITECTURE.md                  # Algemene architectuurbeschrijving
├── CODEBASE.md                      # Uitgebreide documentatie van alle bestanden (dit bestand)
├── App.tsx                          # Hoofdapplicatie, router & state management
├── index.html                       # HTML5 template, imports & PWA meta tags
├── index.tsx                        # React DOM mounting entry point
├── types.ts                         # Globale TypeScript types en datamodellen
├── vite.config.ts                   # Vite configuratie
├── tsconfig.json                    # TypeScript compilerconfiguratie
├── package.json / package-lock.json # Project dependencies en scripts
├── metadata.json                    # AI Studio platform metadata
├── wrangler.json                    # Cloudflare Pages / Workers deployment config
├── service-worker.js                # Offline caching & service worker (root)
├── components/                      # Herbruikbare React UI componenten
├── services/                        # Business logic, API calls, prompts & workout library
└── public/                          # Statische bestanden (logo, icons, manifests)
```

---

## 2. Hoofdbestanden & Applicatie-entrees

### `/App.tsx`
* **Doel**: Het centrale zenuwstelsel en hoofdscherm van de gehele applicatie.
* **Functionaliteit**:
  * **State Management**: Beheert globale state zoals ritten (`activities`), hersteldata (`wellness`), vermogenscurves (`powerCurves`), atletenprofiel, actieve AI-suggesties en chatgeschiedenis.
  * **Authenticatie & Sleutelbeheer**: Vraagt bij eerste gebruik naar de Intervals.icu API Key en Athlete ID, slaat deze veilig op in `localStorage` en valideert de verbinding.
  * **Tijdlijn & Feed**: Toont de centrale tijdlijn met eerdere ritten, de geplande/aanbevolen rit van vandaag en de 4-weken kalender met toekomstige trainingen.
  * **Tabs & Navigatie**: Wisselt tussen Dashboard (Ritten & Planning), Power Analytics (vermogenscurve & aerobe ontkoppeling), AI Coach Chat en Instellingen/Profiel.
  * **Modal Beheer**: Opent en sluit detailmodals voor ritten (`CoachingModal`), weekplanning (`WeeklyBriefingModal`), workout bibliotheek (`WorkoutLibrary`) en changelog (`ChangelogModal`).
  * **FTP & Profiel Calculatie**: Berekent vermogenszones, TSS en fitheidstrends (CTL, ATL, TSB).
  * **Foutafhandeling**: Bevat robuuste logging voor chat- en API-fouten in de console.

### `/index.tsx`
* **Doel**: Het officiële opstartpunt van de React-applicatie.

### `/index.html`
* **Doel**: De HTML-sjabloon die door de browser wordt geladen.

---

## 3. Configuratie & Build Bestanden

### `/package.json`
* **Doel**: Beheert de projectmetadata, npm scripts en externe bibliotheken.
* **Hoofdafhankelijkheden**: `@google/genai`, `lucide-react`, `motion`, `react`, `react-dom`, `recharts`, `firebase`.

### `/package-lock.json`
* **Doel**: Vergrendelingsbestand dat de exacte versies van alle geïnstalleerde npm dependencies vastlegt.

### `/tsconfig.json`
* **Doel**: Configuratiebestand voor de TypeScript compiler.

### `/vite.config.ts`
* **Doel**: Configuratie van de Vite build tool en development server.

### `/metadata.json`
* **Doel**: Platformconfiguratie voor de Google AI Studio / Cloud Run omgeving.

### `/wrangler.json`
* **Doel**: Configuratiebestand voor Cloudflare Workers / Cloudflare Pages.

### `/ARCHITECTURE.md`
* **Doel**: Hoogwaardig overzicht van het systeemontwerp.

---

## 4. Componenten (`/components`)

### `/components/ActivityCard.tsx`
* **Doel**: Weergave van een voltooide rit of training in de activiteitentijdlijn.

### `/components/SuggestedWorkoutCard.tsx`
* **Doel**: Weergave van een door de AI aanbevolen workout in de feed.

### `/components/CoachingModal.tsx`
* **Doel**: Diepgaande AI-analyse en feedbackmodal voor een specifieke voltooide rit.

### `/components/WeeklyBriefingModal.tsx`
* **Doel**: De 4-weken periodiseringskalender en het dynamische trainingsschema.

### `/components/WorkoutLibrary.tsx`
* **Doel**: Een doorzoekbare bibliotheek met gestandaardiseerde fysiologische wielertrainingen.

### `/components/RiderPowerCurve.tsx`
* **Doel**: Analyse en visualisatie van de vermogenscurve (Power Duration Curve / MMP).

### `/components/AerobicEfficiencyDecouplingChart.tsx`
* **Doel**: Geavanceerde aerobe fitheidsanalyse via Aerobic Efficiency (EF) en Pw:HR Decoupling.

### `/components/StepLabel.tsx`
* **Doel**: Formattering, visualisatie en opschaling van individuele workout-stappen en intervallen.

### `/components/ChangelogModal.tsx`
* **Doel**: Informatieve popup met versiegeschiedenis en nieuwe functies.

### `/components/FirebaseAuthCard.tsx`
* **Doel**: Beheert authenticatie en cloud sync status.

---

## 5. Services & Datamodellen (`/services` & `/types.ts`)

### `/types.ts`
* **Doel**: Centrale definities van alle TypeScript interfaces en typen.

### `/services/intervalsService.ts`
* **Doel**: Communicatielaag met de REST API van Intervals.icu.

### `/services/firebase.ts`
* **Doel**: Beheert Firebase-integratie voor authenticatie en cloud-datapersistentie.
* **Functionaliteit**:
  * Initialiseert Firestore en Auth.
  * Biedt functies voor het opslaan en ophalen van gebruikersprofielen en gesynchroniseerde chatgeschiedenis.
  * Bevat real-time listeners voor cross-device synchronisatie van instellingen.

### `/services/geminiService.ts`
* **Doel**: Integratie met het Google Gemini taalmodel via de officiële `@google/genai` SDK.

### `/services/promptTemplates.ts`
* **Doel**: Het centrale register van alle prompts en fysiologische richtlijnen voor het LLM.

### `/services/directiveService.ts`
* **Doel**: Verwerking en beheer van trainingsplandoelen en -aanpassingen ("directives").

### `/services/workoutLibrary.ts`
* **Doel**: Statische database met wetenschappelijk onderbouwde wielertrainingen en matching-algoritmen.

---

## 6. Publieke Assets & PWA (`/public` & root)

### `/public/logo.png` & `/public/logo.svg`
* **Doel**: De visuele identiteit en iconen van waTTson.

### `/manifest.json` & `/public/manifest.json`
* **Doel**: Web App Manifest specificatie.

### `/service-worker.js` & `/public/service-worker.js`
* **Doel**: De PWA Service Worker voor offline ondersteuning en asset caching.

### `/public/_redirects`
* **Doel**: SPA routing configuratie voor statische webhosts (zoals Netlify of Cloudflare Pages).

---

## 7. Hulpscripts & Debug Artifacts

* **`/patch.cjs`, `/patch2.cjs`, `/patch3.cjs`, `/patch4.cjs`**: Eenmalige migratiescripts en debug-uitvoerbestanden gebruikt tijdens eerdere refactors.
* **`/expected.txt` & `/target_debug.txt`**: Tijdelijke logbestanden gegenereerd door de patch scripts tijdens het zoeken en vervangen van codefragmenten.

---

## 8. Overzicht van de Datastroom

```
[ Gebruiker opent waTTson ]
            │
            ▼
       index.html  ──(laadt)──►  index.tsx  ──(mount)──►  App.tsx
                                                              │
                     ┌────────────────────────────────────────┴────────────────────────────────────────┐
                     │                                                                                 │
                     ▼                                                                                 ▼
           intervalsService.ts                                                                  geminiService.ts
                     │                                                                                 │
   Haalt op:                                                                            Raadpleegt:
   - Activiteiten (Ritten)                                                              - promptTemplates.ts
   - Wellness & HRV                                                                     - workoutLibrary.ts
   - Power Curves & Profiel                                                             - directiveService.ts
                     │                                                                                 │
                     └────────────────────────────┬────────────────────────────────────────────────────┘
                                                  │
                                                  ▼
                                       State Update in App.tsx
                                                  │
                     ┌────────────────────────────┼────────────────────────────────────────┐
                     │                            │                                        │
                     ▼                            ▼                                        ▼
             ActivityCard.tsx           SuggestedWorkoutCard.tsx               RiderPowerCurve.tsx
            (Voltooide ritten)             (Aanbeveling vandaag)              (Vermogensanalyse grafiek)
                     │                            │
                     ▼                            ▼
             CoachingModal.tsx                 WeeklyBriefingModal.tsx
          (AI Rit-analyse & Tips)           (4-Weken Plan & Intervals Sync)
```

Met deze opzet zijn alle verantwoordelijkheden strikt gescheiden: UI-weergave bevindt zich in `/components`, externe dataverwerking in `/services`, types in `/types.ts` en de orchestratie in `/App.tsx`.
