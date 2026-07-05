import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://ventureos_user:password@localhost:5432/ventureos', ssl: false });
const client = await pool.connect();

try {
  const assetRes = await client.query("SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'id'");
  const scanRunRes = await client.query("SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scan_runs' AND column_name = 'asset_id'");
  console.log('assets.id:', assetRes.rows[0]?.data_type);
  console.log('scan_runs.asset_id:', scanRunRes.rows[0]?.data_type);
} finally {
  client.release();
  await pool.end();
}
