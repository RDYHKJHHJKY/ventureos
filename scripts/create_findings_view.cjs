require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const exists = await client.query("SELECT 1 FROM pg_class WHERE relkind='v' AND relname='findings';");
    if (exists.rowCount === 0) {
      await client.query("CREATE VIEW findings AS SELECT * FROM scan_findings;");
      console.log('View `findings` created');
    } else {
      console.log('View `findings` already exists');
    }
  } catch (e) { console.error(e); process.exit(2); } finally { await client.end(); }
})();
