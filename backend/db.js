// backend/db.js
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

// 🔹 Create a new PostgreSQL connection pool
export const pool = new Pool({
  user: process.env.PGUSER || 'dheerajkommineni',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'cloudbrink_docs',
  password: process.env.PGPASSWORD || '', // if you didn’t set one
  port: process.env.PGPORT || 5432,
});

// 🔹 Simple connection test (runs on startup)
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log(`PostgreSQL connected — ${res.rows[0].now}`);
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
  }
})();
