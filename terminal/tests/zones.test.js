import test from "node:test";
import assert from "node:assert/strict";
import {observedZones,zoneBreakPressure,frameBias} from "../lib/zones.js";
function bar(i,{o=10,h=11,l=9,c=10,v=100,buy=50}={}){
 const s=i*900000;return {s,end:s+900000,o,h,l,c,v,buy};
}
test("zone needs right-hand closed confirmation and keeps broken terminal",()=>{
 const bars=[
  bar(0,{h:11}),bar(1,{h:12}),bar(2,{h:15,o:11,c:12,v:300,buy:210}),
  bar(3,{h:13}),bar(4,{h:12}),bar(5,{h:14,l:11,c:12}),
  bar(6,{h:16,c:15.5}),bar(7,{h:14,c:12}),
 ];
 assert.equal(observedZones(bars,{timeframe:"15m",decisionAt:bar(3).end}).length,0);
 const at4=observedZones(bars,{timeframe:"15m",decisionAt:bar(4).end});
 const zone=at4.find(z=>z.kind==="SUPPLY"&&z.originAt===bar(2).end);
 assert.ok(zone);assert.equal(zone.knownAt,bar(4).end);
 assert.equal(zone.volume.origin,300);assert.equal(zone.volume.takerBuy,210);
 assert.equal(zone.volume.takerSell,90);assert.equal(zone.volume.takerDelta,120);
 assert.equal(zone.state,"ACTIVE");
 const broken=observedZones(bars,{timeframe:"15m",decisionAt:bar(7).end})
  .find(z=>z.id===zone.id);
 assert.equal(broken.state,"BROKEN");assert.equal(broken.breakAt,bar(6).end);
 assert.equal(zoneBreakPressure(broken,bars,bar(7).end).probability,null);
});
test("ATR at zone origin stays locked after later break",()=>{
 const bars=Array.from({length:24},(_,i)=>bar(i));
 bars[20]=bar(20,{h:16,o:10,c:11,v:180,buy:100});
 bars[23]=bar(23,{h:17,o:10,c:16.5,v:300,buy:250});
 const before=observedZones(bars,{timeframe:"15m",decisionAt:bar(22).end})
  .find(z=>z.kind==="SUPPLY"&&z.originAt===bar(20).end);
 const after=observedZones(bars,{timeframe:"15m",decisionAt:bar(23).end})
  .find(z=>z.id===before.id);
 assert.ok(before.atrLocked>0);
 assert.equal(after.atrLocked,before.atrLocked);
 assert.equal(after.state,"BROKEN");
});
test("bias percentages are evidence shares, never success probabilities",()=>{
 const bars=Array.from({length:10},(_,i)=>bar(i));
 const bias=frameBias({"15m":bars,"1h":bars,"4h":bars},bars.at(-1).end,
  (_,r)=>r===2?"UP":"DOWN");
 assert.equal(bias.longEvidencePct,16.7);
 assert.equal(bias.shortEvidencePct,83.3);
 assert.equal(bias.leaning,"SHORT");
 assert.equal(bias.probability,null);
});
