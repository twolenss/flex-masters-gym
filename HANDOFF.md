# Flex-Master Gym — Implementation Handoff

## Location and stack

Project root: `C:\Users\franc\Documents\Codex\2026-10-04\files-pasted-by-the-user-create`

This is a responsive React + Vite web application. Start it with `npm run dev`; production-build it with `npm run build`.

It also includes a basic installable PWA configuration (`public/manifest.webmanifest`, `public/sw.js`, and `public/icon.svg`). When deployed over HTTPS, owners can install it from a phone/tablet browser's “Add to Home Screen” prompt. The cache is an app-shell cache; it does not make the remote-font dependency fully offline-safe.

## Implemented UI and behavior

- Responsive admin shell with desktop sidebar and mobile slide-out navigation.
- Dashboard with member, visit, revenue, expiry, activity, and membership-overview cards.
- Member list with search and basic status display.
- Add-member flow with calculated 15-day / 30-day membership expiration, manual payment capture, generated member ID and secure-looking QR token.
- Member profile with personal and membership details, token visual, payment history data model, and renewal modal.
- Renewal updates the existing profile instead of creating a duplicate and records a payment.
- QR scan screen accepts a token, validates active vs. expired vs. invalid status, displays the member, and records approved check-ins. Multiple check-ins are permitted.
- Guest session form records guest visits and manual payments.
- Check-in and payment history screens.
- Installable PWA metadata, home-screen icon, and service-worker cache for the web app shell.
- Data currently persists in `localStorage` under `flexmaster`, seeded with sample data. This is appropriate for a browser prototype, not for multi-device production usage.

## Current build status

Dependencies were installed successfully with `npm install --cache .npm-cache`.

`npm run build` completes successfully and produces the deployable static bundle in `dist/`. The source is still compact in places, so formatting `src/main.jsx` would make future maintenance easier.

## Production work still needed

- Replace localStorage with a Node/Express API and PostgreSQL schema for admins, members, memberships, QR credentials, payments, check-ins, and guest visits.
- Add real admin authentication: password hashing, session/JWT handling, protected API routes, rate limiting, and environment configuration.
- Implement real QR generation/download/print and camera scanning. QR payload should contain a random server-validated token only.
- Store uploaded member photos securely; the prototype currently uses initials rather than binary image uploads.
- Add server-side membership expiry checking and optional scheduled reconciliation.
- Add robust filtering, pagination, edits, membership/payment/check-in history tabs, report exports, guest-facing QR landing page, validation, test coverage, audit logging, and role/backup policy as needed.
- Add PWA support if installable mobile web behavior is wanted, or use Capacitor/React Native for a native Android/iOS build.

## Useful sample QR test values

- Active: `FM-MC8V3Z` (Marianne Cruz; active through 18 Oct 2026)
- Expired: `FM-JS2K7A` (Jerome Santos)
- Invalid: any unknown token
