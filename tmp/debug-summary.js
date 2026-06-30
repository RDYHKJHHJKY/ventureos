import { createId, mutateDb, createMsp, createWorkspaceForMsp } from './lib/server/data-store.js';
import { createSession } from './lib/server/auth.js';
import { handleApiRequest } from './lib/server/api-router.js';

function makeRes(){
  return {statusCode:200,headers:{},body:'',setHeader(n,v){this.headers[n]=v;},writeHead(c,h){this.statusCode=c; this.headers={...this.headers,...h};},end(b){this.body=b;}};
}

async function requestJson(path, token){
  const req={method:'GET',url:path,headers:token?{cookie:`ventureos_session=${token}`}:{} };
  const res=makeRes();
  await handleApiRequest(req,res);
  return {status:res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

async function main(){
  await mutateDb(db=>{db.users=[];db.workspaces=[];db.workspaceMembers=[];db.msps=[];db.mspMembers=[];db.sessions=[];db.assets=[];db.scanRuns=[];db.scanFindings=[];db.passports=[];db.projectEvents=[];db.billingUsage=[];});
  const user = await mutateDb(db=>{const now=new Date().toISOString(); const record={id:createId('user','msp-summary'),name:'Summary User',email:'summary@test.local',passwordHash:'hash',createdAt:now,updatedAt:now}; db.users.push(record); return record;});
  const { msp } = await mutateDb(db=>createMsp(db,{name:'Summary MSP',billingEmail:'billing@summary.local',region:'us-east-1',ownerUserId:user.id}));
  await mutateDb(db=>{const target=db.msps.find(item=>item.id===msp.id); if(target){ target.billingStatus='active'; target.updatedAt=new Date().toISOString(); }});
  const workspace = await mutateDb(db=>createWorkspaceForMsp(db,{mspId:msp.id,name:'Client Workspace',ownerUserId:user.id}));
  await mutateDb(db=>{const now=new Date().toISOString(); db.assets.push({id:createId('asset',workspace.id),workspaceId:workspace.id,name:'Alpha Asset',createdAt:now,updatedAt:now,latestTrustScore:80,latestConfidenceScore:90,risk:'High',passportStatus:'Active',monitoringStatus:'Active'});
    db.scanRuns.push({id:createId('scan',workspace.id),workspaceId:workspace.id,createdAt:now,completedAt:now,trustScore:80,confidenceScore:90,verdict:'Verified',risk:82,scores:{security:0.8,engineering:0.7,business:0.6,product:0.5}});
    db.passports.push({id:createId('passport',workspace.id),workspaceId:workspace.id,assetId:db.assets[0].id,createdAt:now,issuedAt:now,trustScore:80,version:1,revoked:false});
    db.projectEvents.push({id:createId('event',workspace.id),workspaceId:workspace.id,type:'SCAN_COMPLETED',timestamp:now,createdAt:now});
    db.billingUsage.push({id:createId('billingusage',msp.id),mspId:msp.id,type:'metered',description:'Scan usage',quantity:2,amountCents:200,currency:'USD',recordedAt:now,month:now.slice(0,7)});
  });
  const session = await createSession(user.id);
  const summary = await requestJson(`/api/msp/${msp.id}/summary`, session.token);
  console.log(JSON.stringify(summary,null,2));
}

main().catch(err=>{console.error(err);process.exit(1);});
