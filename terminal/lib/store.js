import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { updateIndex, JOURNAL_VERSION } from "./journal.js";
import { hash } from "./provenance.js";
export function materialHash(r) {
  return hash({barKey:r.barKey,state:r.state,reasons:r.reasons,blockedBy:r.blockedBy,
    leaning:r.leaning,closedAt:r.closedAt,volume:r.assessment?.volume,
    breakout:r.assessment?.breakout,structure:r.assessment?.structure,
    audit:r.assessment?.audit?.status,btcH4:r.context?.btcH4,
    btcH1:r.context?.btcH1,enaH1:r.context?.enaH1});
}
function readJSON(p) { try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){if(e.code==="ENOENT")return null;throw e} }
function atomicJSON(p,data) {
  const temp=p+".tmp-"+process.pid;
  fs.writeFileSync(temp,JSON.stringify(data,null,2)+"\n",{flag:"wx"});
  fs.renameSync(temp,p);
}
export function persistScan(directory,scan) {
  fs.mkdirSync(directory,{recursive:true});
  const statePath=path.join(directory,"state.json"),previous=readJSON(statePath);
  scan.snapshotPath="data/scm15/scans/"+new Date(scan.transport.receivedAt).toISOString().slice(0,10)+"/"+scan.runId+".json.gz";
  const archive=path.join(directory,"scans",new Date(scan.transport.receivedAt).toISOString().slice(0,10),scan.runId+".json.gz");
  fs.mkdirSync(path.dirname(archive),{recursive:true});
  if(!fs.existsSync(archive))fs.writeFileSync(archive,gzipSync(JSON.stringify(scan)),{flag:"wx"});
  const next=updateIndex(previous,scan);
  const date=next.journalDate,journal=path.join(directory,"journal",date+".ndjson");
  fs.mkdirSync(path.dirname(journal),{recursive:true});
  const existing=fs.existsSync(journal)?fs.readFileSync(journal,"utf8").trim().split("\n").filter(Boolean).map(x=>JSON.parse(x)):[];
  const ids=new Set(existing.map(x=>x.id)),fresh=[];
  for(const r of scan.records) {
    const prior=previous?.latestByFrame?.[r.symbol]?.[r.timeframe];
    if(prior?.barKey===r.barKey && materialHash(prior)===materialHash(r))continue;
    if(!ids.has(r.id))fresh.push({...r,kind:"DECISION",snapshotPath:scan.snapshotPath});
  }
  for(const g of next.gaps||[]) {
    if(ids.has(g.id))continue;
    const old=(previous?.gaps||[]).some(x=>x.id===g.id);
    if(!old)fresh.push({...g,kind:"SCHEDULE_GAP",observedAt:scan.transport.receivedAt,
      reasons:[g.reason],blockedBy:["NO_TRADE"],mode:"SHADOW",tradePermission:"NO_TRADE",
      release:scan.payload.release,runId:scan.runId});
  }
  if(fresh.length)fs.appendFileSync(journal,fresh.map(x=>JSON.stringify(x)).join("\n")+"\n");
  atomicJSON(statePath,next);
  return {state:next,newRecords:fresh.length,snapshotPath:scan.snapshotPath,schemaVersion:JOURNAL_VERSION};
}
