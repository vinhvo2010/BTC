import { readPublic } from "../lib/cloud-read.js";
import { FRAMES, SYMBOLS } from "../lib/multiframe.js";
export const config={maxDuration:30};
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store, max-age=0");
  if(req.method!=="GET")return res.status(405).json({status:"METHOD_NOT_ALLOWED"});
  const url=new URL(req.url||"/api/history","https://skydeal.app");
  const date=url.searchParams.get("date")||new Date().toISOString().slice(0,10);
  const symbol=url.searchParams.get("symbol"),frame=url.searchParams.get("frame");
  const before=url.searchParams.get("before"),limit=Number(url.searchParams.get("limit")||50);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(limit)||limit<1||limit>200||
      symbol&&!SYMBOLS.includes(symbol)||frame&&!FRAMES.includes(frame)||before?.length>300)
    return res.status(400).json({status:"INVALID_HISTORY_QUERY",records:[]});
  try {
    const text=await readPublic("journal/"+date+".ndjson",32*1024*1024);
    if(text===null)return res.status(200).json({status:"NO_RECORDED_DECISIONS",date,
      records:[],nextCursor:null,executionEnabled:false,unknownBeforeMonitoring:true});
    let rows=text.split("\n").filter(Boolean).map(x=>JSON.parse(x));
    for(const r of rows)if(!r.id||!SYMBOLS.includes(r.symbol)||!FRAMES.includes(r.timeframe)||
      r.mode!=="SHADOW"||r.executionEnabled!==false||r.tradePermission!=="NO_TRADE"||
      !["DECISION","SCHEDULE_GAP"].includes(r.kind))throw new Error("UNVERIFIED_JOURNAL_RECORD");
    rows=rows.filter(r=>(!symbol||r.symbol===symbol)&&(!frame||r.timeframe===frame))
      .sort((a,b)=>b.observedAt-a.observedAt||b.id.localeCompare(a.id));
    if(before){const offset=rows.findIndex(r=>r.id===before);
      if(offset<0)return res.status(409).json({status:"HISTORY_CURSOR_NOT_FOUND",records:[]});
      rows=rows.slice(offset+1);}
    const records=rows.slice(0,limit);
    return res.status(200).json({status:"RECORDED_SHADOW_DECISIONS",date,records,
      nextCursor:rows.length>limit?records.at(-1).id:null,
      source:"GITHUB_IMMUTABLE_SCAN_AND_APPEND_ONLY_JOURNAL",executionEnabled:false,
      unknownBeforeMonitoring:true});
  } catch(e) {
    return res.status(200).json({status:"HISTORY_UNAVAILABLE",records:[],nextCursor:null,
      reason:e.message==="UNVERIFIED_JOURNAL_RECORD"?e.message:"JOURNAL_READ_FAILED",
      executionEnabled:false});
  }
}
