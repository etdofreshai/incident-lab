# Incident Lab

Incident Lab is a medium-large Autopilot evaluation project: a local-first incident command simulator and operations dashboard.

## Running locally

This slice uses vanilla browser modules and deterministic Node tests; no external services or build step are required.

```bash
npm test
npm run check
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Implemented slice

- Pure incident model/reducer with deterministic normalization.
- Built-in checkout latency scenario and step-through simulator.
- Dashboard shell for command state, service impact, timeline, actions, brief, and postmortem draft.
- LocalStorage persistence plus JSON export/import and download.
- Automated tests for reducer effects, metrics, generated briefs, postmortems, and JSON round-trip.

It is more complex than Trailmix but still bounded: no external services, no real paging, no cloud APIs. Everything should run locally in the browser and with deterministic tests.

## Product goal

Build a browser app that helps a small team simulate, manage, and review production incidents.

Core user stories:

1. Create or load an incident with title, severity, status, affected services, commander, start time, and current hypothesis.
2. Maintain an append-only event timeline with typed entries: detection, impact update, mitigation, decision, comms, customer report, metric observation, handoff, resolution.
3. Track action items with owner, priority, due time, status, and links to timeline events.
4. Maintain service impact state: degraded/down/recovering/resolved, customer-visible flag, estimated affected users, error budget burn.
5. Generate an incident brief: current status, latest impact, open actions, next update time, risks, and recommended next steps.
6. Simulate incoming event streams from built-in scenarios and let the dashboard update derived state.
7. Export/import incident JSON.
8. Produce a postmortem draft from the timeline: summary, contributing factors, what went well, what went poorly, follow-ups.

## Evaluation focus

Autopilot should demonstrate:

- multi-module design;
- domain modeling and derived-state logic;
- deterministic tests for incident state reducers/summarizers;
- UI that remains usable as data grows;
- meaningful learning records after each run;
- start/finish/every-N Telegram notifications from Control Tower.

## Suggested stack

Use vanilla JS/HTML/CSS or another lightweight browser stack only if justified. Keep pure logic in testable modules.

## First useful slice

A strong first iteration should include:

- sample incident scenario data;
- pure reducer/model functions for timeline → incident state;
- dashboard shell showing severity/status/timeline/actions/services;
- ability to add at least one timeline event/action;
- generated incident brief;
- localStorage persistence;
- JSON export/import;
- tests for reducers and brief generation.

## Constraints

- Do not call external monitoring, map, AI, Slack, PagerDuty, or ticketing APIs.
- Keep data local and deterministic.
- Commit and push verified changes each loop when possible.
