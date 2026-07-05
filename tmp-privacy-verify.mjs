import { handleApiRequest } from './lib/server/api-router.js';

const req = {
  method: 'POST',
  url: '/api/spr/standards',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ softwareId: 'demo-software', framework: 'soc2', title: 'SOC2 attestation', summary: 'Sample compliance evidence', visibility: 'public' }),
};
const res = {
  setHeader() {},
  writeHead() {},
  end(body) {
    console.log(body);
  }
};

await handleApiRequest(req, res);
