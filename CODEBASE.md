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
7. [Overzicht van de Datastroom](#7-overzicht-van-de-datastroom)

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
- **Cloud & Auth**: Firebase Auth (Google Sign-In) & Cloud Firestore

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
├── wrangler.toml                    # Cloudflare Pages / Workers deployment config
├── service-worker.js                # Offline caching & service worker (root)
├── components/                      # Herbruikbare React UI componenten
├── services/                        # Business logic, API calls, prompts, workout library & Firebase
└── public/                          # Statische bestanden (logo, icons, manifests, service worker)
```

---

## 2. Hoofdbestanden & Applicatie-entrees

### `/App.tsx`
* **Doel**: Het centrale zenuwstelsel en hoofdscherm van de gehele applicatie.
* **Functionaliteit**:
  * **State Management**: Beheert globale state zoals ritten (`activities`), hersteldata (`wellness`), vermogenscurves (`powerCurves`), atletenprofiel, actieve AI-suggesties, 4-weken trainingsplan en chatgeschiedenis.
  * **Authenticatie & Cloud Sync**: Integreert met Firebase Auth voor Google login en synchroniseert trainingsdoelen, methodologie, FTP, chatgeschiedenis en planning automatisch met Cloud Firestore. Ondersteunt tevens gastmodus via `localStorage`.
  * **Tijdlijn & Feed**: Toont de centrale tijdlijn met eerdere ritten, de aanbevolen rit van vandaag en de 4-weken periodiseringskalender met toekomstige trainingen.
  * **Tabs & Navigatie**: Wisselt tussen Dashboard (Ritten & Planning), Power Analytics (vermogenscurve & aerobe ontkoppeling), AI Coach Chat en Instellingen/Profiel.
  * **Modal Beheer**: Opent en sluit detailmodals voor ritten (`CoachingModal`), plan- en beschikbaarheidsaanpassingen (`PlanAndChangeModal`), workout bibliotheek (`WorkoutLibrary`), changelog (`ChangelogModal`) en authenticatie (`FirebaseAuthCard`).
  * **FTP & Profiel Calculatie**: Berekent vermogenszones, acute belasting (ATL), chronische fitheid (CTL) en trainingsvorm (TSB).

### `/index.tsx`
* **Doel**: Het officiële opstartpunt van de React-applicatie.
* **Functionaliteit**:
  * Zoekt het HTML-element met `id="root"`.
  * Initialiseert `ReactDOM.createRoot`.
  * Mount de `<App />` component binnen `React.StrictMode`.

### `/index.html`
* **Doel**: De HTML-sjabloon die door de browser wordt geladen.
* **Functionaliteit**:
  * Definieert meta tags voor mobiele weergave, viewport, PWA statusbar en thema-kleuren (`#05070a`).
  * Importeert Google Fonts (`Inter`, `Space Grotesk`, `JetBrains Mono`).
  * Laadt Tailwind CSS via CDN en configureert de custom kleurenpaletten, glassmorphism klassen (`.glass-card`), achtergrondverlopen en animaties.
  * Bevat een importmap voor ESM modules (React, Google GenAI, Lucide, Recharts).
  * Koppelt naar `/manifest.json` en bindt `/index.tsx`.

---

## 3. Configuratie & Build Bestanden

### `/package.json`
* **Doel**: Beheert de projectmetadata, npm scripts en externe bibliotheken.
* **Belangrijke scripts**:
  * `npm run dev`: Start de lokale ontwikkelserver via Vite op poort 3000.
  * `npm run build`: Compileert de TypeScript-code en bundelt de assets via Vite naar `/dist`.
  * `npm run lint`: Valideert de codebase op TypeScript fouten (`tsc --noEmit`).
  * `npm run preview`: Test de gebouwde productie-distributie lokaal.
* **Hoofdafhankelijkheden**: `@google/genai`, `firebase`, `lucide-react`, `motion`, `react`, `react-dom`, `recharts`.

### `/package-lock.json` & `/bun.lock`
* **Doel**: Vergrendelingsbestanden die de exacte versies van alle geïnstalleerde npm dependencies vastleggen voor reproduceerbare builds.

### `/tsconfig.json`
* **Doel**: Configuratiebestand voor de TypeScript compiler met strikte typecontrole (`strict: true`, `noImplicitAny`).

### `/vite.config.ts`
* **Doel**: Configuratie van de Vite build tool en development server op host `0.0.0.0` en poort `3000`.

### `/vite-env.d.ts`
* **Doel**: TypeScript declaratiebestand voor Vite client environment types (`import.meta.env`).

### `/metadata.json`
* **Doel**: Platformconfiguratie voor de Google AI Studio omgeving inclusief benodigde capabilities.

### `/wrangler.toml`
* **Doel**: Configuratiebestand voor Cloudflare Pages / Workers hosting.

### `/firestore.rules` & `/firebase-blueprint.json` & `/firebase-applet-config.json`
* **Doel**: Firebase Firestore beveiligingsregels en configuratiebestand voor cloudopslag van gebruikersprofielen en trainingsdata.

---

## 4. Componenten (`/components`)

### `/components/ActivityCard.tsx`
* **Doel**: Weergave van een voltooide rit of training in de activiteitentijdlijn.
* **Functionaliteit**:
  * Toont datum, dag van de week, activiteitstype (wielrennen, virtual ride, hardlopen).
  * Berekent en toont duur, afstand, Normalized Power / gemiddeld wattage, hartslag en Training Stress Score (TSS).
  * Filtert ongeldige of lege sessies automatisch weg (<60 sec en <100m).
  * Klikken op de kaart opent de AI-analyse via `CoachingModal`.

### `/components/SuggestedWorkoutCard.tsx`
* **Doel**: Weergave van een door de AI aanbevolen workout of rustdag in de feed en tijdlijn.
* **Functionaliteit**:
  * Visualiseert geplande ritten met intensiteitsbadges (Herstel, Duur, Tempo, Threshold, VO2 Max).
  * Toont geplande duur, geschatte trainingsbelasting (TSS) en de fysiologische focus.
  * Formatteert titels netjes en stript redundante haakjes-notaties (zoals `(1h)`).
  * Ondersteunt compacte weergave en acties voor het uploaden van geplande ritten naar Intervals.icu.

### `/components/CoachingModal.tsx`
* **Doel**: Diepgaande AI-analyse en feedbackmodal voor een specifieke voltooide rit.
* **Functionaliteit**:
  * Haalt de exacte vermogensintervallen en de vooraf geplande workout van Intervals.icu op voor die datum.
  * Roept `getRideFeedback` in `geminiService.ts` aan om een gestructureerde coachingsevaluatie te genereren.
  * Toont executive summary, execution score (1–10), fysiologische adaptatie, verbeterpunten en intervalvergelijking.

### `/components/PlanAndChangeModal.tsx`
* **Doel**: Modal voor het configureren van de wekelijkse beschikbaarheid en vrije prompt-instructies ("directives").
* **Functionaliteit**:
  * Stelt beschikbare trainingsduur per dag in (bijv. Ma: Rest, Di: 60m, Za: 180m, Zo: 120m).
  * Voegt natuurlijke-taal instructies toe aan het trainingsplan (bijv. *"Meer VO2max blokken"* of *"Rustig tempo op donderdag"*).
  * Beheert en bewerkt actieve directives met automatische vervaldata.

### `/components/WorkoutLibrary.tsx`
* **Doel**: Een doorzoekbare bibliotheek met gestandaardiseerde fysiologische wielertrainingen.
* **Functionaliteit**:
  * Categoriseert trainingen in: Recovery, Endurance, Tempo/Sweet Spot, Threshold, VO2 Max en Anaerobic.
  * Schaling op basis van atleet-FTP: berekent direct de wattages voor elke stap op basis van het huidige FTP van de renner.
  * Biedt directe integratie om workouts toe te passen of te plannen in Intervals.icu.

### `/components/RiderPowerCurve.tsx`
* **Doel**: Analyse en visualisatie van de vermogenscurve (Power Duration Curve / MMP).
* **Functionaliteit**:
  * Vergelijkt piekvermogens over diverse tijdsvensters (1s, 5s, 30s, 1m, 5m, 20m, 60m).
  * Vergelijkt jaarlijkse data over meerdere seizoenen.
  * Bepaalt het rennerstype (Sprinter, Puncheur, Klimmer, Tijdrijder/Diesel).

### `/components/AerobicEfficiencyDecouplingChart.tsx`
* **Doel**: Aerobe fitheidsanalyse via Aerobic Efficiency (EF) en Pw:HR Decoupling.
* **Functionaliteit**:
  * Berekent de verhouding tussen Normalized Power en gemiddelde hartslag (EF = NP / Avg HR) voor duurtrainingen.
  * Visualiseert ontkoppeling (cardiac drift) over selecteerbare tijdvensters (8 tot 26 weken).
  * Filtert op Zone 2 duurtrainingen of alle ritten en toont een sessie-overzicht.

### `/components/StepLabel.tsx`
* **Doel**: Formattering, visualisatie en opschaling van individuele workout-stappen en intervallen.
* **Functionaliteit**:
  * `sanitizeStepLabel`: Verwijdert overbodige herhalingsteksten en formats.
  * `scaleLabelWatts`: Schaalt labels dynamisch mee met het actuele FTP van de atleet.
  * `VisualProfileChart`: Genereert een miniatuur barchart-profiel van het vermogensverloop van de workout.
  * `GroupedWorkoutStepsList`: Groepeert identieke herhalingen (bijv. 5x 3m VO2max) overzichtelijk in de UI.

### `/components/FirebaseAuthCard.tsx`
* **Doel**: Authenticatie- en synchronisatiekaart voor Firebase Google Sign-In.
* **Functionaliteit**:
  * Biedt 1-klik inloggen met Google.
  * Toont live status van Cloud Sync (synced, syncing, error, idle) en tijdstip van laatste synchronisatie.
  * Biedt compacte weergave voor headers en uitgebreide weergave voor het instellingenpaneel.

### `/components/ChangelogModal.tsx`
* **Doel**: Informatieve popup met versiegeschiedenis en recente app-verbeteringen.

---

## 5. Services & Datamodellen (`/services` & `/types.ts`)

### `/types.ts`
* **Doel**: Centrale definities van alle TypeScript interfaces en typen.
* **Inhoud**:
  * `Activity`, `ActivityInterval`: Gegevensstructuur van voltooide ritten.
  * `Wellness`: Slaap, rustpols, HRV, vermoeidheid, gewicht en fitheidsstatistieken.
  * `DailySuggestion`, `WeeklyBriefing`: Datastructuren voor dag- en 4-weken trainingsplannen.
  * `AnnualPowerCurve`, `PowerBest`: Datamodellen voor vermogensrecords.
  * `CoachingFeedback`, `UserProfileAnalysis`, `ThreeMonthReview`: Modellen voor AI-rapportages.
  * `IntervalsCredentials`: Authenticatie-object voor Intervals.icu communicatie.

### `/services/intervalsService.ts`
* **Doel**: Communicatielaag met de REST API van Intervals.icu.
* **Belangrijkste functies**:
  * `fetchAthleteId`, `fetchAthleteProfile`: Valideert inloggegevens en haalt gewicht, rusthartslag en actueel FTP op.
  * `fetchActivities`: Haalt historische ritactiviteiten op binnen een instelbaar datumbereik.
  * `fetchActivityIntervals`: Vraagt gedetailleerde lap/interval-segmenten op van een rit.
  * `fetchWellness`: Verzamelt dagelijkse welzijnsdata (HRV, rusthartslag, training load).
  * `getAnnualPowerCurves`: Verzamelt de beste vermogenswaarden over de afgelopen jaren.
  * `uploadWorkout`: Schrijft een gepland trainingsschema via de API direct naar de kalender van de atleet.
  * `classifyActivityRide`: Automatische categorisatie van een rit (Herstel, Zone 2, Tempo, VO2max).

### `/services/geminiService.ts`
* **Doel**: Integratie met Google Gemini via de officiële `@google/genai` SDK.
* **Belangrijkste functies**:
  * `getDailySuggestion`: Genereert de workout-aanbeveling voor vandaag op basis van recente belasting en welzijn.
  * `getRideFeedback`: Analyseert een voltooide rit tegen de achtergrond van het trainingsdoel.
  * `getWeeklyBriefing`: Genereert en periodiseert het 4-weken schema.
  * `sendChatMessage`: Beheert het interactieve AI-coachgesprek inclusief injectie van historische trainingsdata en dynamische plandirectives.
  * `analyzeUserProfile`: Maakt een fysiologisch rennersprofiel (sterktes, verbeterpunten, rennerstype).
  * `analyzeThreeMonthReview`: Grondige driemaandelijkse trainingsreview met periodestatistieken.
  * `normalizeBriefingDays`: Valideert en normaliseert gegenereerde ritten tegen fysiologische regels en koppelt aan de bibliotheek.

### `/services/promptTemplates.ts`
* **Doel**: Het centrale register van alle prompts en fysiologische richtlijnen voor het taalmodel.
* **Functionaliteit**:
  * Bevat de strikte instructies voor JSON-output schema's.
  * Bepaalt coaching-wetten: geen onrealistische opeenvolgingen, maximale intervalduur bij VO2max, realistische weekduur.
  * Bevat modulaire richtlijnen voor hartslag- vs. vermogenstraining, triatlons en hardlopen.

### `/services/directiveService.ts`
* **Doel**: Verwerking en beheer van trainingsplandoelen en -aanpassingen ("directives").
* **Functionaliteit**:
  * `parsePlanDirectives`, `serializePlanDirectives`: Parset en serialiseert gebruikersinstructies.
  * `parseScheduleDurationsFromDirective`: Extraheert dag-specifieke duur- en rustrestricties.
  * `pruneExpiredDirectives`: Laat verlopen instructies automatisch vervallen op basis van datum.
  * `formatDirectivesForPrompt`: Formatteert actieve richtlijnen overzichtelijk voor de Gemini prompt.

### `/services/restRationaleService.ts`
* **Doel**: Genereert wetenschappelijk onderbouwde datagedreven toelichtingen voor geplande rustdagen.
* **Functionaliteit**:
  * Berekent acute vermoeidheid (ATL), chronische fitheid (CTL), vorm (TSB) en voorafgaande trainingsbelasting.
  * Geeft een gedetailleerde fysiologische verklaring waarom rust op een specifieke dag optimaal is.

### `/services/workoutLibrary.ts`
* **Doel**: Database met wetenschappelijk onderbouwde wielertrainingen en matching-algoritmen.
* **Functionaliteit**:
  * `WORKOUT_LIBRARY`: Catalogus met klassieke sessies (o.a. Sweet Spot, Norwegian 4x4, Over-Unders, Zone 2 Foundation).
  * `matchWorkoutToLibrary`: Matcht gegenereerde workouts met gestandaardiseerde sessies uit de catalogus.

### `/services/firebase.ts`
* **Doel**: Firebase initialisatie, authenticatie en Firestore synchronisatie.
* **Functionaliteit**:
  * Initialiseert Firebase Auth en Cloud Firestore met long-polling ondersteuning voor robuuste werking in browser-sandboxes.
  * `loginWithGoogle`, `logoutUser`: Google OAuth popup login en afmeldlogica.
  * `fetchUserCloudProfile`, `saveUserCloudProfile`: Ophalen en opslaan van atleetprofiel en voorkeuren in Firestore.
  * `subscribeUserCloudProfile`: Realtime listener voor cloudprofiel-updates.

---

## 6. Publieke Assets & PWA (`/public` & root)

### `/public/logo.png` & `/public/logo.svg`
* **Doel**: Visuele identiteit en iconen van waTTson voor header, favicon en PWA installatie op mobiel en desktop.

### `/manifest.json` & `/public/manifest.json`
* **Doel**: Web App Manifest specificatie voor fullscreen installatie (`"display": "standalone"`).

### `/service-worker.js` & `/public/service-worker.js`
* **Doel**: PWA Service Worker voor offline ondersteuning, caching van statische assets en netwerk-prioriteit voor live API-aanroepen.

### `/public/_redirects`
* **Doel**: SPA routing configuratie voor statische webhosts om alle paden naar `index.html` te leiden.

---

## 7. Overzicht van de Datastroom

```
[ Gebruiker opent waTTson ]
            │
            ▼
       index.html  ──(laadt)──►  index.tsx  ──(mount)──►  App.tsx
                                                               │
                     ┌────────────────────────────────────────┼────────────────────────────────────────┐
                     │                                        │                                        │
                     ▼                                        ▼                                        ▼
            intervalsService.ts                                geminiService.ts                        firebase.ts
                     │                                        │                                        │
    Haalt op:                                                 Raadpleegt:                              Synchroniseert:
    - Activiteiten (Ritten)                                   - promptTemplates.ts                     - Google Auth
    - Wellness & HRV                                          - workoutLibrary.ts                      - Cloud Profiel
    - Power Curves & Profiel                                  - directiveService.ts                    - Trainingsvoorkeuren
                     │                                        │                                        - Chatgeschiedenis
                     └────────────────────────────┬───────────┴────────────────────────────────────────┘
                                                  │
                                                  ▼
                                       State Update in App.tsx
                                                  │
                     ┌────────────────────────────┼────────────────────────────────────────┐
                     │                            │                                        │
                     ▼                            ▼                                        ▼
             ActivityCard.tsx           SuggestedWorkoutCard.tsx               RiderPowerCurve.tsx
            (Voltooide ritten)             (Aanbeveling vandaag)              (Vermogensanalyse grafiek)
                     │                            │                                        │
                     ▼                            ▼                                        ▼
             CoachingModal.tsx                 PlanAndChangeModal.tsx          AerobicEfficiencyDecouplingChart.tsx
          (AI Rit-analyse & Tips)           (Schema & Directives Aanpassing)      (EF & Decoupling trend)
```
