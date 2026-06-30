import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

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

async function main() {
  const rawUrl = process.env.VERCEL_URL;
  if (!rawUrl) {
    throw new Error('Set VERCEL_URL to the deployed domain, e.g. https://your-app.vercel.app');
  }

  const normalizedUrl = normalizeBaseUrl(rawUrl);
  const url = new URL(normalizedUrl);
  const baseOptions = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    protocol: url.protocol,
    headers: { Accept: 'application/json' },
  };

  console.log(`Validating deployment at ${normalizedUrl}`);

  const demoLoginRes = await requestJson({
    ...baseOptions,
    method: 'POST',
    path: '/api/auth/demo-login',
  });

  console.log('DEMO LOGIN:', demoLoginRes.statusCode, demoLoginRes.body?.ok ? 'OK' : 'FAIL');
  if (demoLoginRes.statusCode !== 200 || !demoLoginRes.body?.ok) {
    throw new Error(`Demo login failed: ${JSON.stringify(demoLoginRes.body)}`);
  }

  const cookieHeader = cookieHeaderFromSetCookie(demoLoginRes.headers['set-cookie']);
  if (!cookieHeader) {
    throw new Error('Demo login did not return a session cookie');
  }

  const sessionRes = await requestJson({
    ...baseOptions,
    method: 'GET',
    path: '/api/auth/session',
    headers: { ...baseOptions.headers, Cookie: cookieHeader },
  });

  console.log('SESSION:', sessionRes.statusCode, sessionRes.body?.ok ? 'OK' : 'FAIL');
  if (sessionRes.statusCode !== 200 || !sessionRes.body?.ok) {
    throw new Error(`Session check failed: ${JSON.stringify(sessionRes.body)}`);
  }

  console.log('Deployment auth smoke tests passed successfully.');
}

main().catch((err) => {
  console.error('DEPLOY VALIDATION FAILED:', err.message || err);
  process.exit(1);
});
