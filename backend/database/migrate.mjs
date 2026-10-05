import { readFile, readdir } from 'node:fs/promises';
import { Client } from 'pg';
import { env } from '../config/env.mjs';

if (!env.databaseUrl) throw new Error('DATABASE_URL is required to run migrations. Copy .env.example to .env first.');
const client = new Client({ connectionString: env.databaseUrl, ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  const directory = new URL('./migrations/', import.meta.url);
  const migrations = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  for (const migration of migrations) {
    await client.query(await readFile(new URL(`./migrations/${migration}`, import.meta.url), 'utf8'));
    console.log(`Applied ${migration}`);
  }
} finally { await client.end(); }
