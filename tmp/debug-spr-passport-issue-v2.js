process.env.DATABASE_URL = "";
import { mutateDb, createId } from '../lib/server/data-store.js';
import { createSession } from '../lib/server/auth.js';
import { handleApiRequest } from '../lib/server/api-router.js';

function makeRes(){
  return {statusCode:200,headers:{},body:'',setHeader(n,v){this.headers[n]=v;},writeHead(c,h){this.statusCode=c;this.headers={...this.headers,...h};},end(p){this.body=p;}};
}

async function run(){
  await mutateDb((db)=>{db.users=[];db.workspaces=[];db.workspaceMembers=[];db.msps=[];db.mspMembers=[];db.sessions=[];db.sprVendors=[];db.sprSoftware=[];db.sprEvidence=[];db.sprPassports=[];db.sprAuditLogs=[];});
  const now=new Date().toISOString();
  const user={id:createId('user','spr'),name:'SPR User',email:'spr@test.local',passwordHash:'hash',createdAt:now,updatedAt:now};
  await mutateDb((db)=>db.users.push(user));
  const workspace={id:createId('workspace','spr-workspace'),name:'SPR Workspace',createdAt:now,updatedAt:now};
  await mutateDb((db)=>{db.workspaces.push(workspace); db.workspaceMembers.push({id:createId('member',`${user.id}-${workspace.id}`),workspaceId:workspace.id,userId:user.id,role:'Owner',createdAt:now});});
  const session=await createSession(user.id,{workspaceId:workspace.id});
  console.log('session', session);

  const vendorReq={method:'POST',url:'/api/spr/vendors',headers:{cookie:`ventureos_session=${session.token}`,'content-type':'application/json'},body:JSON.stringify({name:'Contoso Security',domain:'contoso.example',email:'security@contoso.example',country:'US',complianceClaims:['SOC2','ISO27001']})};
  const vendorRes=makeRes(); await handleApiRequest(vendorReq,vendorRes);
  console.log('vendorRes', vendorRes.statusCode, vendorRes.body);
  const vendor = vendorRes.body ? JSON.parse(vendorRes.body).vendor : null;
  console.log('vendor', vendor);

  const softwareReq={method:'POST',url:'/api/spr/software',headers:{cookie:`ventureos_session=${session.token}`,'content-type':'application/json'},body:JSON.stringify({name:'Contoso Trust Agent',vendorId:vendor?.id,repositoryUrl:'https://github.com/contoso/trust-agent',packageName:'@contoso/trust-agent',version:'1.2.3',ecosystem:'npm'})};
  const softwareRes=makeRes(); await handleApiRequest(softwareReq,softwareRes);
  console.log('softwareRes', softwareRes.statusCode, softwareRes.body);
  const software = softwareRes.body ? JSON.parse(softwareRes.body).software : null;
  console.log('software', software);

  const evidenceReq={method:'POST',url:'/api/spr/evidence',headers:{cookie:`ventureos_session=${session.token}`,'content-type':'application/json'},body:JSON.stringify({softwareId:software?.id,type:'sbom',title:'CycloneDX SBOM',summary:'Generated from release pipeline',uri:'https://example.com/sbom.json',strength:0.9,freshnessDays:7,verified:true})};
  const evidenceRes=makeRes(); await handleApiRequest(evidenceReq,evidenceRes);
  console.log('evidenceRes', evidenceRes.statusCode, evidenceRes.body);
  const evidence = evidenceRes.body ? JSON.parse(evidenceRes.body).evidence : null;
  console.log('evidence', evidence);

  const privacyReq={method:'POST',url:`/api/spr/evidence/${evidence?.id}/privacy`,headers:{cookie:`ventureos_session=${session.token}`,'content-type':'application/json'},body:JSON.stringify({visibility:'restricted',accessToken:`${vendor?.id}:workspace-1:restricted`,vendorId:vendor?.id,workspaceId:'workspace-1'})};
  const privacyRes=makeRes(); await handleApiRequest(privacyReq,privacyRes);
  console.log('privacyRes', privacyRes.statusCode, privacyRes.body);

  const passportReq={method:'POST',url:'/api/spr/passports/issue',headers:{cookie:`ventureos_session=${session.token}`,'content-type':'application/json'},body:JSON.stringify({softwareId:software?.id,visibility:'restricted',issuedBy:user.name,accessToken:`${vendor?.id}:workspace-1:restricted`,vendorId:vendor?.id,workspaceId:'workspace-1'})};
  const passportRes=makeRes(); await handleApiRequest(passportReq,passportRes);
  console.log('passportRes', passportRes.statusCode, passportRes.body);
}
run().catch((err)=>{console.error(err);process.exit(1);});