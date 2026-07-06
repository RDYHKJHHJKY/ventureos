import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
(async()=>{
  const file = path.resolve(process.cwd(), 'db', 'migrations', '003_convert_spr_ids_to_uuid.sql');
  if (!fs.existsSync(file)) {
    console.error('Migration file not found:', file);
    process.exit(1);
  }
  const sql = fs.readFileSync(file, 'utf8');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const client = await pool.connect();
  try {
    console.log('Applying migration:', file);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');
  } catch (e) {
    console.error('Migration failed:', e && e.stack);
    try { await client.query('ROLLBACK'); } catch(_){}
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
