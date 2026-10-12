import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync,execFileSync } from "node:child_process";
import {runResident} from "../lib/resident.js";
import {RELEASE} from "../lib/provenance.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const minutes=Number(process.env.SCM_SESSION_MINUTES||300);
const git=args=>execFileSync("git",args,{cwd:root,stdio:"pipe"}).toString();
git(["config","user.name","SCM SHADOW Journal"]);
git(["config","user.email","scm15@users.noreply.github.com"]);
const result=await runResident({durationMs:minutes*60000,cycle:async tick=>{
 git(["fetch","origin","main"]);
 git(["merge","--ff-only","FETCH_HEAD"]);
 const current=JSON.parse(fs.readFileSync(path.join(root,"terminal/release.json"),"utf8"));
 if(current.codeHash!==RELEASE.codeHash)throw new Error("RELEASE_CHANGED_RESTART_REQUIRED");
 const scan=spawnSync(process.execPath,[path.join(root,"terminal/scripts/cloud-scan.mjs")],
   {cwd:root,stdio:"inherit",env:{...process.env,SCM_SCHEDULED_AT:String(tick.scheduledAt),SCM_TICK_KIND:tick.kind}});
 if(scan.status===null)throw new Error("SCANNER_PROCESS_START_FAILED");
 const statePath=path.join(root,"data/scm15/state.json");
 if(fs.existsSync(statePath)){
   const state=JSON.parse(fs.readFileSync(statePath,"utf8"));
   const recovery=path.join(root,"terminal/evidence/last-scan");fs.mkdirSync(recovery,{recursive:true});
   fs.copyFileSync(statePath,path.join(recovery,"state.json"));
   if(state.snapshotPath&&fs.existsSync(path.join(root,state.snapshotPath)))
     fs.copyFileSync(path.join(root,state.snapshotPath),path.join(recovery,"scan.json.gz"));
 }
 git(["add","data/scm15"]);
 if(git(["diff","--cached","--name-only"]).trim()){
   git(["commit","-m","data(scm15): persist timed SHADOW scan and decision evidence"]);
   git(["push","origin","HEAD:main"]);
 }
 console.log(JSON.stringify({event:scan.status===0?"SCAN_PUBLISHED":"SAFE_BLOCKED_RECORD_PUBLISHED",...tick,at:new Date().toISOString(),
   mode:"SHADOW",executionEnabled:false,codeHash:RELEASE.codeHash}));
 if(scan.status!==0)throw new Error("SCAN_FAILED_AFTER_SAFE_RECORD_PERSISTENCE");
}});
console.log(JSON.stringify(result));
