import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const sql = fs.readFileSync('db/schema.sql', 'utf8');
const statements = sql
  .split(/;\s*/)
  .map((s) => s.trim())
  .filter(Boolean);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const client = await pool.connect();

try {
  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    if (!statement) continue;
    try {
      await client.query(statement + ';');
      console.log(`OK ${i + 1}: ${statement.split('\n')[0]}`);
    } catch (error) {
      console.error(`FAIL ${i + 1}: ${error.message}`);
      console.error(statement);
      process.exit(1);
    }
  }
} finally {
  client.release();
  await pool.end();
}
