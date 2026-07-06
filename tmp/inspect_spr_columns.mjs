import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
(async ()=>{
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  try {
    const res = await pool.query("SELECT column_name, column_default, is_nullable, data_type FROM information_schema.columns WHERE table_name='spr_audit_logs' ORDER BY ordinal_position");
    console.log('spr_audit_logs columns:');
    console.log(JSON.stringify(res.rows, null, 2));

    const res2 = await pool.query("SELECT column_name, column_default, is_nullable, data_type FROM information_schema.columns WHERE table_name='spr_restricted_tokens' ORDER BY ordinal_position");
    console.log('spr_restricted_tokens columns:');
    console.log(JSON.stringify(res2.rows, null, 2));
  } catch (e) {
    console.error(e && e.stack);
  } finally {
    await pool.end();
  }
})();
