import test from "node:test";
import assert from "node:assert/strict";
import { frameCutoff, frameEnd, auditNativeFrame, buildMultiframe, frameEvidenceBias, FRAMES, SYMBOLS } from "../lib/multiframe.js";

const at=Date.parse("2026-10-12T04:30:00.000Z");
const monthBack=t=>{const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1)};
function previous(start,tf){
  if(tf==="1M")return monthBack(start);
  return start-({"15m":900000,"1h":3600000,"4h":14400000,
    "1d":86400000,"1w":604800000})[tf];
}
function rows(tf,n=250,requestedAt=at){
  const starts=[];let s=frameCutoff(requestedAt,tf);
  for(let i=0;i<n;i++){s=previous(s,tf);starts.push(s)}
  return starts.reverse().map((start,i)=>{
    const p=100+i*0.01,end=frameEnd(start,tf);
    return [start,String(p),String(p+0.1),String(p-0.1),String(p+0.02),
      "1000",end-1,"0","0","520","0","0"];
  });
}
test("UTC week/month cutoffs use native Binance calendars",()=>{
  assert.equal(frameCutoff(at,"1w"),Date.parse("2026-10-12T00:00:00Z"));
  assert.equal(frameCutoff(at,"1M"),Date.parse("2026-10-01T00:00:00Z"));
  assert.equal(frameEnd(Date.parse("2026-02-01T00:00:00Z"),"1M"),
    Date.parse("2026-03-01T00:00:00Z"));
  assert.equal(frameEnd(Date.parse("2026-10-12T00:00:00Z"),"1w"),
    Date.parse("2026-10-19T00:00:00Z"));
});
test("only closed native monthly bar is accepted and receipt is causal",()=>{
  const input=rows("1M",35);
  const cutoff=frameCutoff(at,"1M");
  input.push([cutoff,"100","101","99","100","1000",frameEnd(cutoff,"1M")-1,
    "0","0","500","0","0"]);
  const r=auditNativeFrame(input,"1M",at,at+100);
  assert.equal(r.audit.status,"VALID");
  assert.equal(r.audit.openExcluded,1);
  assert.equal(r.bars.at(-1).end,cutoff);
  const bad=buildMultiframe({rawBySymbol:{BTCUSDT:{"1M":input}},
    receiptBySymbol:{BTCUSDT:{"1M":at+2000}},requestedAt:at,decisionAt:at+1000,
    instrumentMetadata:{BTCUSDT:"VALID"}});
  assert.equal(bad.assessments.BTCUSDT["1M"].state,"DATA_INCOMPLETE");
  assert.ok(bad.assessments.BTCUSDT["1M"].reasons.includes("RECEIPT_AFTER_DECISION"));
});
test("duplicate, gap and missing warm-up fail closed with counts",()=>{
  const duplicate=rows("1h",120);duplicate.push([...duplicate.at(-1)]);
  const a=auditNativeFrame(duplicate,"1h",at,at+100);
  assert.equal(a.audit.duplicates,1);
  assert.equal(a.audit.status,"DATA_INCOMPLETE");
  const gap=rows("1h",120);gap.splice(50,1);
  const b=auditNativeFrame(gap,"1h",at,at+100);
  assert.equal(b.audit.gaps,1);
  assert.ok(b.audit.reasons.includes("CLOSED_CANDLE_GAP"));
  const short=auditNativeFrame(rows("1M",12),"1M",at,at+100);
  assert.equal(short.audit.warmupMissing,18);
  assert.ok(short.audit.reasons.includes("WARMUP_INCOMPLETE"));
});
test("BTC and ENA each get six assessments with no invented entry or Paper order",()=>{
  const rawBySymbol={},receiptBySymbol={};
  for(const symbol of SYMBOLS){
    rawBySymbol[symbol]={};receiptBySymbol[symbol]={};
    for(const tf of FRAMES){rawBySymbol[symbol][tf]=rows(tf);
      receiptBySymbol[symbol][tf]=at+100}
  }
  const out=buildMultiframe({rawBySymbol,receiptBySymbol,requestedAt:at,
    decisionAt:at+200,btcDominance:{status:"VALID",valuePct:60,
      asOf:at-300000,receivedAt:at+100},
    instrumentMetadata:{BTCUSDT:"VALID",ENAUSDT:"VALID"}});
  for(const symbol of SYMBOLS)for(const tf of FRAMES){
    const x=out.assessments[symbol][tf];
    assert.equal(x.audit.status,"VALID",symbol+" "+tf);
    assert.equal(x.tradePermission,"NO_TRADE");
    assert.equal(x.paperOrderCreated,false);
    for(const k of ["entry","stop","target","size","netRR","probability"])assert.equal(x[k],null);
    assert.ok(["WAIT","WATCH"].includes(x.state));
    assert.equal(x.closedAt,x.barCutoff);
    const bias=out.frameBiasBySymbol[symbol][tf];
    assert.equal(bias.status,"VALID");
    assert.equal(bias.probability,null);
    assert.ok(Math.abs(bias.longEvidencePct+bias.shortEvidencePct+bias.neutralEvidencePct-100)<0.01);
  }
  assert.equal(out.moduleCoverage.orderBookPersistence,"NOT_IMPLEMENTED");
  assert.equal(out.persistence,"ON_DEMAND_ONLY_NO_DURABLE_PER_BAR_HISTORY");
  const noContract=buildMultiframe({rawBySymbol,receiptBySymbol,requestedAt:at,
    decisionAt:at+200,instrumentMetadata:{BTCUSDT:"UNVERIFIED",ENAUSDT:"VALID"}});
  assert.equal(noContract.assessments.BTCUSDT["15m"].state,"DATA_INCOMPLETE");
  assert.ok(noContract.assessments.BTCUSDT["15m"].reasons.includes("INSTRUMENT_METADATA_UNVERIFIED"));
  assert.equal(noContract.frameBiasBySymbol.BTCUSDT["15m"].longEvidencePct,null);
});
test("frame bias separates direction, neutral evidence and source quality",()=>{
  const base={audit:{status:"VALID",reasons:[]},structure:"UP",breakout:"LONG",
    prior20High:110,prior20Low:90,volume:{takerBuySharePct:60}};
  const long=frameEvidenceBias(base);
  assert.equal(long.longEvidencePct,86.7);
  assert.equal(long.shortEvidencePct,13.3);
  assert.equal(long.neutralEvidencePct,0);
  assert.equal(long.leaning,"LONG");
  assert.equal(long.coveragePct,100);
  assert.equal(long.probability,null);
  const mixed=frameEvidenceBias({...base,breakout:"SHORT"});
  assert.equal(mixed.leaning,"MIXED");
  const neutral=frameEvidenceBias({...base,structure:"MIXED",breakout:null,
    volume:{takerBuySharePct:null}});
  assert.equal(neutral.neutralEvidencePct,100);
  assert.equal(neutral.coveragePct,66.7);
  const blocked=frameEvidenceBias({...base,audit:{status:"DATA_INCOMPLETE",reasons:["CLOSED_CANDLE_GAP"]}});
  assert.equal(blocked.status,"DATA_INCOMPLETE");
  assert.equal(blocked.longEvidencePct,null);
  assert.deepEqual(blocked.reasons,["CLOSED_CANDLE_GAP"]);
});
