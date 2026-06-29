require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;");
    console.log('Tables in public schema:');
    res.rows.forEach(r => console.log(' -', r.tablename));
  } catch (e) { console.error(e); process.exit(2); } finally { await client.end(); }
})();
