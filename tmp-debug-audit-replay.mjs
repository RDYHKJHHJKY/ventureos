import { mutateDb, createId } from './lib/server/data-store.js';
import { createSession } from './lib/server/auth.js';
import { handleApiRequest } from './lib/server/api-router.js';

function makeRes(){
  return { statusCode:200, headers:{}, body:'', setHeader(n,v){this.headers[n]=v;}, writeHead(code,headers){this.statusCode=code;this.headers={...this.headers,...headers};}, end(payload){this.body=payload;} };
}

async function requestJson(pathname, method='GET', payload=null, token){
  const req={method, url:pathname, headers: token ? { cookie: `ventureos_session=${token}` } : {}};
  if (payload) { req.body = JSON.stringify(payload); req.headers['content-type'] = 'application/json'; }
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

async function main(){
  await mutateDb(db => { const collections=['users','workspaces','workspaceMembers','msps','mspMembers','sessions','assets','scanRuns','scanFindings','evidenceItems','passports','projects','projectArtifacts','projectDependencies','projectMetadata','projectSignals','projectScores','projectEvents','sprVendors','sprSoftware','sprEvidence','sprPassports','sprSignals','sprAuditLogs']; for (const name of collections) db[name]=[]; });
  const user = await mutateDb(db => { const now = new Date().toISOString(); const record={id:createId('user','spr'), name:'SPR User', email:'spr@test.local', passwordHash:'hash', createdAt:now, updatedAt:now}; db.users.push(record); return record; });
  const session = await createSession(user.id);
  const vendorResponse = await requestJson('/api/spr/vendors','POST',{name:'Contoso Security',domain:'contoso.example',email:'security@contoso.example',country:'US',complianceClaims:['SOC2','ISO27001']},session.token);
  console.log('vendor',vendorResponse);
  const softwareResponse = await requestJson('/api/spr/software','POST',{name:'Contoso Trust Agent',vendorId:vendorResponse.payload.vendor.id,repositoryUrl:'https://github.com/contoso/trust-agent',packageName:'@contoso/trust-agent',version:'1.2.3',ecosystem:'npm'},session.token);
  console.log('software',softwareResponse);
  const evidenceResponse = await requestJson('/api/spr/evidence','POST',{softwareId:softwareResponse.payload.software.id,type:'sbom',title:'CycloneDX SBOM',summary:'Generated from release pipeline',uri:'https://example.com/sbom.json',strength:0.9,freshnessDays:7,verified:true},session.token);
  console.log('evidence',evidenceResponse);
  const passportResponse = await requestJson('/api/spr/passports/issue','POST',{softwareId:softwareResponse.payload.software.id,visibility:'public',issuedBy:user.name},session.token);
  console.log('passport',passportResponse);
}

main().catch(err=>{console.error(err); process.exit(1);});
