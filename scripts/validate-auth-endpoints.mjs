import { request } from 'node:http';

function makeUniqueTestEmail() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `test-user+${suffix}@ventureos.local`;
}

function cookieHeaderFromSetCookie(setCookie) {
  if (!setCookie) return '';
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

function cookieValue(cookieHeader, name) {
  const match = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
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
  const baseHeaders = { Accept: 'application/json' };
  const base = { hostname: '127.0.0.1', port: 5173, method: 'POST', path: '', headers: baseHeaders };
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

  const signupCookieHeader = cookieHeaderFromSetCookie(signupRes.headers['set-cookie']);
  if (!signupCookieHeader.includes('ventureos_session=')) throw new Error('Missing session cookie after signup');

  const sessionRes = await requestJson({
    ...base,
    method: 'GET',
    path: '/api/auth/session',
    headers: { ...baseHeaders, Cookie: signupCookieHeader },
  });
  console.log('SESSION:', sessionRes.statusCode, isSuccessfulResponse(sessionRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(sessionRes, 200)) throw new Error('Session check failed: ' + JSON.stringify(sessionRes.body));

  const csrfToken = cookieValue(signupCookieHeader, 'ventureos_csrf');
  const logoutRes = await requestJson({
    ...base,
    path: '/api/auth/logout',
    method: 'POST',
    headers: { ...baseHeaders, Cookie: signupCookieHeader, ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
  });
  console.log('LOGOUT:', logoutRes.statusCode, isSuccessfulResponse(logoutRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(logoutRes, 200)) throw new Error('Logout failed: ' + JSON.stringify(logoutRes.body));

  const loginRes = await requestJson({ ...base, path: '/api/auth/login' }, loginPayload);
  console.log('LOGIN:', loginRes.statusCode, isSuccessfulResponse(loginRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(loginRes, 200)) throw new Error('Login failed: ' + JSON.stringify(loginRes.body));

  const loginCookieHeader = cookieHeaderFromSetCookie(loginRes.headers['set-cookie']);
  if (!loginCookieHeader.includes('ventureos_session=')) throw new Error('Missing session cookie after login');

  const loginSessionRes = await requestJson({
    ...base,
    method: 'GET',
    path: '/api/auth/session',
    headers: { ...baseHeaders, Cookie: loginCookieHeader },
  });
  console.log('SESSION AFTER LOGIN:', loginSessionRes.statusCode, isSuccessfulResponse(loginSessionRes, 200) ? 'OK' : 'FAIL');
  if (!isSuccessfulResponse(loginSessionRes, 200)) throw new Error('Session check after login failed: ' + JSON.stringify(loginSessionRes.body));

  console.log('\nAuth endpoint validation completed successfully.');
}

main().catch((err) => {
  console.error('AUTH VALIDATION FAILED:', err);
  process.exit(1);
});
