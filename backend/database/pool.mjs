import { Pool } from 'pg';
import { env } from '../config/env.mjs';

export const pool = env.databaseUrl ? new Pool({
  connectionString: env.databaseUrl,
  ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10
}) : null;
