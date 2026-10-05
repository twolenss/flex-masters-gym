# Deployment guide

## Local development

1. Copy `.env.example` to `.env` and set a long `SESSION_SECRET`.
2. Start PostgreSQL with `docker compose up -d postgres`, or use an existing PostgreSQL instance.
3. Set `DATABASE_URL` in `.env`.
4. Run `npm run db:migrate`.
5. Run `npm run build` and `npm run server`.

When `DATABASE_URL` is set and reachable, the backend uses PostgreSQL as its active persistence layer. In development, an unreachable database automatically falls back to the local JSON demonstration store and reports `"storage":"json-fallback"` from `/api/health`; production intentionally refuses to start in this condition.

## Production checklist

- Set `NODE_ENV=production`, a private `SESSION_SECRET`, and a managed PostgreSQL `DATABASE_URL`.
- Host behind HTTPS. Service workers, camera access, and installable PWA behavior require HTTPS outside localhost.
- Set `ALLOWED_ORIGINS` to the exact production frontend origin(s).
- Do not use the bundled demo account/password. Seed an owner account securely, then remove or rotate it.
- The current member-photo flow stores small (400 KB) data URLs. Move these to private object storage before handling significant real-member volume.
- Camera QR scanning uses the browser-native `BarcodeDetector` API and requires HTTPS outside localhost. Retain manual token entry for browsers without support.
- Back up PostgreSQL and test restoring it before accepting production member/payment data.

The current server maintains a JSON fallback for local demonstrations. Configure PostgreSQL and complete repository routing before considering it a production database runtime.
