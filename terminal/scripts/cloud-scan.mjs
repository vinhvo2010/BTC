import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeScan } from "../lib/journal.js";
import { persistScan } from "../lib/store.js";
import { RELEASE } from "../lib/provenance.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const directory=process.env.SCM_STATE_DIR||path.join(root,"data/scm15");
const endpoint=new URL(process.env.SCM_TERMINAL_URL||"https://skydeal.app/api/live");
if(endpoint.protocol!=="https:" || !["skydeal.app","scmv3-signal15.vercel.app"].includes(endpoint.hostname) ||
   endpoint.pathname!=="/api/live")throw new Error("UNAPPROVED_SCAN_ENDPOINT");
endpoint.searchParams.set("evidence","1");
const requestedAt=Date.now();
let payload,httpStatus=null,error=null;
try {
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(65000),cache:"no-store",
    headers:{Accept:"application/json"}});
  httpStatus=response.status;
  if(!response.ok)throw new Error("API_HTTP_"+response.status);
  payload=await response.json();
  if(payload.release?.codeHash!==RELEASE.codeHash || payload.release?.configHash!==RELEASE.configHash)
    throw new Error("SOURCE_RELEASE_MISMATCH");
} catch(e) { error=e.message==="SOURCE_RELEASE_MISMATCH"?e.message:"PUBLIC_API_READ_FAILED"; }
const receivedAt=Date.now();
let exitCode=0;
if(!error) {
  try { makeScan(payload,{requestedAt,receivedAt,httpStatus}); }
  catch(e) { error=e.message;exitCode=2; }
}
if(error) {
  payload={mode:"SHADOW",executionEnabled:false,actualOrdersEnabled:false,paperOrderCreated:false,
    tradePermission:"NO_TRADE",signal:null,release:RELEASE,model:"SCM15_RESEARCH_MULTIFRAME_V3",
    status:"DATA_BLOCKED",reason:error,runAt:receivedAt,sourceErrors:{PUBLIC_API:error},
    sourceEvidence:{},assessments:{}};
}
const scan=makeScan(payload,{requestedAt,receivedAt,httpStatus,
  endpoint:endpoint.origin+endpoint.pathname,commitSha:process.env.GITHUB_SHA??null,
  workflowRunId:process.env.GITHUB_RUN_ID??null,transportError:error,
  timer:process.env.SCM_SCHEDULED_AT?{scheduledAt:Number(process.env.SCM_SCHEDULED_AT),kind:process.env.SCM_TICK_KIND}:null});
const saved=persistScan(directory,scan);
console.log(JSON.stringify({runId:scan.runId,at:new Date(receivedAt).toISOString(),
  status:payload.status,sourceHealth:saved.state.sourceHealth,newRecords:saved.newRecords,
  sourceErrors:payload.sourceErrors,codeHash:RELEASE.codeHash,
  mode:"SHADOW",executionEnabled:false}));
process.exitCode=exitCode;
