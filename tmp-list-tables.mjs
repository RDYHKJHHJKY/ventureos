import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://ventureos_user:password@localhost:5432/ventureos', ssl: false });
const client = await pool.connect();

try {
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name", ['public']);
  console.log(res.rows.map((row) => row.table_name).join('\n'));
} finally {
  client.release();
  await pool.end();
}
