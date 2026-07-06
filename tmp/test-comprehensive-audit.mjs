import { registerUser, createSession } from '../lib/server/auth.js';
import { handleApiRequest } from '../lib/server/api-router.js';
import { readDb, mutateDb } from '../lib/server/data-store.js';

const makeRes = () => ({
  statusCode: 200,
  headers: {},
  body: '',
  setHeader(n, v) { this.headers[n] = v; },
  writeHead(c, h) { this.statusCode = c; this.headers = { ...this.headers, ...h }; },
  end(p) { this.body = p; }
});

const callApi = async (method, url, payload, token) => {
  const req = { method, url, headers: { ...(token ? { cookie: `ventureos_session=${token}` } : {}) } };
  if (payload) { req.body = JSON.stringify(payload); req.headers['content-type'] = 'application/json'; }
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
};

console.log('\n════════════════════════════════════════════════════');
console.log('        COMPREHENSIVE FUNCTIONALITY AUDIT');
console.log('════════════════════════════════════════════════════\n');

// TEST 1: AUTHENTICATION
console.log('TEST 1: AUTHENTICATION SYSTEM');
console.log('─────────────────────────────');
try {
  const user = await registerUser({
    name: 'Audit Test User',
    email: 'audit+' + Date.now() + '@test.local',
    password: 'testpass123',
    workspaceName: 'Audit Test WS'
  });
  console.log('✓ User registration');
  
  const session = await createSession(user.user.id, { workspaceId: user.workspace.id });
  console.log('✓ Session creation');
  
  const dbCheck = await readDb();
  console.log('✓ Database accessible');
  console.log(`  Users in DB: ${dbCheck.users.length}`);
} catch (e) {
  console.log(`✗ Auth failed: ${e.message}`);
  process.exit(1);
}

// TEST 2: CORE API ENDPOINTS
console.log('\nTEST 2: CORE API ENDPOINTS');
console.log('─────────────────────────────');
const user = await registerUser({
  name: 'API Test User',
  email: 'api+' + Date.now() + '@test.local',
  password: 'testpass123',
  workspaceName: 'API Test WS'
});
const session = await createSession(user.user.id, { workspaceId: user.workspace.id });

const endpoints = [
  { method: 'GET', path: '/api/workspaces', shouldAuth: true },
  { method: 'GET', path: '/api/auth/session', shouldAuth: true },
];

for (const endpoint of endpoints) {
  try {
    const res = await callApi(endpoint.method, endpoint.path, null, endpoint.shouldAuth ? session.token : null);
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log(`✓ ${endpoint.method} ${endpoint.path}`);
    } else {
      console.log(`✗ ${endpoint.method} ${endpoint.path} - Status: ${res.statusCode}`);
    }
  } catch (e) {
    console.log(`✗ ${endpoint.method} ${endpoint.path} - Error: ${e.message}`);
  }
}

// TEST 3: ADMIN ENDPOINTS (requires admin role - will fail gracefully)
console.log('\nTEST 3: ADMIN ENDPOINTS');
console.log('─────────────────────────────');
const adminEndpoints = [
  '/api/admin/dashboard-stats',
  '/api/admin/system-health',
  '/api/admin/transactions',
  '/api/admin/reviews',
  '/api/admin/referrals',
  '/api/admin/error-logs',
  '/api/admin/performance-metrics',
  '/api/admin/users',
];

for (const path of adminEndpoints) {
  try {
    const res = await callApi('GET', path, null, session.token);
    if (res.statusCode === 200) {
      console.log(`✓ GET ${path}`);
    } else if (res.statusCode === 403) {
      console.log(`⚠ GET ${path} - Forbidden (user not admin, expected)`);
    } else {
      console.log(`✗ GET ${path} - Status: ${res.statusCode}`);
    }
  } catch (e) {
    console.log(`✗ GET ${path} - Error: ${e.message}`);
  }
}

// TEST 4: DATA PERSISTENCE
console.log('\nTEST 4: DATA PERSISTENCE');
console.log('─────────────────────────────');
try {
  const dbBefore = await readDb();
  const sprCountBefore = (dbBefore.sprSoftware || []).length;
  
  // Direct mutateDb call
  await mutateDb((db) => {
    db.sprSoftware = db.sprSoftware || [];
    db.sprSoftware.push({
      id: 'audit_test_' + Date.now(),
      name: 'Audit Test Software',
      vendorId: 'vendor_test',
      repositoryUrl: 'https://example.com',
      packageName: 'test',
      version: '1.0.0',
      ecosystem: 'npm',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return true;
  });
  
  const dbAfter = await readDb();
  const sprCountAfter = (dbAfter.sprSoftware || []).length;
  
  if (sprCountAfter > sprCountBefore) {
    console.log('✓ Direct mutateDb persists to file');
    console.log(`  Before: ${sprCountBefore}, After: ${sprCountAfter}`);
  } else {
    console.log('✗ Direct mutateDb - data not persisted');
  }
} catch (e) {
  console.log(`✗ Data persistence test failed: ${e.message}`);
}

// TEST 5: SPR ENDPOINTS (CREATE/READ)
console.log('\nTEST 5: SPR ENDPOINTS');
console.log('─────────────────────────────');
try {
  // Create vendor
  const vendorRes = await callApi('POST', '/api/spr/vendors', {
    name: 'Audit Test Vendor',
    domain: 'audit.test.local',
    email: 'vendor@audit.test',
    country: 'US',
    complianceClaims: ['SOC2']
  }, session.token);
  
  if (vendorRes.statusCode === 201) {
    console.log('✓ POST /api/spr/vendors');
    const vendorId = vendorRes.payload?.vendor?.id;
    console.log(`  Created vendor: ${vendorId}`);
    
    // Create software
    const softwareRes = await callApi('POST', '/api/spr/software', {
      name: 'Audit Test Software',
      vendorId: vendorId,
      repositoryUrl: 'https://github.com/audit/test',
      packageName: '@audit/test',
      version: '1.0.0',
      ecosystem: 'npm'
    }, session.token);
    
    if (softwareRes.statusCode === 201) {
      console.log('✓ POST /api/spr/software');
      const softwareId = softwareRes.payload?.software?.id;
      console.log(`  Created software: ${softwareId}`);
      
      // Verify persistence
      const dbCheck = await readDb();
      const found = (dbCheck.sprSoftware || []).some(s => s.id === softwareId);
      if (found) {
        console.log('✓ SPR software persisted to database');
      } else {
        console.log('✗ SPR software NOT persisted (BUG)');
      }
    } else {
      console.log(`✗ POST /api/spr/software - Status: ${softwareRes.statusCode}`);
    }
  } else {
    console.log(`✗ POST /api/spr/vendors - Status: ${vendorRes.statusCode}`);
  }
} catch (e) {
  console.log(`✗ SPR endpoints test failed: ${e.message}`);
}

// TEST 6: FRONTEND COMPONENTS EXIST
console.log('\nTEST 6: FRONTEND COMPONENTS');
console.log('─────────────────────────────');
import fs from 'fs';
import path from 'path';

const checkFile = (filePath, componentName) => {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.length > 100) {
        console.log(`✓ ${componentName} component exists and has content`);
        return true;
      } else {
        console.log(`✗ ${componentName} component exists but is empty`);
        return false;
      }
    } else {
      console.log(`✗ ${componentName} component file not found`);
      return false;
    }
  } catch (e) {
    console.log(`✗ ${componentName} check failed: ${e.message}`);
    return false;
  }
};

checkFile('src/components/AdminDashboard/AdminDashboard.jsx', 'AdminDashboard');
checkFile('src/components/UniversalCommandBar.tsx', 'UniversalCommandBar');
checkFile('src/components/PassportDashboard.jsx', 'PassportDashboard');
checkFile('src/App.jsx', 'App');

// TEST 7: BUILD & CONFIG
console.log('\nTEST 7: BUILD & PROJECT CONFIG');
console.log('─────────────────────────────');
try {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  console.log('✓ package.json valid');
  console.log(`  Version: ${pkgJson.version}`);
  console.log(`  React: ${pkgJson.dependencies?.react || 'not found'}`);
  
  if (fs.existsSync(path.join(process.cwd(), 'vite.config.js'))) {
    console.log('✓ vite.config.js exists');
  } else {
    console.log('✗ vite.config.js not found');
  }
  
  if (fs.existsSync(path.join(process.cwd(), '.data', 'ventureos-db.json'))) {
    const dbSize = fs.statSync(path.join(process.cwd(), '.data', 'ventureos-db.json')).size;
    console.log(`✓ Database file exists (${Math.round(dbSize / 1024)}KB)`);
  } else {
    console.log('✗ Database file not found');
  }
} catch (e) {
  console.log(`✗ Build/config check failed: ${e.message}`);
}

console.log('\n════════════════════════════════════════════════════');
console.log('                 AUDIT COMPLETE');
console.log('════════════════════════════════════════════════════\n');
