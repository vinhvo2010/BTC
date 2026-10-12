import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/feed.js";
import { makeScan,updateIndex } from "../lib/journal.js";
import { payload,transport,res } from "./journal-fixture.mjs";
async function call(raw){const saved=globalThis.fetch;try{
 globalThis.fetch=async input=>({ok:true,status:200,text:async()=>String(input).endsWith(".atom")?"<feed><entry><id>tag:github.com,2008:Grit::Commit/cccccccccccccccccccccccccccccccccccccccc</id></entry></feed>":JSON.stringify(raw)});
 const r=res();await handler({method:"GET"},r);return r.data;
 }finally{globalThis.fetch=saved;}}
test("stale scheduler remains unverified while retaining complete blocker history",async()=>{
 const t=Date.now()-19*60000,index=updateIndex(null,makeScan(payload(t),transport(t)));
 const d=await call(index);assert.equal(d.status,"CLOUD_SCAN_STALE");assert.equal(d.verified,false);
 assert.equal(d.recentDecisions.length,12);assert.equal(d.actualOrdersEnabled,false);
});
test("fresh heartbeat with failed source is not healthy market data",async()=>{
 const t=Date.now()-10000,data=payload(t);data.assessments={};data.status="DATA_BLOCKED";
 const d=await call(updateIndex(null,makeScan(data,transport(t))));
 assert.equal(d.status,"CLOUD_SCAN_DATA_BLOCKED");assert.equal(d.schedulerFresh,true);assert.equal(d.verified,false);
});
test("cloud cohort mismatch and incomplete frame journals fail closed",async()=>{
 const t=Date.now()-10000,index=updateIndex(null,makeScan(payload(t),transport(t)));
 assert.equal((await call({...index,codeHash:"a".repeat(64)})).status,"CLOUD_COHORT_MISMATCH");
 index.latestByFrame.ENAUSDT["4h"]=null;
 assert.equal((await call(index)).reason,"INCOMPLETE_FRAME_JOURNAL");
});
