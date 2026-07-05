import fs from 'fs';
import pg from 'pg';

const sql = fs.readFileSync('db/schema.sql', 'utf8');
const pool = new pg.Pool({ connectionString: 'postgresql://ventureos_user:password@localhost:5432/ventureos', ssl: false });
const client = await pool.connect();

try {
  await client.query('BEGIN');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Schema applied successfully');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  console.error(error.stack);
} finally {
  client.release();
  await pool.end();
}
