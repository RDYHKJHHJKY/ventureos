import test from 'node:test';
import assert from 'node:assert/strict';

import { getSafeCommandContext, isCommandContextAvailable } from '../src/components/universalCommandBarContext.js';

test('treats missing context as unavailable for workspace-scoped commands', () => {
  const cmd = { requiredContext: ['workspace'] };
  assert.equal(isCommandContextAvailable(undefined, cmd), false);
});

test('allows system-scoped commands without any context', () => {
  const cmd = { requiredContext: ['system'] };
  assert.equal(isCommandContextAvailable(undefined, cmd), true);
});

test('uses active entity when context is partially present', () => {
  const cmd = { requiredContext: ['passport'] };
  const context = { activeEntity: { entityType: 'passport' } };
  assert.equal(isCommandContextAvailable(context, cmd), true);
});

test('returns a safe context object even when context is undefined', () => {
  const safeContext = getSafeCommandContext(undefined);
  assert.deepEqual(safeContext, { workspaceId: '' });
});
