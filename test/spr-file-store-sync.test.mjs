import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('mirrors SPR software records into the file-backed store', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ventureos-spr-store-'));
  const dataFile = path.join(tempDir, 'ventureos-db.json');
  process.env.VENTUREOS_DATA_FILE = dataFile;

  try {
    const { readDb, syncRecordToFileStore } = await import('../lib/server/data-store.js');

    const dbBefore = await readDb();
    assert.deepEqual(dbBefore.sprSoftware || [], []);

    await syncRecordToFileStore('sprSoftware', {
      id: 'sprsoftware_test',
      name: 'Test Software',
      vendorId: 'sprvendor_test',
    });

    const dbAfter = await readDb();
    assert.equal((dbAfter.sprSoftware || []).length, 1);
    assert.equal((dbAfter.sprSoftware || [])[0].id, 'sprsoftware_test');
  } finally {
    delete process.env.VENTUREOS_DATA_FILE;
    await rm(tempDir, { recursive: true, force: true });
  }
});
