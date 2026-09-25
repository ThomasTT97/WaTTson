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
* **Hoofdafhankelijkheden**: `@google/genai`, `lucide-react`, `motion`, `react`, `react-dom`, `recharts`.

### `/package-lock.json` & `/bun.lock`
* **Doel**: Vergrendelingsbestanden die de exacte versies van alle geïnstalleerde npm dependencies en hun sub-afhankelijkheden vastleggen om reproduceerbare builds te garanderen.

### `/tsconfig.json`
* **Doel**: Configuratiebestand voor de TypeScript compiler.
* **Functionaliteit**:
  * Stelt strikte type-checking in (`strict: true`, `noImplicitAny`).
  * Definieert JSX-verwerking (`"jsx": "react-jsx"`).
  * Configureert ES module resolutie (`ESNext`) voor compatibiliteit met Vite.

### `/vite.config.ts`
* **Doel**: Configuratie van de Vite build tool en development server.
* **Functionaliteit**:
  * Activeert de `@vitejs/plugin-react` plugin.
  * Configureert de ontwikkelserver om te luisteren op host `0.0.0.0` en poort `3000` (vereist voor de sandbox/container omgeving).
  * Regelt asset resolving en optimalisatie.

### `/vite-env.d.ts`
* **Doel**: TypeScript declaratiebestand voor Vite client environment types (`import.meta.env`).

### `/metadata.json`
* **Doel**: Platformconfiguratie voor de Google AI Studio / Cloud Run omgeving.
* **Inhoud**: Bevat de naam van de applicatie ("waTTson"), de omschrijving, frame permissies en de server-side Gemini capability vlag.

### `/wrangler.json`
* **Doel**: Configuratiebestand voor Cloudflare Workers / Cloudflare Pages.
* **Functionaliteit**:
  * Wijst naar de build output directory (`./dist`) voor statische hosting.
  * Schakelt Cloudflare observability in.

### `/ARCHITECTURE.md`
* **Doel**: Hoogwaardig overzicht van het systeemontwerp.
* **Inhoud**: Systeemdiagrammen, integratielagen (Intervals.icu & Gemini), UI/UX designfilosofie en overzicht van de vier trainingsfasen.

---

## 4. Componenten (`/components`)

### `/components/ActivityCard.tsx`
* **Doel**: Weergave van een voltooide rit of training in de activiteitentijdlijn.
* **Functionaliteit**:
  * Toont datum, dag van de week, activiteitstype (wielrennen, virtual ride, hardlopen).
  * Berekent en toont duur, afstand, Normalized Power / gemiddeld wattage, hartslag en Training Stress Score (TSS).
  * Berekent looptempo (min/km) voor loopsessies.
  * Filtert ongeldige of lege sessies automatisch weg (<60 sec en <100m).
  * Klikken op de kaart opent de AI-analyse via `CoachingModal`.

### `/components/SuggestedWorkoutCard.tsx`
* **Doel**: Weergave van een door de AI aanbevolen workout in de feed.
* **Functionaliteit**:
  * Visualiseert toekomstige of hedendaagse voorgestelde ritten met intensiteitsbadges (Herstel, Duur, Tempo, Threshold, VO2 Max).
  * Toont geplande duur, geschatte trainingsbelasting (TSS) en de fysiologische focus.
  * Geeft rustdagen visueel rustig weer met een koffie-icoon.
  * Klikken opent het detailvenster om de specifieke workout-stappen te bekijken of te synchroniseren met Intervals.icu.

### `/components/CoachingModal.tsx`
* **Doel**: Diepgaande AI-analyse en feedbackmodal voor een specifieke voltooide rit.
* **Functionaliteit**:
  * Haalt de exacte vermogensintervallen en de vooraf geplande workout van Intervals.icu op voor die datum.
  * Roept `getRideFeedback` in `geminiService.ts` aan om een gestructureerde coachingsevaluatie te genereren.
  * Toont:
    * **Executive Summary**: Hoe effectief was de rit in verhouding tot het hoofddoel van de atleet?
    * **Execution Score (1-10)**: Hoe goed hield de atleet zich aan het doel?
    * **Fysiologische adaptatie**: Wat heeft het lichaam getraind (aerobe enzymen, mitochondriën, lactaatverwerking)?
    * **Verbeterpunten & Tips**: Concreet advies voor volgende soortgelijke sessies.
    * **Vergelijking van intervallen**: Visuele weergave van geplande versus daadwerkelijk getrapte wattages.

### `/components/WeeklyBriefingModal.tsx`
* **Doel**: De 4-weken periodiseringskalender en het dynamische trainingsschema.
* **Functionaliteit**:
  * Biedt een tabbladnavigatie per week (Week 1: Build & Adapt, Week 2: Peak, Week 3: Taper, Week 4: Recovery).
  * Toont dag-voor-dag workouts inclusief intervallen, wattages en duur.
  * **Adaptive Prompting / Tweaks**: De gebruiker kan vrije instructies intypen (bijv. *"woensdag kan ik maar 45 min"* of *"voeg meer VO2max toe"*); het schema wordt hierop live aangepast via de AI.
  * **Intervals.icu Sync**: Uploadt een geselecteerde workout met één klik direct naar de externe Intervals.icu kalender van de atleet.
  * Ondersteunt wisselen tussen vermogenssturing (Watts) en hartslagsturing (HR zones).

### `/components/WorkoutLibrary.tsx`
* **Doel**: Een doorzoekbare bibliotheek met gestandaardiseerde fysiologische wielertrainingen.
* **Functionaliteit**:
  * Categoriseert trainingen in: Recovery, Endurance, Tempo/Sweet Spot, Threshold, VO2 Max en Anaerobic.
  * Schaling op basis van atleet-FTP: berekent direct de wattages voor elke stap op basis van het huidige FTP van de renner.
  * Biedt twee acties: direct toepassen als suggestie voor vandaag of inplannen op een specifieke datum in de Intervals.icu kalender.

### `/components/RiderPowerCurve.tsx`
* **Doel**: Analyse en visualisatie van de vermogenscurve (Power Duration Curve / MMP).
* **Functionaliteit**:
  * Vergelijkt de wattages over verschillende tijdsduur-vensters (1s, 5s, 30s, 1m, 5m, 20m, 60m).
  * Toont curven over meerdere jaren om progressie of regressie inzichtelijk te maken.
  * Identificeert het fenotype van de atleet (Sprinter, Puncheur, Klimmer, Tijdrijder/Diesel) en markeert het bijbehorende kritieke intensiteitsbereik.

### `/components/AerobicEfficiencyDecouplingChart.tsx`
* **Doel**: Geavanceerde aerobe fitheidsanalyse via Aerobic Efficiency (EF) en Pw:HR Decoupling.
* **Functionaliteit**:
  * Berekent de verhouding tussen Normalized Power en gemiddelde hartslag (EF = NP / Avg HR) voor duurtrainingen.
  * Visualiseert ontkoppeling (cardiac drift): een stijgende hartslag bij gelijkblijvend wattage duidt op vermoeidheid of dehydratatie.
  * Filtert op Zone 2 duurtrainingen, strakke ritten of alle ritten over tijdsperioden van 8 tot 26 weken.
  * Toont fysiologische uitleg en een gedetailleerde sessietabel.

### `/components/StepLabel.tsx`
* **Doel**: Formattering, visualisatie en opschaling van individuele workout-stappen en intervallen.
* **Functionaliteit**:
  * `sanitizeStepLabel`: Verwijdert overbodige herhalingsteksten (zoals "Rep 1", dubbele labels).
  * `scaleLabelWatts`: Schaalt labels dynamisch mee als het FTP van de atleet verandert.
  * `VisualProfileChart`: Genereert een miniatuur barchart-profiel van het vermogensverloop van de workout.
  * `GroupedWorkoutStepsList`: Groepeert identieke herhalingen (bijv. 5x 3m VO2max) overzichtelijk in de UI.

### `/components/ChangelogModal.tsx`
* **Doel**: Informatieve popup met versiegeschiedenis en nieuwe functies.
* **Functionaliteit**:
  * Toont versiebadges en bulletpoints van recente verbeteringen.
  * Gebruikt Motion voor vloeiende in- en uitfade animaties.

---

## 5. Services & Datamodellen (`/services` & `/types.ts`)

### `/types.ts`
* **Doel**: Centrale definities van alle TypeScript interfaces en typen.
* **Inhoud**:
  * `Activity`, `ActivityInterval`: Gegevensstructuur van voltooide ritten.
  * `Wellness`: Slaap, rustpols, HRV, vermoeidheid, spierpijn en stress.
  * `DailySuggestion`, `WeeklyBriefing`: Datastructuren voor de trainingsplannen.
  * `AnnualPowerCurve`, `PowerBest`: Datamodellen voor vermogensrecords.
  * `CoachingFeedback`, `AthleteProfileAnalysis`, `ThreeMonthReview`: Modellen voor AI-rapportages.
  * `IntervalsCredentials`: Authenticatie-object voor API communicatie.

### `/services/intervalsService.ts`
* **Doel**: Communicatielaag met de REST API van Intervals.icu.
* **Belangrijkste functies**:
  * `fetchAthleteId`, `fetchAthleteProfile`: Valideert inloggegevens en haalt gewicht, rusthartslag en actueel FTP op.
  * `fetchActivities`: Haalt de historische ritactiviteiten op binnen een instelbaar datumbereik.
  * `fetchActivityIntervals`: Vraagt gedetailleerde lap/interval-segmenten op van een rit.
  * `fetchWellness`: Verzamelt dagelijkse welzijnsdata (HRV, slaap, soreness, rusthartslag).
  * `getAnnualPowerCurves`: Verzamelt de beste vermogenswaarden over de afgelopen jaren.
  * `uploadWorkout`: Schrijft een gepland trainingsschema via de API direct naar de kalender van de atleet.
  * `classifyActivityRide`: Automatische categorisatie van een rit (Herstel, Zone 2, Tempo, VO2max) op basis van vermogen en hartslag.

### `/services/geminiService.ts`
* **Doel**: Integratie met het Google Gemini taalmodel via de officiële `@google/genai` SDK.
* **Belangrijkste functies**:
  * `getDailySuggestion`: Genereert de workout-aanbeveling voor vandaag op basis van recente belasting en welzijn.
  * `getRideFeedback`: Analyseert een voltooide rit tegen de achtergrond van het trainingsdoel.
  * `getWeeklyBriefing`: Genereert en periodiseert het 4-weken schema.
  * `sendChatMessage`: Beheert het interactieve AI-coachgesprek, inclusief injectie van historische trainingsdata.
  * `analyzeUserProfile`: Maakt een fysiologisch rennersprofiel (sterktes, zwaktes, type atleet).
  * `analyzeThreeMonthReview`: Grondige driemaandelijkse trainingsreview met CTL/ATL trends.
  * `normalizeBriefingDays`: Valideert en normaliseert gegenereerde ritten, voorkomt onrealistische duurtrainingen (bijv. back-to-back 4-uurs sessies) en matcht trainingen met de bibliotheek.
  * `getCache` / `setCache`: In-memory en browser caching mechanisme met TTL om overtollige API-aanroepen te voorkomen.

### `/services/promptTemplates.ts`
* **Doel**: Het centrale register van alle prompts en fysiologische richtlijnen voor het LLM.
* **Functionaliteit**:
  * Bevat de strikte instructies voor JSON-output formaten.
  * Bepaalt coaching-wetten: geen opeenvolgende hersteldagen, maximale intervalduur bij VO2max (nooit >8 min aaneengesloten), realistische weekduur (45-75 min doordeweeks).
  * Bevat modulaire richtlijnen voor hartslag- vs. vermogenstraining, triatlons en woon-werkverkeer ritten ("Commute AM/PM").

### `/services/directiveService.ts`
* **Doel**: Verwerking en beheer van trainingsplandoelen en -aanpassingen ("directives").
* **Functionaliteit**:
  * `parsePlanDirectives`, `serializePlanDirectives`: Parset en serialiseert gebruikersinstructies (bijv. uit de chat of uit het tweak-veld).
  * `getValidDirectivesForDate`: Houdt rekening met de datum waarop een instructie is gegeven en laat verlopen instructies automatisch vervallen.
  * Voorkomt dat het trainingsplan vervuild raakt met verouderde prompts.

### `/services/workoutLibrary.ts`
* **Doel**: Statische database met wetenschappelijk onderbouwde wielertrainingen en matching-algoritmen.
* **Functionaliteit**:
  * `WORKOUT_LIBRARY`: Uitgebreide catalogus met klassieke sessies (o.a. Sweet Spot 3x10, 4x4 Norwegian VO2max, 30/30 micro-bursts, Zone 2 Aerobic Foundation).
  * `matchWorkoutToLibrary`: Kiest op basis van focusnaam, duur en intensiteit de meest geschikte gestandaardiseerde sessie uit de bibliotheek.

---

## 6. Publieke Assets & PWA (`/public` & root)

### `/public/logo.png` & `/public/logo.svg`
* **Doel**: De visuele identiteit en iconen van waTTson.
* **Gebruik**: Dient als applicatielogo in de header, favicon in de browser en app-icoon bij installatie als PWA op iOS en Android.

### `/manifest.json` & `/public/manifest.json`
* **Doel**: Web App Manifest specificatie.
* **Functionaliteit**: Maakt de webapp installeerbaar op mobiele apparaten en desktops met fullscreen weergave (`"display": "standalone"`), themakleur (`#05070a`) en oriëntatie.

### `/service-worker.js` & `/public/service-worker.js`
* **Doel**: De PWA Service Worker voor offline ondersteuning en asset caching.
* **Functionaliteit**:
  * **Cache-First**: Voor externe statische assets (Google Fonts, Tailwind CDN, Twemoji).
  * **Stale-While-Revalidate**: Voor de app shell (`index.html`, scripts).
  * **Network-Only**: Negeert API-aanroepen naar Intervals.icu en Google Gemini zodat gegevens altijd actueel zijn.

### `/public/_redirects`
* **Doel**: SPA routing configuratie voor statische webhosts (zoals Netlify of Cloudflare Pages).
* **Functionaliteit**: Zorgt ervoor dat diepe URL's correct doorverwijzen naar `index.html`.

---

## 7. Hulpscripts & Debug Artifacts

In de root bevinden zich enkele eenmalige migratiescripts en debug-uitvoerbestanden die zijn gebruikt tijdens eerdere refactors:

* **`/patch.cjs`**: Node.js script dat eerder is gebruikt voor het herschrijven van de tijdlijnweergave in `App.tsx` (splitsing in Toekomst, Vandaag en Verleden).
* **`/patch2.cjs`**: Refactoring-script gericht op de `StepLabel` implementatie en FTP-schaling.
* **`/patch3.cjs`**: Script dat de tabbladnavigatie per week heeft toegevoegd aan `WeeklyBriefingModal.tsx`.
* **`/patch4.cjs`**: Script voor het opschonen van workout stappen.
* **`/expected.txt` & `/target_debug.txt`**: Tijdelijke logbestanden gegenereerd door de patch scripts tijdens het zoeken en vervangen van codefragmenten.

---

## 8. Overzicht van de Datastroom

Hieronder ziet u hoe de verschillende bestanden samenwerken tijdens een typische gebruikerssessie:

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
