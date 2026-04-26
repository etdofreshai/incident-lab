import { emptyIncident, reduceIncident } from './model.js';

export const scenarios = [
  {
    id: 'checkout-latency',
    name: 'Checkout latency cascade',
    description: 'A payment gateway regression causes elevated checkout latency, customer-visible errors, and a coordinated mitigation.',
    incident: emptyIncident({
      id: 'inc-checkout-latency',
      title: 'Checkout latency and payment errors',
      severity: 'SEV2',
      commander: 'Riley',
      startedAt: '2026-04-26T18:00:00.000Z',
      nextUpdateAt: '2026-04-26T18:30:00.000Z'
    }),
    events: [
      {
        id: 'evt-detect-001',
        at: '2026-04-26T18:03:00.000Z',
        kind: 'detection',
        actor: 'monitoring',
        summary: 'Synthetic checkout probes exceed 2.5s p95 for five minutes.',
        service: { id: 'checkout', name: 'Checkout', state: 'degraded', customerVisible: true, affectedUsers: 1200, errorBudgetBurn: 4.2 }
      },
      {
        id: 'evt-impact-001',
        at: '2026-04-26T18:08:00.000Z',
        kind: 'impact-update',
        actor: 'support',
        summary: 'Support reports customer tickets for failed payments in US-East.',
        severity: 'SEV2',
        hypothesis: 'Recent payment adapter deploy may be retrying too aggressively.',
        action: { id: 'act-status-page', title: 'Draft status page update', owner: 'Morgan', priority: 'P1', dueAt: '2026-04-26T18:20:00.000Z' }
      },
      {
        id: 'evt-decision-001',
        at: '2026-04-26T18:18:00.000Z',
        kind: 'decision',
        actor: 'commander',
        summary: 'Rollback payment adapter deploy and disable experimental retry policy.',
        action: { id: 'act-rollback', title: 'Rollback payment adapter deploy', owner: 'Avery', priority: 'P0', dueAt: '2026-04-26T18:25:00.000Z' }
      },
      {
        id: 'evt-mitigation-001',
        at: '2026-04-26T18:29:00.000Z',
        kind: 'mitigation',
        actor: 'payments-oncall',
        summary: 'Rollback complete; checkout p95 is falling but errors remain elevated.',
        status: 'monitoring',
        nextUpdateAt: '2026-04-26T19:00:00.000Z',
        service: { id: 'checkout', name: 'Checkout', state: 'recovering', customerVisible: true, affectedUsers: 300, errorBudgetBurn: 5.1 }
      },
      {
        id: 'evt-resolution-001',
        at: '2026-04-26T18:52:00.000Z',
        kind: 'resolution',
        actor: 'commander',
        summary: 'Checkout probes and payment authorization errors have returned to baseline.',
        status: 'resolved',
        service: { id: 'checkout', name: 'Checkout', state: 'resolved', customerVisible: true, affectedUsers: 0, errorBudgetBurn: 5.1 }
      }
    ]
  }
];

export function buildScenarioIncident(scenarioId = scenarios[0].id, throughIndex = -1) {
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId) || scenarios[0];
  return scenario.events.slice(0, throughIndex + 1).reduce((incident, event) => reduceIncident(incident, { type: 'timeline/add', event }), scenario.incident);
}
