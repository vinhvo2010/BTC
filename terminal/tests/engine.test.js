import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze,parseKlines,DataError,maturePivots,VERSION } from "../lib/engine.js";

const TF={"15m":900000,"5m":300000,"1h":3600000,"4h":14400000,"1d":86400000};
function series(tf,count,cutoff,base=0.22){
  const step=TF[tf],out=[];
  for(let i=0;i<count;i++){
    const s=cutoff-(count-i)*step,nom=base*(1+0.0004*i+0.013*Math.sin(i*.25));
    const o=nom,h=nom*1.007,l=nom*.993,c=nom*(1+0.001*Math.cos(i*.27));
    out.push([s,o.toFixed(7),h.toFixed(7),l.toFixed(7),c.toFixed(7),"2000",s+step-1,"440",42,"1200","300","0"]);
  }
  return out;
}
function fixture(){
  const lock=Math.floor(Date.UTC(2026,9,12,2,15,0)/900000)*900000;
  const request=lock+12*60000;
  const closed=(ms)=>Math.floor(lock/ms)*ms;
  const info={symbols:[{symbol:"ENAUSDT",baseAsset:"ENA",quoteAsset:"USDT",marginAsset:"USDT",
    status:"TRADING",contractType:"PERPETUAL",filters:[
      {filterType:"PRICE_FILTER",tickSize:"0.00001"},
      {filterType:"LOT_SIZE",stepSize:"1"}]}]};
  return {serverTime:request-500,clockReceivedAt:request,requestedAt:request,
    receivedAt:request+1500,exchangeInfo:info,
    btc4Raw:series("4h",130,closed(TF["4h"]),80000),
    btc1Raw:series("1h",130,closed(TF["1h"]),80000),
    ena4Raw:series("4h",130,closed(TF["4h"]),.22),
    ena1dRaw:series("1d",130,closed(TF["1d"]),.22),
    ena1Raw:series("1h",130,closed(TF["1h"]),.22),
    ena15Raw:series("15m",250,lock,.22),
    ena5Raw:series("5m",130,Math.floor(request/TF["5m"])*TF["5m"],.22)};
}
test("native 15m gap rejects source instead of zero filling",()=>{
  const x=fixture(),raw=x.ena15Raw;
  const copied=structuredClone(raw);
  copied[240][0]+=900000;copied[240][6]+=900000;
  assert.throws(()=>parseKlines(copied,"15m",Math.floor(x.requestedAt/900000)*900000,230),
    e=>e instanceof DataError && /GAP|DUPLICATE_OR_UNSORTED/.test(e.code));
});
test("open candle is excluded after decision lock",()=>{
  const x=fixture(),lock=Math.floor(x.requestedAt/900000)*900000;
  const raw=x.ena15Raw;
  const open=structuredClone(raw.at(-1));
  open[0]=lock;open[6]=lock+900000-1;open[4]="999999";
  const c=parseKlines([...raw,open],"15m",lock,230);
  assert.notEqual(c.at(-1).c,999999);assert.equal(c.at(-1).end,lock);
});
test("every READY signal has all order levels and net RR>=2",()=>{
  const x=fixture(),d=analyze(x);
  assert.equal(d.actualOrdersEnabled,false);
  assert.equal(d.fullCausalEngineVerified,false);
  assert.equal(d.model,VERSION);
  assert.ok(d.assessment15m&&d.assessment15m.barEnd===d.decisionCutoff);
  assert.equal(d.assessment15m.paperOrderCreated,false);
  assert.ok(d.zones["1d"]&&d.bias.details["1d"]);
  assert.equal(d.bias.probability,null);
  assert.equal(d.latest15m?.barEnd,d.decisionCutoff);
  assert.equal(typeof d.latest15m?.rvol,"number");
  assert.equal(d.latest15m?.minRvol,1.5);
  if(d.status==="SIGNAL_READY"){
    assert.ok(d.signal && d.signal.entry>0 && d.signal.stop>0 && d.signal.target>0);
    assert.ok(d.signal.netRR>=2);
    assert.ok(d.signal.trigger5mClosedAt>d.signal.setupAt);
    assert.equal(d.signal.executionEnabled,false);
  }else{
    assert.equal(d.signal,null);
  }
});
test("closed 15m breakout below RVOL gate is WATCH without trade or paper fill",()=>{
  const x=fixture(),raw=x.ena15Raw;
  const high=Math.max(...raw.slice(-21,-1).map(r=>Number(r[2])));
  raw.at(-1)[4]=(high+.001).toFixed(7);
  raw.at(-1)[2]=(high+.002).toFixed(7);
  const d=analyze(x);
  assert.equal(d.status,"WATCH");
  assert.equal(d.assessment15m.state,"WATCH");
  assert.equal(d.assessment15m.side,"LONG");
  assert.ok(d.assessment15m.reasons.includes("RVOL_BELOW_1_5"));
  assert.equal(d.signal,null);
  assert.equal(d.assessment15m.paperOrderCreated,false);
});
test("invalid timestamp / fake feed cannot create signal",()=>{
  const x=fixture();x.serverTime=x.clockReceivedAt-90000;
  assert.throws(()=>analyze(x),e=>e.code==="CLOCK_DRIFT_EXCEEDS_5_SECONDS");
});
test("wrong symbol metadata blocks all plan output",()=>{
  const x=fixture();x.exchangeInfo.symbols[0].status="BREAK";
  assert.throws(()=>analyze(x),e=>e.code==="CONTRACT_NOT_TRADING_PERPETUAL_USDT");
});
test("causal pivot is known only after right-hand confirmation",()=>{
  const bars=[{h:1,l:1,end:1},{h:2,l:.8,end:2},{h:5,l:.7,end:3},
    {h:3,l:.9,end:4},{h:2,l:1,end:5},{h:2.5,l:1,end:6}];
  assert.equal(maturePivots(bars,2,4).high.length,0);
  assert.equal(maturePivots(bars,2,5).high.length,1);
});
test("no accidental fallbacks to spot or account actions",()=>{
  const x=fixture();x.ena15Raw.at(-1)[9]="9000";
  assert.throws(()=>analyze(x),e=>e.code==="INVALID_KLINE_VALUES");
});
