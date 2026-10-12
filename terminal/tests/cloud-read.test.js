import test from "node:test";
import assert from "node:assert/strict";
import { readPublic } from "../lib/cloud-read.js";
test("published index uses an immutable commit even when main raw is cached",async()=>{
 const saved=globalThis.fetch,calls=[],sha="d".repeat(40);
 try{
  globalThis.fetch=async input=>{const url=String(input);calls.push(url);return {
   ok:true,status:200,text:async()=>url.endsWith(".atom")?
    "<feed><entry><id>tag:github.com,2008:Grit::Commit/"+sha+"</id></entry></feed>":
    url.includes("/"+sha+"/")?'{"fresh":true}':'{"stale":true}'
  }};
  assert.equal(await readPublic("state.json"),'{"fresh":true}');
  assert.equal(calls.some(x=>x.includes("/main/")),false);
  assert.ok(calls[1].includes("/"+sha+"/data/scm15/state.json"));
 }finally{globalThis.fetch=saved;}
});
test("unverifiable published head does not fall back to a stale branch path",async()=>{
 const saved=globalThis.fetch,calls=[];try{
  globalThis.fetch=async input=>{calls.push(String(input));return {ok:true,status:200,text:async()=>"<feed>missing commit</feed>"}};
  await assert.rejects(()=>readPublic("state.json"),/PUBLISHED_HEAD_UNVERIFIED/);
  assert.equal(calls.length,1);
 }finally{globalThis.fetch=saved;}
});
