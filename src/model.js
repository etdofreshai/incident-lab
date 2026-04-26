const SEVERITY_RANK = { SEV1: 1, SEV2: 2, SEV3: 3, SEV4: 4 };
const VALID_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];
const VALID_SERVICE_STATES = ['operational', 'degraded', 'down', 'recovering', 'resolved'];

export function severityRank(severity = 'SEV3') {
  return SEVERITY_RANK[severity] || SEVERITY_RANK.SEV3;
}

export function emptyIncident(overrides = {}) {
  return normalizeIncident({
    id: 'incident-local',
    title: 'Untitled incident',
    severity: 'SEV3',
    status: 'investigating',
    commander: '',
    startedAt: '2026-04-26T18:00:00.000Z',
    currentHypothesis: '',
    nextUpdateAt: '',
    services: [],
    timeline: [],
    actions: [],
    ...overrides
  });
}

export function normalizeIncident(input = {}) {
  const base = {
    id: String(input.id || 'incident-local'),
    title: String(input.title || 'Untitled incident'),
    severity: SEVERITY_RANK[input.severity] ? input.severity : 'SEV3',
    status: VALID_STATUSES.includes(input.status) ? input.status : 'investigating',
    commander: String(input.commander || ''),
    startedAt: input.startedAt || new Date(0).toISOString(),
    currentHypothesis: String(input.currentHypothesis || ''),
    nextUpdateAt: input.nextUpdateAt || '',
    services: Array.isArray(input.services) ? input.services.map(normalizeService) : [],
    timeline: Array.isArray(input.timeline) ? input.timeline.map(normalizeTimelineEvent) : [],
    actions: Array.isArray(input.actions) ? input.actions.map(normalizeAction) : []
  };
  base.timeline.sort(compareByTimeThenId);
  base.actions.sort(compareByPriorityThenDue);
  return base;
}

export function reduceIncident(incident, event) {
  const state = normalizeIncident(incident);
  switch (event?.type) {
    case 'incident/update':
      return normalizeIncident({ ...state, ...pick(event, ['title', 'severity', 'status', 'commander', 'currentHypothesis', 'nextUpdateAt']) });
    case 'timeline/add': {
      const timelineEvent = normalizeTimelineEvent(event.event || event);
      return applyTimelineEffects(normalizeIncident({ ...state, timeline: [...state.timeline, timelineEvent] }), timelineEvent);
    }
    case 'action/add':
      return normalizeIncident({ ...state, actions: [...state.actions, normalizeAction(event.action || event)] });
    case 'action/update':
      return normalizeIncident({
        ...state,
        actions: state.actions.map((action) => action.id === event.id ? normalizeAction({ ...action, ...event.patch }) : action)
      });
    case 'service/update':
      return normalizeIncident({ ...state, services: upsertById(state.services, normalizeService(event.service || event)) });
    case 'scenario/applyEvent':
      return reduceIncident(state, { type: 'timeline/add', event: event.event });
    default:
      return state;
  }
}

function applyTimelineEffects(state, event) {
  let next = state;
  if (event.severity) next = normalizeIncident({ ...next, severity: event.severity });
  if (event.status) next = normalizeIncident({ ...next, status: event.status });
  if (event.nextUpdateAt) next = normalizeIncident({ ...next, nextUpdateAt: event.nextUpdateAt });
  if (event.hypothesis) next = normalizeIncident({ ...next, currentHypothesis: event.hypothesis });
  if (event.service) next = reduceIncident(next, { type: 'service/update', service: { ...event.service, updatedAt: event.at } });
  if (event.action) next = reduceIncident(next, { type: 'action/add', action: { ...event.action, sourceTimelineId: event.id } });
  return next;
}

export function deriveIncidentMetrics(incident) {
  const state = normalizeIncident(incident);
  const customerVisibleServices = state.services.filter((service) => service.customerVisible && service.state !== 'resolved' && service.state !== 'operational');
  const openActions = state.actions.filter((action) => action.status !== 'done' && action.status !== 'canceled');
  const latestImpactEvent = [...state.timeline].reverse().find((event) => event.kind === 'impact-update' || event.service);
  const worstServiceState = state.services.reduce((worst, service) => serviceStateRank(service.state) > serviceStateRank(worst) ? service.state : worst, 'operational');
  return {
    timelineCount: state.timeline.length,
    openActionCount: openActions.length,
    customerVisible: customerVisibleServices.length > 0,
    affectedUsers: state.services.reduce((sum, service) => sum + (Number(service.affectedUsers) || 0), 0),
    totalErrorBudgetBurn: round1(state.services.reduce((sum, service) => sum + (Number(service.errorBudgetBurn) || 0), 0)),
    latestImpact: latestImpactEvent?.summary || 'No impact updates recorded yet.',
    worstServiceState,
    openActions
  };
}

export function generateIncidentBrief(incident, now = '2026-04-26T18:00:00.000Z') {
  const state = normalizeIncident(incident);
  const metrics = deriveIncidentMetrics(state);
  const risks = [];
  if (severityRank(state.severity) <= 2 && state.status !== 'resolved') risks.push('High severity incident requires frequent stakeholder updates.');
  if (metrics.customerVisible) risks.push(`${metrics.affectedUsers.toLocaleString()} estimated users affected across customer-visible services.`);
  if (metrics.openActionCount > 3) risks.push('Many open actions may need commander triage.');
  if (!state.nextUpdateAt && state.status !== 'resolved') risks.push('No next update time set.');

  return {
    generatedAt: now,
    headline: `${state.severity} ${state.title} — ${state.status}`,
    commander: state.commander || 'Unassigned',
    currentStatus: state.currentHypothesis || metrics.latestImpact,
    latestImpact: metrics.latestImpact,
    nextUpdateAt: state.nextUpdateAt || 'Not scheduled',
    openActions: metrics.openActions.map((action) => `${action.priority} ${action.owner || 'Unowned'}: ${action.title}`),
    risks,
    recommendedNextSteps: recommendNextSteps(state, metrics)
  };
}

export function generatePostmortemDraft(incident) {
  const state = normalizeIncident(incident);
  const detection = state.timeline.find((event) => event.kind === 'detection');
  const resolution = [...state.timeline].reverse().find((event) => event.kind === 'resolution' || event.status === 'resolved');
  const decisions = state.timeline.filter((event) => event.kind === 'decision').map((event) => `- ${event.at}: ${event.summary}`);
  const followUps = state.actions.filter((action) => action.status !== 'done').map((action) => `- [ ] ${action.title} (${action.owner || 'unowned'}, ${action.priority})`);
  return `# Postmortem Draft: ${state.title}\n\n## Summary\n${state.severity} incident led by ${state.commander || 'an unassigned commander'}. ${state.currentHypothesis || 'Root cause is still under review.'}\n\n## Timeline\n${state.timeline.map((event) => `- ${event.at} [${event.kind}] ${event.summary}`).join('\n') || '- No timeline events recorded.'}\n\n## Detection\n${detection ? detection.summary : 'Detection details not recorded.'}\n\n## Resolution\n${resolution ? resolution.summary : 'Incident is not resolved yet.'}\n\n## Key Decisions\n${decisions.join('\n') || '- No decisions recorded.'}\n\n## What Went Well\n- Add facilitator notes here.\n\n## What Went Poorly\n- Add facilitator notes here.\n\n## Follow-ups\n${followUps.join('\n') || '- No open follow-ups.'}\n`;
}

export function scenarioStep(incident, scenario, index) {
  if (!scenario?.events?.[index]) return normalizeIncident(incident);
  return reduceIncident(incident, { type: 'scenario/applyEvent', event: scenario.events[index] });
}

export function serializeIncident(incident) {
  return JSON.stringify(normalizeIncident(incident), null, 2);
}

export function parseIncidentJson(json) {
  return normalizeIncident(JSON.parse(json));
}

function normalizeTimelineEvent(event = {}) {
  const at = event.at || new Date(0).toISOString();
  return {
    id: String(event.id || `evt-${hash(`${at}:${event.kind || 'note'}:${event.summary || ''}`)}`),
    at,
    kind: event.kind || 'metric-observation',
    summary: String(event.summary || ''),
    actor: String(event.actor || ''),
    severity: SEVERITY_RANK[event.severity] ? event.severity : undefined,
    status: VALID_STATUSES.includes(event.status) ? event.status : undefined,
    hypothesis: event.hypothesis ? String(event.hypothesis) : undefined,
    nextUpdateAt: event.nextUpdateAt || undefined,
    service: event.service ? normalizeService(event.service) : undefined,
    action: event.action ? normalizeAction(event.action) : undefined
  };
}

function normalizeAction(action = {}) {
  return {
    id: String(action.id || `act-${hash(action.title || 'action')}`),
    title: String(action.title || 'Untitled action'),
    owner: String(action.owner || ''),
    priority: ['P0', 'P1', 'P2', 'P3'].includes(action.priority) ? action.priority : 'P2',
    dueAt: action.dueAt || '',
    status: ['open', 'in-progress', 'done', 'canceled'].includes(action.status) ? action.status : 'open',
    sourceTimelineId: action.sourceTimelineId || ''
  };
}

function normalizeService(service = {}) {
  return {
    id: String(service.id || service.name || 'service'),
    name: String(service.name || service.id || 'Service'),
    state: VALID_SERVICE_STATES.includes(service.state) ? service.state : 'operational',
    customerVisible: Boolean(service.customerVisible),
    affectedUsers: Math.max(0, Number(service.affectedUsers) || 0),
    errorBudgetBurn: Math.max(0, Number(service.errorBudgetBurn) || 0),
    updatedAt: service.updatedAt || ''
  };
}

function recommendNextSteps(state, metrics) {
  if (state.status === 'resolved') return ['Confirm customer impact has ended.', 'Publish postmortem owner and deadline.'];
  const steps = [];
  if (!state.commander) steps.push('Assign an incident commander.');
  if (metrics.customerVisible) steps.push('Send customer-facing status update.');
  if (metrics.openActionCount === 0) steps.push('Create concrete mitigation and comms action items.');
  steps.push('Record the next timeline update after each material change.');
  return steps;
}

function upsertById(items, item) {
  return items.some((current) => current.id === item.id) ? items.map((current) => current.id === item.id ? item : current) : [...items, item];
}

function pick(source, keys) {
  return keys.reduce((out, key) => source[key] === undefined ? out : { ...out, [key]: source[key] }, {});
}

function compareByTimeThenId(a, b) {
  return String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id));
}

function compareByPriorityThenDue(a, b) {
  return priorityRank(a.priority) - priorityRank(b.priority) || String(a.dueAt).localeCompare(String(b.dueAt));
}

function priorityRank(priority) {
  return ({ P0: 0, P1: 1, P2: 2, P3: 3 })[priority] ?? 2;
}

function serviceStateRank(state) {
  return ({ operational: 0, resolved: 0, recovering: 1, degraded: 2, down: 3 })[state] ?? 0;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function hash(value) {
  let h = 0;
  for (const char of String(value)) h = ((h << 5) - h + char.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}
