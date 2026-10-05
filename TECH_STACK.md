# Flex-Master Gym — Tech Stack

## Frontend

- **React** — interactive admin dashboard and workflows.
- **Vite** — local development server and production frontend build.
- **JavaScript / JSX** — application code.
- **Custom CSS** — responsive desktop/tablet/mobile UI; no external CSS framework.
- **Lucide React** — interface icons.
- **Web APIs** — `MediaDevices.getUserMedia` and `BarcodeDetector` for camera QR scanning (where supported), `FileReader` for photo preview, service worker + web manifest for PWA support.

## Backend

- **Node.js** — runtime.
- **Native Node HTTP server** — API and serving the compiled frontend; Express is not used.
- **REST-style JSON API** — authentication, members, renewals, QR credentials, check-ins, guest visits, state, and health checks.
- **Zod** — server-side request validation.
- **Node `crypto`** — scrypt password hashing, random tokens, SHA-256 QR token lookup hashes, AES-256-GCM encrypted QR token storage.

## Database and persistence

- **PostgreSQL** — production database, with SQL migrations in `backend/database/migrations`.
- **node-postgres (`pg`)** — PostgreSQL driver/pool.
- **JSON file fallback** — local development/demo fallback only when PostgreSQL is unavailable.
- **Docker Compose** — optional local PostgreSQL 16 service.

## DevOps and deployment

- **npm** — dependency and script management.
- **Environment variables / `.env`** — configuration for port, database URL, secret, and allowed origins.
- **Render-compatible deployment** — Node web service plus managed PostgreSQL; any Node/Postgres HTTPS host works.
- **Git ignore rules** — exclude secrets, dependencies, runtime data, build output, and local storage from GitHub.

## Project layout

- `frontend/` — React application, UI pages/components, CSS, PWA assets, API helper.
- `backend/` — server, configuration, validation, services, repositories, migrations.
- `backend/routes/`, `controllers/`, `services/`, `repositories/` — MVC-oriented backend organization.
