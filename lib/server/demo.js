export function generateDemoWorkspace() {
  return {
    id: 'demo-workspace',
    name: 'Demo Workspace',
    createdAt: new Date().toISOString(),
  };
}

export function generateDemoMsp() {
  return {
    id: 'demo-msp',
    name: 'Demo MSP',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}

export function generateDemoIntelligence(payload = {}) {
  return {
    ok: true,
    demo: true,
    payload,
  };
}

export function generateDemoExport(payload = {}) {
  return {
    ok: true,
    demo: true,
    payload,
  };
}
