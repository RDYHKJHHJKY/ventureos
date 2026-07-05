import fs from 'fs';
import pg from 'pg';

const sql = fs.readFileSync('db/schema.sql', 'utf8');
const statements = sql
  .split(/;\s*/)
  .map((s) => s.trim())
  .filter(Boolean);

const pool = new pg.Pool({ connectionString: 'postgresql://ventureos_user:password@localhost:5432/ventureos', ssl: false });
const client = await pool.connect();

try {
  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    if (!statement || statement.startsWith('--')) continue;
    try {
      await client.query(statement + ';');
      console.log(`OK ${i + 1}`);
    } catch (error) {
      console.error(`FAIL ${i + 1}: ${error.message}`);
      console.error(statement);
      break;
    }
  }
} finally {
  client.release();
  await pool.end();
}
