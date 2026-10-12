import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
for(const dir of ["api","lib","scripts"])for(const f of fs.readdirSync(path.join(root,dir))) {
  if(/\.(js|mjs)$/.test(f))execFileSync(process.execPath,["--check",path.join(root,dir,f)],{stdio:"pipe"});
}
execFileSync(process.execPath,["--check",path.join(root,"dev-server.js")],{stdio:"pipe"});
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
if(!module)throw new Error("UI_MODULE_MISSING");
execFileSync(process.execPath,["--check","--input-type=module"],{input:module,stdio:"pipe"});
console.log("Runtime and browser module syntax PASS");
