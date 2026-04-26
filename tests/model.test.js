import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveIncidentMetrics,
  emptyIncident,
  generateIncidentBrief,
  generatePostmortemDraft,
  parseIncidentJson,
  reduceIncident,
  serializeIncident,
  severityRank
} from '../src/model.js';
import { buildScenarioIncident, scenarios } from '../src/scenarios.js';

test('severityRank orders high severity first', () => {
  assert.equal(severityRank('SEV1'), 1);
  assert.equal(severityRank('SEV4'), 4);
  assert.equal(severityRank('unknown'), 3);
});

test('emptyIncident provides deterministic starter state', () => {
  const incident = emptyIncident();
  assert.equal(incident.status, 'investigating');
  assert.deepEqual(incident.timeline, []);
  assert.deepEqual(incident.actions, []);
});

test('timeline events are append-only and apply service/action effects', () => {
  const incident = reduceIncident(emptyIncident({ title: 'API outage' }), {
    type: 'timeline/add',
    event: {
      id: 'evt-1',
      at: '2026-04-26T18:05:00.000Z',
      kind: 'impact-update',
      summary: 'API is down for checkout clients.',
      severity: 'SEV1',
      service: { id: 'api', name: 'API', state: 'down', customerVisible: true, affectedUsers: 4500, errorBudgetBurn: 9.7 },
      action: { id: 'act-1', title: 'Fail over API traffic', owner: 'Nia', priority: 'P0' }
    }
  });

  assert.equal(incident.severity, 'SEV1');
  assert.equal(incident.timeline.length, 1);
  assert.equal(incident.services[0].state, 'down');
  assert.equal(incident.actions[0].title, 'Fail over API traffic');
});

test('metrics summarize customer impact and open action state', () => {
  const incident = buildScenarioIncident('checkout-latency', 2);
  const metrics = deriveIncidentMetrics(incident);
  assert.equal(metrics.customerVisible, true);
  assert.equal(metrics.openActionCount, 2);
  assert.equal(metrics.worstServiceState, 'degraded');
  assert.match(metrics.latestImpact, /Support reports/);
});

test('brief generation recommends next operational steps', () => {
  const incident = buildScenarioIncident('checkout-latency', 1);
  const brief = generateIncidentBrief(incident, '2026-04-26T18:10:00.000Z');
  assert.match(brief.headline, /SEV2 Checkout latency/);
  assert.ok(brief.risks.some((risk) => risk.includes('High severity')));
  assert.ok(brief.recommendedNextSteps.includes('Send customer-facing status update.'));
});

test('postmortem draft includes timeline, decisions, and follow-ups', () => {
  const incident = buildScenarioIncident('checkout-latency', scenarios[0].events.length - 1);
  const draft = generatePostmortemDraft(incident);
  assert.match(draft, /# Postmortem Draft/);
  assert.match(draft, /Rollback payment adapter deploy/);
  assert.match(draft, /Checkout probes and payment authorization errors/);
});

test('JSON export and import round-trip normalized incident state', () => {
  const incident = buildScenarioIncident('checkout-latency', 3);
  const parsed = parseIncidentJson(serializeIncident(incident));
  assert.deepEqual(parsed, incident);
});
