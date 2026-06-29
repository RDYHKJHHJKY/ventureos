#!/usr/bin/env node
/**
 * Database Connection Test
 * Verify PostgreSQL is configured and running
 * Usage: node scripts/db-test.js
 */

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runTests() {
  console.log('🧪 VentureOS Database Tests');
  console.log('============================\n');

  const tests = [
    {
      name: 'Environment Variables',
      fn: testEnv,
    },
    {
      name: 'Database Connection',
      fn: testConnection,
    },
    {
      name: 'Tables Exist',
      fn: testTables,
    },
    {
      name: 'Create & Read User',
      fn: testUserCRUD,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`🧪 Test: ${test.name}`);
      await test.fn();
      console.log(`✅ PASSED\n`);
      passed++;
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failed++;
    }
  }

  console.log('============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('============================\n');

  if (failed === 0) {
    console.log('🎉 All tests passed! Database is ready to use.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Review the errors above.');
    process.exit(1);
  }
}

async function testEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable not set');
  }
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL.substring(0, 50)}...`);
}

async function testConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    const now = result.rows[0].now;
    console.log(`  Connected at: ${now}`);
  } finally {
    client.release();
  }
}

async function testTables() {
  const requiredTables = [
    'users',
    'workspaces',
    'workspace_members',
    'sessions',
    'assets',
    'scan_runs',
    'findings',
    'passports',
  ];

  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  const existingTables = result.rows.map(r => r.table_name);
  const missing = requiredTables.filter(t => !existingTables.includes(t));

  if (missing.length > 0) {
    throw new Error(`Missing tables: ${missing.join(', ')}`);
  }

  console.log(`  Found ${existingTables.length} tables`);
  console.log(`  Required tables: ${requiredTables.join(', ')}`);
}

async function testUserCRUD() {
  const testEmail = `test-${Date.now()}@example.com`;
  const testName = 'Test User';

  // CREATE
  const createResult = await pool.query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
    [testEmail, 'dummy_hash', testName]
  );

  const userId = createResult.rows[0].id;
  console.log(`  Created user: ${userId}`);

  // READ
  const readResult = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );

  if (readResult.rows.length === 0) {
    throw new Error('Could not read back created user');
  }

  console.log(`  Read user: ${readResult.rows[0].email}`);

  // DELETE
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);

  const deleteResult = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );

  if (deleteResult.rows.length > 0) {
    throw new Error('User was not deleted');
  }

  console.log(`  Deleted user successfully`);
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
