import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeScan,updateIndex,missedRanges } from "../lib/journal.js";
import { persistScan } from "../lib/store.js";
import { payload,transport,at } from "./journal-fixture.mjs";
test("journal retains all twelve WAIT decisions and blocking evidence",()=>{
 const scan=makeScan(payload(),transport());
 assert.equal(scan.records.length,12);
 const ena=scan.records.find(x=>x.symbol==="ENAUSDT"&&x.timeframe==="15m");
 assert.equal(ena.state,"WAIT");assert.deepEqual(ena.blockedBy,["ACCOUNT_EQUITY_UNVERIFIED"]);
 assert.equal(ena.context.btcDominance.reason,"COINGECKO_HTTP_429");
 assert.equal(ena.decisionAt,at+2000);assert.equal(ena.receivedAt,at+1000);
 assert.equal(ena.timeliness,"WITHIN_5M_WINDOW");
});
test("late source receipt blocks instead of being silently backfilled",()=>{
 const data=payload();data.assessments.ENAUSDT["15m"].receivedAt=at+2500;
 const r=makeScan(data,transport()).records.find(x=>x.symbol==="ENAUSDT"&&x.timeframe==="15m");
 assert.equal(r.state,"DATA_INCOMPLETE");
 assert.ok(r.reasons.includes("SOURCE_RECEIPT_AFTER_DECISION_OR_MISSING"));
});
test("late observation and boundary mismatch keep actual clock and reason",()=>{
 const data=payload(at+10*60000),scan=makeScan(data,transport(at+10*60000));
 assert.equal(scan.records[0].timeliness,"LATE_OBSERVATION");
 assert.ok(scan.records[0].blockedBy.includes("LATE_OBSERVATION_NOT_HISTORICAL_SIGNAL"));
 data.assessments.BTCUSDT["15m"].barCutoff-=900000;
 const r=makeScan(data,transport(at+10*60000)).records[0];
 assert.equal(r.state,"DATA_INCOMPLETE");assert.ok(r.reasons.includes("SCHEDULE_TARGET_MISMATCH"));
});
test("source outage is recorded for every frame without invented prices",()=>{
 const data=payload();data.assessments={};data.status="DATA_BLOCKED";data.reason="BINANCE_HTTP_403";
 const scan=makeScan(data,transport()),index=updateIndex(null,scan);
 assert.equal(index.validFrameCount,0);assert.equal(index.sourceHealth,"BLOCKED");
 for(const r of scan.records){assert.equal(r.state,"DATA_INCOMPLETE");assert.equal(r.assessment,null);
 assert.ok(r.reasons.includes("BINANCE_HTTP_403"));}
});
test("unsafe top-level or frame payload cannot enter the journal",()=>{
 for(const change of [d=>d.executionEnabled=true,d=>d.actualOrdersEnabled=true,
  d=>d.signal={side:"SHORT"},d=>d.assessments.ENAUSDT["4h"].entry=0.2]) {
   const d=payload();change(d);assert.throws(()=>makeScan(d,transport()),/EXECUTION_LOCK/);
 }
});
test("missed native bar ranges have NULL decision and no retrospective signal",()=>{
 const gaps=missedRanges(Date.UTC(2026,9,12,6),Date.UTC(2026,9,12,7),"cohort");
 assert.equal(gaps.reduce((n,x)=>n+x.count,0),6);
 for(const x of gaps){assert.equal(x.state,"NOT_OBSERVED");assert.equal(x.decisionAt,null);}
 const months=missedRanges(Date.UTC(2026,0,1),Date.UTC(2026,2,1),"cohort").filter(x=>x.timeframe==="1M");
 assert.equal(months[0].firstMissedCutoff,Date.UTC(2026,1,1));assert.equal(months[0].count,1);
});
test("same-bar recheck preserves first decision; model change starts separate cohort",()=>{
 const first=updateIndex(null,makeScan(payload(),transport()));
 const data=payload(at+10000);data.assessments.ENAUSDT["15m"].state="WATCH";
 const second=updateIndex(first,makeScan(data,transport(at+10000)));
 const r=second.recentDecisions.find(x=>x.symbol==="ENAUSDT"&&x.timeframe==="15m");
 assert.equal(r.firstState,"WAIT");assert.equal(r.state,"WATCH");assert.equal(r.attemptCount,2);
 const third={...data,release:{...data.release,codeHash:"a".repeat(64)}};
 const changed=updateIndex(second,makeScan(third,transport(at+10000)));
 assert.equal(changed.cohortChanged,true);assert.equal(changed.recentDecisions.length,12);
 assert.equal(changed.recentDecisions[0].attemptCount,1);
});
test("durable journal is idempotent and archives full repeat scan separately",()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"scm-journal-"));
 try{
  const scan=makeScan(payload(),transport());
  assert.equal(persistScan(directory,scan).newRecords,12);
  assert.equal(persistScan(directory,scan).newRecords,0);
  assert.equal(persistScan(directory,makeScan(payload(at+10000),transport(at+10000))).newRecords,0);
  const date=new Date(at).toISOString().slice(0,10);
  assert.equal(fs.readFileSync(path.join(directory,"journal",date+".ndjson"),"utf8").trim().split("\n").length,12);
  assert.equal(fs.readdirSync(path.join(directory,"scans",date)).length,2);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
