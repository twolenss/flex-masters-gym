# Flex-Master Gym — Continuation Guide

## What is working now

The project is a responsive React/Vite web app with a lightweight, self-contained Node backend.

- Admin login is functional through `POST /api/auth/login`.
- Current demo credentials: `admin@flexmaster.gym` / `flexmaster2026`.
- Login returns a 64-character random in-memory bearer token valid for 12 hours.
- The app reads and writes its records through authenticated `GET /api/state` and `PUT /api/state` endpoints.
- The backend persists its data to `data/flex-master-db.json`; it creates this file automatically on first server start.
- Frontend behavior works for member creation, expiry calculations, renewals without duplicate profiles, payments, member/guest visits, QR simulation, QR generation/download, and filters.
- A production build has passed with `npm run build`.
- The PWA files are present in `public/` for installable phone/tablet use when hosted over HTTPS.

## Run it

Development requires two terminals:

```powershell
npm run server
npm run dev
```

Open the Vite address (normally `http://localhost:5173`). Vite proxies `/api` calls to the backend on port 4000.

For a production-style local run:

```powershell
npm run build
npm run server
```

Then open `http://127.0.0.1:4000`.

## Key files

- `src/main.jsx` — React UI, client-side workflows, API calls.
- `src/styles.css` — responsive styles.
- `server.mjs` — dependency-free Node HTTP API, authentication, JSON persistence, production static server.
- `vite.config.js` — API development proxy.
- `data/flex-master-db.json` — generated runtime database; do not commit real member data.
- `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg` — PWA assets.

## API contract

| Method | Endpoint | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/login` | No | Body: `{email,password}`; returns bearer token |
| GET | `/api/state` | Yes | Retrieves `{members, visits, payments}` |
| PUT | `/api/state` | Yes | Replaces persisted `{members, visits, payments}` |

The UI seeds the empty backend on the first authenticated app load. This is why an initial API check may show zero records before a browser signs in.

## Highest-priority next implementation work

1. Replace the JSON whole-state storage with PostgreSQL tables: admins, members, memberships, QR credentials, payments, member_checkins, guest_visits. Use migrations and foreign keys.
2. Replace the in-memory session map with a signed, expiring HttpOnly cookie or JWT. Use scrypt/argon2/bcrypt password hashes; do not keep the demo password in source for production.
3. Split `PUT /api/state` into entity-focused REST endpoints, validate every body server-side, and enforce automatic expiry/check-in rules server-side.
4. Add real QR images/scanner support (`qrcode` generation + camera scanner), but keep QR payloads random opaque tokens only.
5. Add photo upload/storage with size/type validation; show the real photo in member scan verification.
6. Add reports, pagination, full date/status filters, exports, error/empty states, and automated tests.

## Security note

This backend makes the app genuinely persistent and protected for local demonstration, but it is **not yet production security**. It stores a SHA-256 demo-password hash and volatile sessions solely to avoid third-party dependencies. Upgrade authentication and storage before internet deployment.
