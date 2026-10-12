import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/history.js";
import { makeScan } from "../lib/journal.js";
import { payload,transport,res } from "./journal-fixture.mjs";
async function call(url,rows){
 const saved=globalThis.fetch;try{
 globalThis.fetch=async()=>({ok:true,status:200,text:async()=>rows.map(x=>JSON.stringify(x)).join("\n")});
 const r=res();await handler({method:"GET",url},r);return r;
 }finally{globalThis.fetch=saved;}
}
test("history filters native frames and cursor pagination preserves actual decisions",async()=>{
 const rows=makeScan(payload(),transport()).records.map(x=>({...x,kind:"DECISION"}));
 const first=await call("/api/history?symbol=ENAUSDT&limit=2",rows);
 assert.equal(first.data.records.length,2);assert.ok(first.data.nextCursor);
 const next=await call("/api/history?symbol=ENAUSDT&limit=2&before="+encodeURIComponent(first.data.nextCursor),rows);
 assert.equal(next.data.records.length,2);
 assert.equal(next.data.records.some(x=>first.data.records.some(y=>x.id===y.id)),false);
 const one=await call("/api/history?symbol=ENAUSDT&frame=4h",rows);
 assert.equal(one.data.records.length,1);assert.equal(one.data.records[0].timeframe,"4h");
});
test("history refuses unsafe records and traversal queries",async()=>{
 const rows=makeScan(payload(),transport()).records.map(x=>({...x,kind:"DECISION"}));
 rows[0].executionEnabled=true;
 assert.equal((await call("/api/history",rows)).data.reason,"UNVERIFIED_JOURNAL_RECORD");
 assert.equal((await call("/api/history?date=../../secrets",rows)).code,400);
});
