import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️  DATABASE_URL not set. DB operations will fail.');
}

export const pool = new Pool({
  connectionString,
});
