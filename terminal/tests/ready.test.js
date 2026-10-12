import { test } from "node:test";
import assert from "node:assert/strict";
import { planForEvent,VERSION } from "../lib/engine.js";

function waves(n,tf,end,{base,drift,amplitude}){
  const rows=[];
  for(let i=0;i<n;i++){
    const center=base+i*drift+amplitude*Math.sin(i*2*Math.PI/9);
    rows.push({s:end-(n-i)*tf,end:end-(n-i-1)*tf,
      h:center+amplitude*.28,l:center-amplitude*.28,
      c:center,v:1000,buy:650});
  }
  return rows;
}
function scenario(){
  // 4h-aligned cutoff; valid, native 15m observation + genuinely later 5m retest.
  const t=Date.UTC(2026,9,12,0,0);
  const btc4=waves(120,4*3600000,t,{base:80000,drift:15,amplitude:200});
  const btc1=waves(120,3600000,t,{base:80000,drift:15,amplitude:200});
  const ena1=waves(120,3600000,t,{base:.251,drift:.00013,amplitude:.0025});
  const ena4=waves(120,4*3600000,t,{base:.27,drift:.00012,amplitude:.0025});
  const ena15=waves(100,900000,t,{base:.209,drift:.000055,amplitude:.002});
  const ev={
    side:"LONG", kind:"BREAKOUT", setupEnd:t,
    setupClose:.222, priorHigh:.221,priorLow:.215,
    setupLow:.217, setupHigh:.223,
    eligibleTrade:true,rvol:4.5,return1h:4,takerDelta:2000
  };
  const ena5=[{s:t,end:t+300000,l:.221,h:.223,c:.222,v:1000,buy:750}];
  return {ev,ctx:{btc4,btc1,ena1,ena4,ena15,ena5,
    now:t+600000,lockedAt:t,atr15:.001,meta:{tick:.00001,step:1}}};
}

test("positive READY scenario must actually produce complete actionable research plan",()=>{
  const {ev,ctx}=scenario();
  const p=planForEvent(ev,ctx);
  assert.equal(p.state,"PLAN_READY_RESEARCH",JSON.stringify(p));
  assert.deepEqual(p.reasons,[]);
  assert.equal(p.side,"LONG");
  assert.ok(p.entry>p.stop);
  assert.ok(p.target>p.entry);
  assert.ok(p.netRR>=2);
  assert.ok(p.trigger5mClosedAt>p.setupAt);
  assert.ok(p.expiresAt>p.trigger5mClosedAt);
  assert.equal(p.knownAt,ctx.now,"Late-loaded historical retest must NOT be backdated");
  assert.equal(p.executionEnabled,false);
  assert.equal(p.fullCausalScore,null);
  assert.equal(p.model,VERSION);
});

test("without later closed 5m retest there is NO ready signal and NO trade levels",()=>{
  const {ev,ctx}=scenario();ctx.ena5=[];
  const p=planForEvent(ev,ctx);
  assert.equal(p.state,"WATCH");
  assert.equal(p.entry,null);
  assert.equal(p.stop,null);
  assert.equal(p.target,null);
  assert.ok(p.reasons.includes("LATER_CLOSED_5M_RETEST_NOT_CONFIRMED"));
});

test("expired setup cannot turn into signal even with prior retest",()=>{
  const {ev,ctx}=scenario();ctx.now=ev.setupEnd+46*60000;
  const p=planForEvent(ev,ctx);
  assert.equal(p.state,"WATCH");
  assert.equal(p.entry,null);
  assert.ok(p.reasons.includes("SETUP_EXPIRED"));
});

test("insufficient BTC structure blocks new signal without disabling data observation",()=>{
  const {ev,ctx}=scenario();ctx.btc1=ctx.btc1.slice(-5);
  const p=planForEvent(ev,ctx);
  assert.equal(p.state,"WATCH");
  assert.equal(p.entry,null);
  assert.ok(p.reasons.includes("BTC1H_NOT_UP"));
});
