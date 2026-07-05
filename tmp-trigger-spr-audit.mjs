import { handleApiRequest } from './lib/server/api-router.js';

const req = { method: 'POST', url: '/api/spr/audit/trigger', headers: {} };
const res = {
  setHeader() {},
  writeHead() {},
  end(body) {
    console.log(body);
  }
};

await handleApiRequest(req, res);
