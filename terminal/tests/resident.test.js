import test from "node:test";
import assert from "node:assert/strict";
import {nextScanAt,runResident} from "../lib/resident.js";
test("resident timer aligns to UTC minute 2 modulo 5 without drifting with receipt delay",async()=>{
 let now=Date.UTC(2026,9,12,7,16),ticks=[];
 await runResident({durationMs:7*60000,now:()=>now,wait:async ms=>{now+=ms},
   cycle:async tick=>{ticks.push(tick);now+=10000}});
 assert.equal(ticks.length,3);
 assert.deepEqual(ticks.map(x=>new Date(x.scheduledAt).getUTCMinutes()),[16,17,22]);
 assert.equal(ticks[1].kind,"TIMER");
 assert.equal(nextScanAt(Date.UTC(2026,9,12,7,17)),Date.UTC(2026,9,12,7,22));
});
test("short commissioning session ends at safe handoff and failed cycle cannot continue",async()=>{
 let now=Date.UTC(2026,9,12,7,18),ticks=0;
 const r=await runResident({durationMs:60000,now:()=>now,wait:async ms=>{now+=ms},cycle:async()=>{ticks++}});
 assert.equal(ticks,1);assert.equal(r.status,"SESSION_COMPLETE_HANDOFF_REQUIRED");
 await assert.rejects(()=>runResident({durationMs:60000,cycle:async()=>{throw new Error("unsafe")}}),/unsafe/);
});
