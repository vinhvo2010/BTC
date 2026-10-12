import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PARAMETERS, VERSION } from "../lib/engine.js";
import { FRAMES, SYMBOLS, MULTIFRAME_VERSION, FRAME_BIAS_VERSION } from "../lib/multiframe.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const files=["index.html","package.json","vercel.json",...fs.readdirSync(path.join(root,"api")).filter(x=>x.endsWith(".js")).map(x=>"api/"+x),
  ...fs.readdirSync(path.join(root,"lib")).filter(x=>x.endsWith(".js")).map(x=>"lib/"+x),
  "scripts/cloud-scan.mjs","scripts/build-release.mjs","scripts/check-source.mjs"].sort();
const sha=value=>createHash("sha256").update(value).digest("hex");
const sourceHashes=Object.fromEntries(files.map(name=>[name,sha(fs.readFileSync(path.join(root,name)))]));
const config={plan:VERSION,multiframe:MULTIFRAME_VERSION,bias:FRAME_BIAS_VERSION,
  parameters:PARAMETERS,frames:FRAMES,symbols:SYMBOLS,journal:"SCM15_DECISION_JOURNAL_V1",
  scheduler:"GITHUB_ACTIONS_5M_BEST_EFFORT",decisionDeadlineMs:300000,
  mode:"SHADOW",executionEnabled:false,paperOrderCreated:false};
const release={release:"SCM15_SHADOW_JOURNAL_V1",repository:"vinhvo2010/BTC",
  rootDirectory:"terminal",codeHash:sha(JSON.stringify(Object.fromEntries(Object.entries(sourceHashes).filter(([name])=>name!=="vercel.json")))),
  deploymentConfigHash:sourceHashes["vercel.json"],
  configHash:sha(JSON.stringify(config)),config,sourceHashes,
  mode:"SHADOW",executionEnabled:false};
if(process.argv.includes("--check")) {
  const existing=JSON.parse(fs.readFileSync(path.join(root,"release.json"),"utf8"));
  if(existing.codeHash!==release.codeHash||existing.configHash!==release.configHash)throw new Error("RELEASE_HASH_MISMATCH");
} else fs.writeFileSync(path.join(root,"release.json"),JSON.stringify(release,null,2)+"\n");
console.log(JSON.stringify({release:release.release,codeHash:release.codeHash,configHash:release.configHash}));
