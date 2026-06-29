import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

try {
  const client = await pool.connect();
  const res = await client.query('SELECT NOW()');
  console.log('connected', res.rows[0]);
  client.release();
} catch (err) {
  console.error('connect-error', err);
} finally {
  await pool.end();
}
