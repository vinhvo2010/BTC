import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/live.js";
import { frameCutoff,frameEnd,FRAMES } from "../lib/multiframe.js";
import { res } from "./journal-fixture.mjs";
test("failed public clock still emits twelve explicit blocked assessments in SHADOW",async()=>{
 const saved=globalThis.fetch;try{
  globalThis.fetch=async()=>({ok:false,status:403});
  const r=res();await handler({method:"GET"},r);
  assert.equal(r.data.mode,"SHADOW");assert.equal(r.data.executionEnabled,false);
  assert.equal(r.data.signal,null);assert.equal(r.data.reason,"BINANCE_HTTP_403");
  assert.equal(Object.values(r.data.assessments).flatMap(x=>Object.values(x)).length,12);
  assert.equal(r.data.assessments.ENAUSDT["4h"].entry,null);
  assert.ok(r.data.assessments.ENAUSDT["4h"].audit.reasons.includes("SOURCE_MISSING"));
 }finally{globalThis.fetch=saved;}
});
test("optional-frame and legacy read failures retain frame decisions and source receipts",async()=>{
 const saved=globalThis.fetch,clock=Date.now,now=Date.UTC(2026,9,12,6,2);
 const previous=(end,tf)=>tf==="1M"?Date.UTC(new Date(end).getUTCFullYear(),new Date(end).getUTCMonth()-1,1):
   end-(frameEnd(0,tf));
 const bars=tf=>{
  let end=frameCutoff(now,tf),rows=[];
  for(let i=0;i<(tf==="15m"?250:130);i++){const start=previous(end,tf);
   rows.unshift([start,"3","5","1","3","1000",end-1,"3000",10,"500","1500","0"]);end=start;}
  return rows;
 };
 try{
  Date.now=()=>now;
  globalThis.fetch=async input=>{
   const u=new URL(input);
   if(u.hostname==="api.coingecko.com")return {ok:false,status:429};
   if(u.pathname==="/fapi/v1/time")return {ok:true,json:async()=>({serverTime:now})};
   if(u.pathname==="/fapi/v1/exchangeInfo")return {ok:true,json:async()=>({symbols:["BTCUSDT","ENAUSDT"].map(symbol=>({
    symbol,status:"TRADING",contractType:"PERPETUAL",quoteAsset:"USDT",marginAsset:"USDT",
    filters:[{filterType:"PRICE_FILTER",tickSize:"0.001"},{filterType:"LOT_SIZE",stepSize:"0.1"}]}))})};
   if(u.searchParams.get("interval")==="5m")return {ok:false,status:429};
   return {ok:true,json:async()=>bars(u.searchParams.get("interval"))};
  };
  const r=res();await handler({method:"GET",url:"/api/live?evidence=1"},r);
  assert.equal(r.data.status,"DATA_BLOCKED");
  for(const tf of FRAMES)assert.equal(r.data.assessments.ENAUSDT[tf].audit.status,"VALID");
  assert.equal(r.data.sourceErrors.ENAUSDT_5m,"BINANCE_HTTP_429");
  assert.equal(r.data.sourceErrors.BTC_D,"COINGECKO_HTTP_429");
  assert.equal(r.data.sourceEvidence.ENAUSDT_4h.requestedAt,now);
  assert.equal(r.data.sourceEvidence.ENAUSDT_4h.receivedAt,now);
  assert.equal(r.data.sourceReadPayloads.ENAUSDT_4h.length,130);
  assert.match(r.data.sourceEvidence.ENAUSDT_4h.payloadSha256,/^[a-f0-9]{64}$/);
  assert.equal(r.data.executionEnabled,false);
 }finally{globalThis.fetch=saved;Date.now=clock;}
});
