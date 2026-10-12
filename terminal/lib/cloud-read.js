import { FRAMES, SYMBOLS } from "./multiframe.js";
import { RELEASE } from "./provenance.js";
import { JOURNAL_VERSION } from "./journal.js";
export const BASE="https://raw.githubusercontent.com/vinhvo2010/BTC/main/data/scm15/";
export async function readPublic(relative,maxBytes=3*1024*1024) {
  const response=await fetch(BASE+relative,{signal:AbortSignal.timeout(9000),cache:"no-store",
    headers:{Accept:"application/json"}});
  if(response.status===404)return null;
  if(!response.ok)throw new Error("GITHUB_HTTP_"+response.status);
  const reader=response.body?.getReader();
  if(!reader){const text=await response.text();if(Buffer.byteLength(text)>maxBytes)throw new Error("PUBLIC_JOURNAL_TOO_LARGE");return text;}
  let size=0;const parts=[];
  try { while(true){const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>maxBytes)throw new Error("PUBLIC_JOURNAL_TOO_LARGE");parts.push(Buffer.from(value));} }
  finally{reader.releaseLock();}
  return Buffer.concat(parts).toString("utf8");
}
export function validateIndex(raw,now) {
  if(!Number.isInteger(raw?.polledAt)||raw.polledAt>now+30000||raw.executionEnabled!==false ||
     raw.actualOrdersEnabled!==false || raw.mode!=="SHADOW" || raw.tradePermission!=="NO_TRADE" ||
     raw.schemaVersion!==JOURNAL_VERSION)throw new Error("UNVERIFIED_CLOUD_STATE");
  for(const s of SYMBOLS)for(const tf of FRAMES) {
    const r=raw.latestByFrame?.[s]?.[tf];
    if(!r || r.executionEnabled!==false || r.tradePermission!=="NO_TRADE" ||
       r.symbol!==s || r.timeframe!==tf)throw new Error("INCOMPLETE_FRAME_JOURNAL");
  }
  return {cohortMatches:raw.codeHash===RELEASE.codeHash&&raw.configHash===RELEASE.configHash,
    ageMs:now-raw.polledAt};
}
