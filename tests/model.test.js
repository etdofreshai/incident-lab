import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyIncident, severityRank } from '../src/model.js';

test('severityRank orders high severity first', () => {
  assert.equal(severityRank('SEV1'), 1);
  assert.equal(severityRank('SEV4'), 4);
});

test('emptyIncident provides deterministic starter state', () => {
  const incident = emptyIncident();
  assert.equal(incident.status, 'investigating');
  assert.deepEqual(incident.timeline, []);
});
