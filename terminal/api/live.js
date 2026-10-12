import { analyze, DataError } from "../lib/engine.js";
import { buildMultiframe, FRAMES, SYMBOLS } from "../lib/multiframe.js";
import { withProvenance } from "../lib/provenance.js";

export const config = { maxDuration: 30 };
const VERSION = "SCM15_RESEARCH_MULTIFRAME_V3";
const HOSTS = ["https://fapi.binance.com","https://fapi1.binance.com"];
const ALLOWED = new Set(["/fapi/v1/time","/fapi/v1/exchangeInfo","/fapi/v1/klines"]);
function safeUrl(host,path,params) {
  if(!ALLOWED.has(path))throw new DataError("UNAPPROVED_PUBLIC_ENDPOINT");
  const url=new URL(host+path);
  for(const [k,v] of Object.entries(params||{}))url.searchParams.set(k,String(v));
  return url;
}
async function binance(path,params) {
  let err;
  for(const host of HOSTS) {
    try {
      const requestedAt=Date.now();
      const response=await fetch(safeUrl(host,path,params),{
        signal:AbortSignal.timeout(9500),headers:{"Accept":"application/json"},cache:"no-store"});
      if(!response.ok)throw new DataError("BINANCE_HTTP_"+response.status);
      const raw=await response.json();
      if(raw?.code && raw.code<0)throw new DataError("BINANCE_API_"+raw.code);
      const receivedAt=Date.now();
      return {raw,requestedAt,receivedAt,source:host+path};
    }catch(e) {
      err=e;
      if(e instanceof DataError && (e.code==="UNAPPROVED_PUBLIC_ENDPOINT"||
        ["BINANCE_HTTP_403","BINANCE_HTTP_429","BINANCE_HTTP_451"].includes(e.code)))throw e;
    }
  }
  throw new DataError("BINANCE_PUBLIC_UNAVAILABLE_"+(err?.code||err?.name||"UNKNOWN"));
}
async function dominance() {
  const source="https://api.coingecko.com/api/v3/global",requestedAt=Date.now();
  try {
    const response=await fetch(source,{signal:AbortSignal.timeout(6500),
      headers:{"Accept":"application/json"},cache:"no-store"});
    if(!response.ok)return {status:"UNAVAILABLE",reason:"COINGECKO_HTTP_"+response.status,
      source,requestedAt,receivedAt:Date.now(),valuePct:null,asOf:null};
    const data=(await response.json())?.data,receivedAt=Date.now();
    const valuePct=Number(data?.market_cap_percentage?.btc),asOf=Number(data?.updated_at)*1000;
    if(!Number.isFinite(valuePct)||valuePct<0||valuePct>100||!Number.isInteger(asOf))
      return {status:"UNAVAILABLE",reason:"BTC_D_INVALID",source,requestedAt,receivedAt,valuePct:null,asOf:null};
    const age=receivedAt-asOf;
    return {status:age>=0&&age<=900000?"VALID":"STALE",
      reason:age>=0&&age<=900000?null:"BTC_D_STALE_OR_FUTURE",
      valuePct,asOf,requestedAt,receivedAt,source,
      definition:"CoinGecko global BTC market-cap share of tracked crypto assets; not net buy flow"};
  }catch(e) {
    return {status:"UNAVAILABLE",reason:"COINGECKO_READ_FAILED",source,
      requestedAt,receivedAt:Date.now(),valuePct:null,asOf:null};
  }
}

const key=(symbol,tf)=>symbol+"_"+tf;
function instrumentStatus(info,symbol){
  const item=info?.symbols?.find(x=>x.symbol===symbol);
  return item?.status==="TRADING"&&item?.contractType==="PERPETUAL"&&
    item?.quoteAsset==="USDT"&&item?.marginAsset==="USDT"?"VALID":"UNVERIFIED";
}
function safeFailure(code,at,requestedAt=null,multi=null){
  multi??=buildMultiframe({requestedAt:requestedAt??at,decisionAt:at});
  return {model:VERSION,status:"DATA_BLOCKED",reason:code,runAt:at,
    decisionCutoff:null,requestedAt,receivedAt:at,signal:null,watch:null,
    actualOrdersEnabled:false,executionEnabled:false,tradePermission:"NO_TRADE",
    assessment15m:{barEnd:null,decisionAt:at,receiptAt:null,state:"NO_TRADE",
      side:null,reasons:["DATA_BLOCKED",code],paperOrderCreated:false,executionEnabled:false},
    ...multi,dataQuality:"NOT_VALIDATED",backend:"VERCEL_FUNCTION"};
}
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="GET")return res.status(405).json({status:"METHOD_NOT_ALLOWED"});
  const start=Date.now(),observedReads={};
  const includeEvidence=new URL(req.url||"/api/live","https://skydeal.app").searchParams.get("evidence")==="1";
  const send=(data,reads={},errors={})=>res.status(200).json({
    ...withProvenance(data,reads,errors),
    ...(includeEvidence?{sourceReadPayloads:Object.fromEntries(Object.entries(reads).filter(([,r])=>r.raw!==undefined).map(([id,r])=>[id,r.raw]))}:{}),
  });
  try {
    const clock=await binance("/fapi/v1/time");
    observedReads.CLOCK=clock;
    if(!Number.isInteger(clock.raw?.serverTime)||
      Math.abs(clock.raw.serverTime-clock.receivedAt)>5000)
      throw new DataError("BINANCE_CLOCK_UNVERIFIED");
    const requestedAt=Date.now();
    const jobs=[];
    for(const symbol of SYMBOLS)for(const tf of FRAMES)
      jobs.push({id:key(symbol,tf),run:binance("/fapi/v1/klines",
        {symbol,interval:tf,limit:tf==="15m"?250:130})});
    // Closed 5m ENA bars only support later 15m retest observation.
    jobs.push({id:"ENAUSDT_5m",run:binance("/fapi/v1/klines",
      {symbol:"ENAUSDT",interval:"5m",limit:130})});
    jobs.push({id:"ENA_INFO",run:binance("/fapi/v1/exchangeInfo",{symbol:"ENAUSDT"})});
    jobs.push({id:"BTC_INFO",run:binance("/fapi/v1/exchangeInfo",{symbol:"BTCUSDT"})});
    jobs.push({id:"BTC_D",run:dominance()});
    const settled=await Promise.allSettled(jobs.map(j=>j.run)),reads={},errors={};
    settled.forEach((v,i)=>{if(v.status==="fulfilled")reads[jobs[i].id]=v.value;
      else errors[jobs[i].id]=v.reason instanceof DataError?v.reason.code:
        "SOURCE_READ_FAILED_"+(v.reason?.name||"UNKNOWN")});
    const receivedAt=Date.now(),rawBySymbol={},receiptBySymbol={};
    for(const symbol of SYMBOLS){
      rawBySymbol[symbol]={};receiptBySymbol[symbol]={};
      for(const tf of FRAMES){
        rawBySymbol[symbol][tf]=reads[key(symbol,tf)]?.raw;
        receiptBySymbol[symbol][tf]=reads[key(symbol,tf)]?.receivedAt;
      }
    }
    const btcD=reads.BTC_D||{status:"UNAVAILABLE",valuePct:null,
      reason:"BTC_D_SOURCE_MISSING",receivedAt:null,asOf:null};
    if(btcD.status!=="VALID")errors.BTC_D=btcD.reason||"BTC_D_NOT_VALID";
    const instrumentMetadata={BTCUSDT:instrumentStatus(reads.BTC_INFO?.raw,"BTCUSDT"),
      ENAUSDT:instrumentStatus(reads.ENA_INFO?.raw,"ENAUSDT")};
    const multi=buildMultiframe({rawBySymbol,receiptBySymbol,requestedAt,decisionAt:receivedAt,
      btcDominance:btcD,instrumentMetadata});
    const sourceReceipts={clock:clock.receivedAt},sourceAudit={clock:clock.source};
    for(const [id,read] of Object.entries(reads))if(read?.source){
      sourceReceipts[id]=read.receivedAt;sourceAudit[id]=read.source;
    }
    let old;
    try {
      const required=["BTCUSDT_4h","BTCUSDT_1h","ENAUSDT_4h","ENAUSDT_1h",
        "ENAUSDT_15m","ENAUSDT_5m","ENAUSDT_1d","ENA_INFO"];
      for(const id of required)if(!reads[id])throw new DataError(errors[id]||"SOURCE_MISSING_"+id);
      old=analyze({serverTime:clock.raw.serverTime,clockReceivedAt:clock.receivedAt,
        requestedAt,receivedAt,btc4Raw:reads.BTCUSDT_4h.raw,btc1Raw:reads.BTCUSDT_1h.raw,
        ena4Raw:reads.ENAUSDT_4h.raw,ena1Raw:reads.ENAUSDT_1h.raw,
        ena15Raw:reads.ENAUSDT_15m.raw,ena5Raw:reads.ENAUSDT_5m.raw,
        ena1dRaw:reads.ENAUSDT_1d.raw,exchangeInfo:reads.ENA_INFO.raw});
    }catch(e) {
      const code=e instanceof DataError?e.code:"LEGACY_RESEARCH_ERROR";
      return send({...safeFailure(code,receivedAt,requestedAt,multi),
        btcDominance:btcD,instrumentMetadata,sourceReceipts,sourceAudit,sourceErrors:errors,
        fetchLatencyMs:receivedAt-start}, {...reads,CLOCK:clock}, errors);
    }
    // The public website has no verified account risk/cost or durable Paper ledger.
    // Existing 15m candidate plans stay non-actionable even if the old research
    // predicate passes; never expose entry/stop/target/size as approved orders.
    const observed=old.signal?{side:old.signal.side,setupAt:old.signal.setupAt,
      reason:"RESEARCH_CANDIDATE_ONLY_ACCOUNT_AND_COST_GATES_UNVERIFIED"}:null;
    const assessment15m={...old.assessment15m,
      state:old.assessment15m?.state==="PLAN_READY_RESEARCH"?"WATCH":old.assessment15m?.state,
      reasons:old.assessment15m?.state==="PLAN_READY_RESEARCH"?
        ["ACCOUNT_AND_COST_GATES_UNVERIFIED"]:old.assessment15m?.reasons};
    const watch=old.watch?{...old.watch,candidateEntry:null,candidateStop:null,
      candidateTarget:null,netRR:null}:observed;
    return send({...old,...multi,model:VERSION,
      status:old.status==="SIGNAL_READY"?"WATCH":old.status,
      signal:null,watch,assessment15m,btcDominance:btcD,
      tradePermission:"NO_TRADE",actualOrdersEnabled:false,executionEnabled:false,
      sourceReceipts,sourceAudit,sourceErrors:errors,
      instrumentMetadata,
      fetchLatencyMs:receivedAt-start,
      limitations:[...old.limitations,"SCHEDULED_JOURNAL_HEALTH_REQUIRES_FEED",
        "NO_VERIFIED_ACCOUNT_RISK","NOT_ALL_PROMPT_MODULES_IMPLEMENTED"],
      userInstruction:"Every frame has an assessment; scheduled receipts are stored separately; no Paper or real order is created."}, {...reads,CLOCK:clock}, errors);
  }catch(err){
    const at=Date.now(),code=err instanceof DataError?err.code:"INTERNAL_RESEARCH_ERROR";
    return send({...safeFailure(code,at,start),
      fetchLatencyMs:at-start}, observedReads, {CLOCK_OR_RUNTIME:code});
  }
}
