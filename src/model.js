export function severityRank(severity = 'SEV3') {
  return ({ SEV1: 1, SEV2: 2, SEV3: 3, SEV4: 4 })[severity] || 3;
}

export function emptyIncident() {
  return {
    title: 'Untitled incident',
    severity: 'SEV3',
    status: 'investigating',
    services: [],
    timeline: [],
    actions: []
  };
}
