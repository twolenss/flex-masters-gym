import { randomBytes } from 'node:crypto';

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@flexmaster.gym',
  adminPassword: process.env.ADMIN_PASSWORD || 'flexmaster2026',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim())
};

if (env.nodeEnv === 'production') {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be configured in production');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured in production');
  if (!process.env.ADMIN_PASSWORD || env.adminPassword === 'flexmaster2026') throw new Error('Set a unique ADMIN_PASSWORD before production startup');
}
