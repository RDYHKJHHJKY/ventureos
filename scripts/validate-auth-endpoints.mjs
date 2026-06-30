import { request } from 'node:http';

function makeUniqueTestEmail() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `test-user+${suffix}@ventureos.local`;
}

function isSuccessfulResponse(res, expectedStatus) {
  const okFlag = res.body?.ok;
  const statusOk = res.statusCode === expectedStatus;
  const okValue = typeof okFlag === 'boolean' ? okFlag : true;
  return statusOk && okValue;
}

async function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          const json = raw ? JSON.parse(raw) : null;
          resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}\n${raw}`));
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.setHeader('Content-Type', 'application/json');
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  const base = { hostname: '127.0.0.1', port: 5173, method: 'POST', path: '' };
  const signupPayload = {
    name: 'Test User',
    email: makeUniqueTestEmail(),
    password: 'password123',
    workspaceName: 'Test Workspace',
  };
  const loginPayload = { email: signupPayload.email, password: signupPayload.password };

  console.log('Validating auth endpoints against local server...');

  const signupRes = await requestJson({ ...base, path: '/api/auth/signup' }, signupPayload);
  console.log('SIGNUP:', signupRes.statusCode, isSuccessfulResponse(signupRes, 201) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(signupRes, 201)) throw new Error('Signup failed: ' + JSON.stringify(signupRes.body));

  const cookies = signupRes.headers['set-cookie'] || [];
  if (!cookies.length) throw new Error('Signup did not set cookies');
  const sessionCookie = cookies.find((cookie) => cookie.startsWith('ventureos_session='));
  if (!sessionCookie) throw new Error('Missing session cookie after signup');

  const sessionRes = await requestJson({
    ...base,
    method: 'GET',
    path: '/api/auth/session',
    headers: { cookie: sessionCookie },
  });
  console.log('SESSION:', sessionRes.statusCode, isSuccessfulResponse(sessionRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(sessionRes, 200)) throw new Error('Session check failed: ' + JSON.stringify(sessionRes.body));

  const logoutRes = await requestJson({
    ...base,
    path: '/api/auth/logout',
    method: 'POST',
    headers: { cookie: sessionCookie },
  });
  console.log('LOGOUT:', logoutRes.statusCode, isSuccessfulResponse(logoutRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(logoutRes, 200)) throw new Error('Logout failed: ' + JSON.stringify(logoutRes.body));

  const loginRes = await requestJson({ ...base, path: '/api/auth/login' }, loginPayload);
  console.log('LOGIN:', loginRes.statusCode, isSuccessfulResponse(loginRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(loginRes, 200)) throw new Error('Login failed: ' + JSON.stringify(loginRes.body));
  const loginCookies = loginRes.headers['set-cookie'] || [];
  const loginSessionCookie = loginCookies.find((cookie) => cookie.startsWith('ventureos_session='));
  if (!loginSessionCookie) throw new Error('Missing session cookie after login');

  const loginSessionRes = await requestJson({
    ...base,
    method: 'GET',
    path: '/api/auth/session',
    headers: { cookie: loginSessionCookie },
  });
  console.log('SESSION AFTER LOGIN:', loginSessionRes.statusCode, isSuccessfulResponse(loginSessionRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(loginSessionRes, 200)) throw new Error('Session check after login failed: ' + JSON.stringify(loginSessionRes.body));

  const demoRes = await requestJson({ ...base, path: '/api/auth/demo-login' });
  console.log('DEMO-LOGIN:', demoRes.statusCode, isSuccessfulResponse(demoRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(demoRes, 200)) throw new Error('Demo login failed: ' + JSON.stringify(demoRes.body));

  console.log('\nAuth endpoint validation completed successfully.');
}

main().catch((err) => {
  console.error('AUTH VALIDATION FAILED:', err);
  process.exit(1);
});
