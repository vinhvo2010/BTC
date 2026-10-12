import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import handler from "../api/live.js";
import { PARAMETERS, VERSION as LEGACY_VERSION } from "../lib/engine.js";
import { MULTIFRAME_VERSION, FRAME_BIAS_VERSION, FRAMES, SYMBOLS } from "../lib/multiframe.js";

const root=path.resolve(import.meta.dirname,"..");
const files=["lib/engine.js","lib/zones.js","lib/multiframe.js","api/live.js","api/feed.js","index.html"];
const codeHash=crypto.createHash("sha256");
for(const name of files){codeHash.update(name+"\0");codeHash.update(fs.readFileSync(path.join(root,name)));}
const modelConfig={legacyModel:LEGACY_VERSION,multiframeModel:MULTIFRAME_VERSION,
  frameBiasModel:FRAME_BIAS_VERSION,legacyParameters:PARAMETERS,frames:FRAMES,symbols:SYMBOLS,
  executionEnabled:false,paperOrderCreated:false};
const configHash=crypto.createHash("sha256").update(JSON.stringify(modelConfig)).digest("hex");
const response={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return data}};
await handler({method:"GET"},response);
const data=response.data;
if(!data||!Number.isInteger(data.runAt))throw new Error("SCAN_RESULT_INVALID");
const assessments=Object.fromEntries(SYMBOLS.map(symbol=>[symbol,
  Object.fromEntries(FRAMES.map(tf=>{
    const a=data.assessments?.[symbol]?.[tf];
    return [tf,a?{id:a.id,state:a.state,tradePermission:a.tradePermission,
      leaning:a.leaning,structure:a.structure,close:a.close,closedAt:a.closedAt,
      barCutoff:a.barCutoff,decisionAt:a.decisionAt,receivedAt:a.receivedAt,
      audit:a.audit,reasons:a.reasons,blockedBy:a.blockedBy,volume:a.volume,
      breakout:a.breakout,scenarios:a.scenarios,entry:a.entry,stop:a.stop,
      target:a.target,size:a.size,netRR:a.netRR,paperOrderCreated:a.paperOrderCreated}:null];
  }))]));
const summary={
  runAt:data.runAt,runAtUtc:new Date(data.runAt).toISOString(),
  runAtUtc7:new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",dateStyle:"short",timeStyle:"medium"}).format(data.runAt),
  model:data.model,modelConfig,configHash,codeHash:codeHash.digest("hex"),
  http:response.code,status:data.status,reason:data.reason||null,
  requestedAt:data.requestedAt??null,receivedAt:data.receivedAt??null,
  decisionCutoff:data.decisionCutoff??null,assessment15m:data.assessment15m??null,
  dataQuality:data.dataQuality??null,sourceAudit:data.sourceAudit??null,
  sourceReceipts:data.sourceReceipts??null,sourceErrors:data.sourceErrors??null,
  btcDominance:data.btcDominance??null,instrumentMetadata:data.instrumentMetadata??null,
  assessments,biasBySymbol:data.biasBySymbol??null,
  frameBiasBySymbol:data.frameBiasBySymbol??null,moduleCoverage:data.moduleCoverage??null,
  persistence:data.persistence??null,tradePermission:data.tradePermission??"NO_TRADE",
  signal:data.signal??null,watch:data.watch??null,
  paperOrderCreated:false,actualOrdersEnabled:false,executionEnabled:false,
  limitations:data.limitations??[],
};
const filename="scan-"+new Date(summary.runAt).toISOString().replaceAll(":","-")+".json";
const destination=path.join(root,"evidence",filename);
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.writeFileSync(destination,JSON.stringify(summary,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({destination,runAtUtc:summary.runAtUtc,
  runAtUtc7:summary.runAtUtc7,model:summary.model,status:summary.status,
  http:summary.http,configHash:summary.configHash,codeHash:summary.codeHash,
  sourceErrors:summary.sourceErrors,btcDominance:summary.btcDominance,
  frames:Object.fromEntries(SYMBOLS.map(s=>[s,Object.fromEntries(FRAMES.map(tf=>[
    tf,{state:assessments[s][tf]?.state,close:assessments[s][tf]?.close,
      closedAt:assessments[s][tf]?.closedAt,quality:assessments[s][tf]?.audit?.status,
      bias:summary.frameBiasBySymbol?.[s]?.[tf]||null}
  ]))]))},null,2));
