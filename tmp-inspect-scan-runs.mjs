import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://ventureos_user:password@localhost:5432/ventureos', ssl: false });
const client = await pool.connect();

try {
  await client.query('DROP TABLE IF EXISTS scan_runs CASCADE');
  await client.query(`
    CREATE TABLE IF NOT EXISTS scan_runs (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      asset_id text not null references assets(id) on delete cascade,
      created_by text,
      status text not null,
      trust_score integer not null,
      confidence_score integer not null,
      verdict text not null,
      risk text not null,
      scores jsonb not null,
      explanation text not null,
      started_at timestamptz not null,
      completed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scan_runs' ORDER BY ordinal_position");
  console.log(JSON.stringify(res.rows, null, 2));
} finally {
  client.release();
  await pool.end();
}
