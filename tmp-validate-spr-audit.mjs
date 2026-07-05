import { handleApiRequest } from './lib/server/api-router.js';

const req = { method: 'GET', url: '/api/spr/audit/status', headers: {} };
const res = {
  setHeader() {},
  writeHead() {},
  end(body) {
    console.log(body);
  }
};

await handleApiRequest(req, res);
