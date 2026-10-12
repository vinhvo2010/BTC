import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import live from "./api/live.js";
import feed from "./api/feed.js";
import history from "./api/history.js";

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("INVALID_PORT");
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url||"/","http://localhost").pathname;
  if(["/api/live","/api/feed","/api/history"].includes(pathname)){
    const proxy={setHeader:(k,v)=>res.setHeader(k,v),
      status(code){res.statusCode=code;return this},
      json(data){res.end(JSON.stringify(data));return data}};
    try{await (pathname==="/api/live"?live:pathname==="/api/feed"?feed:history)(req,proxy)}
    catch{res.statusCode=500;res.end(JSON.stringify({status:"LOCAL_API_ERROR"}))}
    return;
  }
  if(req.method!=="GET"||pathname!=="/"){res.statusCode=404;res.end("Not found");return}
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.end(await fs.readFile(path.join(root,"index.html")));
});
server.listen(port,"127.0.0.1",()=>console.log("SCM15 local http://127.0.0.1:"+port));
