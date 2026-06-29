require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='findings';");
    console.log(res.rows.length ? 'findings exists' : 'findings missing');
  } catch (e) { console.error(e); process.exit(2); } finally { await client.end(); }
})();
