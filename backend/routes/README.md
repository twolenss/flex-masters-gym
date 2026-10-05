# Route modules

The current local JSON-backed API is implemented in `../server.mjs`. Its route groups are authentication, members, QR credentials, check-ins, guests, and application state. Split each group into this folder when migrating from JSON persistence to PostgreSQL.
