# Implementation Plan: OAuth Integration for Strava and Intervals.icu

## Overview
Implement OAuth 2.0 flows for Strava and Intervals.icu to allow users to securely connect their accounts, replacing manual API key entry.

## Tasks
1. **Server-Side API**:
    - Implement `/api/auth/strava/url` and `/api/auth/intervals/url` endpoints to generate authorization URLs.
    - Implement `/api/auth/strava/callback` and `/api/auth/intervals/callback` to handle authorization code exchange and token storage.
    - Configure secure cookie handling for the iframe environment.

2. **Client-Side UI**:
    - Update the Start Screen (`App.tsx`) to replace API key inputs with "Connect Strava" and "Connect Intervals.icu" buttons.
    - Implement popup-based OAuth flow using `window.open` and `postMessage` for secure cross-origin communication.

3. **Data Management**:
    - Update `IntervalsCredentials` in `types.ts` to store OAuth tokens.
    - Update `App.tsx` and `services/firebase.ts` to persist connection state and tokens in Firestore.

## Feedback Requested
- Do you have the Client ID and Client Secret for both Strava and Intervals.icu applications?
- Please confirm that we should use popup-based authentication as planned.
