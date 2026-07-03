import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

function makeUniqueTestEmail() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `deploy-smoke+${suffix}@ventureos.local`;
}

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const requestFn = options.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = requestFn(options, (res) => {
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

function normalizeBaseUrl(baseUrl) {
  if (!/^[a-zA-Z]+:/.test(baseUrl)) {
    return `https://${baseUrl}`;
  }
  return baseUrl;
}

function cookieHeaderFromSetCookie(setCookie) {
  if (!setCookie) return '';
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

function isOk(res, statusCode) {
  return res.statusCode === statusCode && res.body?.ok !== false;
}

async function main() {
  const rawUrl = process.env.VERCEL_URL || process.env.VERCEL_PREVIEW_URL || process.env.VERCEL_PRODUCTION_URL || 'http://127.0.0.1:5173';
  const normalizedUrl = normalizeBaseUrl(rawUrl);
  const url = new URL(normalizedUrl);
  const baseOptions = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    protocol: url.protocol,
    headers: { Accept: 'application/json' },
  };

  console.log(`Validating deployment at ${normalizedUrl}`);

  const signupPayload = {
    name: 'Deploy Smoke User',
    email: makeUniqueTestEmail(),
    password: 'password123',
    workspaceName: 'Deploy Smoke Workspace',
  };

  const signupRes = await requestJson({
    ...baseOptions,
    method: 'POST',
    path: '/api/auth/signup',
  }, signupPayload);

  console.log('SIGNUP:', signupRes.statusCode, isOk(signupRes, 201) ? 'OK' : 'FAIL');
  if (!isOk(signupRes, 201)) {
    throw new Error(`Signup failed: ${JSON.stringify(signupRes.body)}`);
  }

  const cookieHeader = cookieHeaderFromSetCookie(signupRes.headers['set-cookie']);
  if (!cookieHeader.includes('ventureos_session=')) {
    throw new Error('Signup did not return a session cookie');
  }

  const sessionRes = await requestJson({
    ...baseOptions,
    method: 'GET',
    path: '/api/auth/session',
    headers: { ...baseOptions.headers, Cookie: cookieHeader },
  });

  console.log('SESSION:', sessionRes.statusCode, isOk(sessionRes, 200) ? 'OK' : 'FAIL');
  if (!isOk(sessionRes, 200)) {
    throw new Error(`Session check failed: ${JSON.stringify(sessionRes.body)}`);
  }

  console.log('Deployment auth smoke tests passed successfully.');
}

main().catch((err) => {
  console.error('DEPLOY VALIDATION FAILED:', err.message || err);
  process.exit(1);
});
