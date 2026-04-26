import {
  emptyIncident,
  reduceIncident,
  deriveIncidentMetrics,
  generateIncidentBrief,
  generatePostmortemDraft,
  parseIncidentJson,
  serializeIncident
} from './model.js';
import { scenarios, buildScenarioIncident } from './scenarios.js';

const STORAGE_KEY = 'incident-lab/current-incident';
const els = {};
let state = loadIncident();
let scenarioIndex = -1;
let selectedScenario = scenarios[0];

const bindings = ['title', 'severity', 'status', 'commander', 'hypothesis', 'nextUpdateAt', 'services', 'timeline', 'actions', 'brief', 'postmortem', 'eventKind', 'eventSummary', 'actionTitle', 'actionOwner', 'scenarioSelect', 'scenarioProgress', 'jsonBox'];

window.addEventListener('DOMContentLoaded', () => {
  for (const id of bindings) els[id] = document.getElementById(id);
  document.getElementById('incidentForm').addEventListener('input', updateIncidentFields);
  document.getElementById('addEvent').addEventListener('click', addTimelineEvent);
  document.getElementById('addAction').addEventListener('click', addAction);
  document.getElementById('loadScenario').addEventListener('click', loadScenario);
  document.getElementById('stepScenario').addEventListener('click', stepScenario);
  document.getElementById('exportJson').addEventListener('click', exportJson);
  document.getElementById('importJson').addEventListener('click', importJson);
  document.getElementById('reset').addEventListener('click', resetIncident);
  document.getElementById('downloadJson').addEventListener('click', downloadJson);
  els.scenarioSelect.innerHTML = scenarios.map((scenario) => `<option value="${scenario.id}">${escapeHtml(scenario.name)}</option>`).join('');
  render();
});

function updateIncidentFields() {
  state = reduceIncident(state, {
    type: 'incident/update',
    title: els.title.value,
    severity: els.severity.value,
    status: els.status.value,
    commander: els.commander.value,
    currentHypothesis: els.hypothesis.value,
    nextUpdateAt: localToIso(els.nextUpdateAt.value)
  });
  persistAndRender();
}

function addTimelineEvent() {
  if (!els.eventSummary.value.trim()) return;
  state = reduceIncident(state, {
    type: 'timeline/add',
    event: {
      at: new Date().toISOString(),
      kind: els.eventKind.value,
      actor: state.commander || 'operator',
      summary: els.eventSummary.value.trim()
    }
  });
  els.eventSummary.value = '';
  persistAndRender();
}

function addAction() {
  if (!els.actionTitle.value.trim()) return;
  state = reduceIncident(state, {
    type: 'action/add',
    action: {
      title: els.actionTitle.value.trim(),
      owner: els.actionOwner.value.trim(),
      priority: 'P1'
    }
  });
  els.actionTitle.value = '';
  els.actionOwner.value = '';
  persistAndRender();
}

function loadScenario() {
  selectedScenario = scenarios.find((scenario) => scenario.id === els.scenarioSelect.value) || scenarios[0];
  scenarioIndex = -1;
  state = selectedScenario.incident;
  persistAndRender();
}

function stepScenario() {
  selectedScenario = scenarios.find((scenario) => scenario.id === els.scenarioSelect.value) || scenarios[0];
  scenarioIndex = Math.min(scenarioIndex + 1, selectedScenario.events.length - 1);
  state = buildScenarioIncident(selectedScenario.id, scenarioIndex);
  persistAndRender();
}

function exportJson() {
  els.jsonBox.value = serializeIncident(state);
}

function importJson() {
  try {
    state = parseIncidentJson(els.jsonBox.value);
    scenarioIndex = -1;
    persistAndRender();
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

function resetIncident() {
  state = emptyIncident({ startedAt: new Date().toISOString() });
  scenarioIndex = -1;
  persistAndRender();
}

function downloadJson() {
  const blob = new Blob([serializeIncident(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${state.id || 'incident'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, serializeIncident(state));
  render();
}

function render() {
  const metrics = deriveIncidentMetrics(state);
  const brief = generateIncidentBrief(state, new Date().toISOString());
  els.title.value = state.title;
  els.severity.value = state.severity;
  els.status.value = state.status;
  els.commander.value = state.commander;
  els.hypothesis.value = state.currentHypothesis;
  els.nextUpdateAt.value = isoToLocal(state.nextUpdateAt);
  els.services.innerHTML = state.services.map(renderService).join('') || '<li class="muted">No affected services yet.</li>';
  els.timeline.innerHTML = state.timeline.map(renderTimelineEvent).join('') || '<li class="muted">No events yet.</li>';
  els.actions.innerHTML = state.actions.map(renderAction).join('') || '<li class="muted">No action items yet.</li>';
  els.brief.innerHTML = `
    <h3>${escapeHtml(brief.headline)}</h3>
    <p><strong>Commander:</strong> ${escapeHtml(brief.commander)} · <strong>Visible:</strong> ${metrics.customerVisible ? 'yes' : 'no'} · <strong>Affected users:</strong> ${metrics.affectedUsers.toLocaleString()}</p>
    <p>${escapeHtml(brief.currentStatus)}</p>
    <p><strong>Latest impact:</strong> ${escapeHtml(brief.latestImpact)}</p>
    <p><strong>Next update:</strong> ${escapeHtml(formatTime(brief.nextUpdateAt))}</p>
    <h4>Open actions</h4>${listOrMuted(brief.openActions)}
    <h4>Risks</h4>${listOrMuted(brief.risks)}
    <h4>Recommended next steps</h4>${listOrMuted(brief.recommendedNextSteps)}
  `;
  els.postmortem.value = generatePostmortemDraft(state);
  els.scenarioProgress.textContent = selectedScenario ? `${Math.max(0, scenarioIndex + 1)} / ${selectedScenario.events.length} events applied` : '';
}

function renderService(service) {
  return `<li><strong>${escapeHtml(service.name)}</strong> <span class="pill ${service.state}">${service.state}</span><br><span class="muted">${service.customerVisible ? 'Customer visible' : 'Internal'} · ${service.affectedUsers.toLocaleString()} users · ${service.errorBudgetBurn}% burn</span></li>`;
}

function renderTimelineEvent(event) {
  return `<li><time>${formatTime(event.at)}</time><strong>${escapeHtml(event.kind)}</strong><p>${escapeHtml(event.summary)}</p>${event.actor ? `<span class="muted">by ${escapeHtml(event.actor)}</span>` : ''}</li>`;
}

function renderAction(action) {
  return `<li><strong>${escapeHtml(action.title)}</strong> <span class="pill">${action.priority}</span><br><span class="muted">${escapeHtml(action.owner || 'Unowned')} · ${action.status}${action.dueAt ? ` · due ${formatTime(action.dueAt)}` : ''}</span></li>`;
}

function loadIncident() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseIncidentJson(stored) : buildScenarioIncident('checkout-latency', 1);
  } catch {
    return buildScenarioIncident('checkout-latency', 1);
  }
}

function listOrMuted(items) {
  return items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">None.</p>';
}

function formatTime(value) {
  if (!value || value === 'Not scheduled') return value || 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function isoToLocal(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 16);
}

function localToIso(value) {
  return value ? new Date(value).toISOString() : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}
