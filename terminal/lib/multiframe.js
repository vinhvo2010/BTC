import { maturePivots } from "./engine.js";
import { observedZones, zoneBreakPressure } from "./zones.js";

export const MULTIFRAME_VERSION = "SCM15_MULTIFRAME_RESEARCH_V1";
export const FRAMES = Object.freeze(["15m","1h","4h","1d","1w","1M"]);
export const SYMBOLS = Object.freeze(["BTCUSDT","ENAUSDT"]);
const FIXED = {"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000,"1w":604800000};
const WARMUP = {"15m":230,"1h":110,"4h":110,"1d":80,"1w":50,"1M":30};
const WEIGHTS = {"15m":1,"1h":2,"4h":3,"1d":4,"1w":5,"1M":6};
const round=(v,n=6)=>Number(v.toFixed(n));

export function frameCutoff(at,tf) {
  if(!Number.isInteger(at)||!FRAMES.includes(tf))throw new Error("INVALID_FRAME_CLOCK");
  if(tf==="1M"){const d=new Date(at);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)}
  if(tf==="1w"){const d=new Date(at),day=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
    return day-((d.getUTCDay()+6)%7)*86400000}
  return Math.floor(at/FIXED[tf])*FIXED[tf];
}
export function frameEnd(start,tf) {
  if(tf==="1M"){const d=new Date(start);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)}
  return start+FIXED[tf];
}
function number(x){if(x===null||x===undefined||x===""||!Number.isFinite(Number(x)))return null;return Number(x)}
export function auditNativeFrame(rows,tf,requestedAt,receivedAt) {
  const cutoff=frameCutoff(requestedAt,tf),reasons=[],bars=[];
  let duplicates=0,conflicts=0,gaps=0,openExcluded=0;
  if(!Array.isArray(rows))reasons.push("SOURCE_MISSING");
  else for(const r of rows) {
    if(!Array.isArray(r)||r.length<11){conflicts++;continue}
    const [s,o,h,l,c,v,buy,endRaw]=[r[0],r[1],r[2],r[3],r[4],r[5],r[9],r[6]].map(number);
    if([s,o,h,l,c,v,buy,endRaw].some(x=>x===null)){conflicts++;continue}
    const end=endRaw+1;
    if(end>cutoff){openExcluded++;continue}
    if(s!==frameCutoff(s,tf)||end!==frameEnd(s,tf)||o<=0||h<=0||l<=0||c<=0||
       v<0||buy<0||buy>v||l>Math.min(o,c)||h<Math.max(o,c)){conflicts++;continue}
    bars.push({s,end,o,h,l,c,v,buy});
  }
  bars.sort((a,b)=>a.s-b.s);
  for(let i=1;i<bars.length;i++){
    if(bars[i].s===bars[i-1].s)duplicates++;
    else if(bars[i].s!==bars[i-1].end)gaps++;
  }
  if(conflicts||duplicates)reasons.push("DATA_CONFLICT");
  if(gaps)reasons.push("CLOSED_CANDLE_GAP");
  if(!bars.length||bars.at(-1).end!==cutoff)reasons.push("LATEST_CLOSED_BAR_MISSING");
  const warmupMissing=Math.max(0,WARMUP[tf]-bars.length);
  if(warmupMissing)reasons.push("WARMUP_INCOMPLETE");
  if(!Number.isInteger(receivedAt)||receivedAt<requestedAt)reasons.push("INVALID_RECEIPT_CLOCK");
  return {bars,audit:{timeframe:tf,barCutoff:cutoff,requestedAt,receivedAt,
    closedCount:bars.length,gaps,duplicates,conflicts,openExcluded,
    requiredWarmup:WARMUP[tf],warmupMissing,
    status:reasons.length?"DATA_INCOMPLETE":"VALID",reasons}};
}
function swingState(bars,r,decisionAt){
  const p=maturePivots(bars,r,decisionAt);
  if(p.high.length<2||p.low.length<2)return {state:"UNKNOWN",high:p.high.at(-1)||null,low:p.low.at(-1)||null};
  const h=p.high.slice(-2),l=p.low.slice(-2);
  return {state:h[1].price>h[0].price&&l[1].price>l[0].price?"UP":
    h[1].price<h[0].price&&l[1].price<l[0].price?"DOWN":"MIXED",
    high:h[1],low:l[1]};
}
function volumeWindow(bars) {
  if(bars.length<21)return {status:"WARMUP_INCOMPLETE",windowBars:20,volumeBase:null,
    takerBuyBase:null,takerSellBase:null,takerDeltaBase:null,rvol:null};
  const recent=bars.at(-1),prior=bars.slice(-21,-1);
  const mean=prior.reduce((a,b)=>a+b.v,0)/20,sell=recent.v-recent.buy;
  return {status:mean>0?"VALID":"ZERO_BASELINE",windowBars:20,
    volumeBase:round(recent.v,3),takerBuyBase:round(recent.buy,3),
    takerSellBase:round(sell,3),takerDeltaBase:round(recent.buy-sell,3),
    prior20MeanBase:round(mean,3),rvol:mean>0?round(recent.v/mean,3):null,
    takerBuySharePct:recent.v>0?round(100*recent.buy/recent.v,2):null};
}
export function assessFrame(symbol,tf,report,decisionAt,btcDominance,instrumentStatus){
  const {bars,audit}=report,last=bars.at(-1)||null;
  const extra=[];
  if(audit.receivedAt>decisionAt)extra.push("RECEIPT_AFTER_DECISION");
  if(instrumentStatus!=="VALID")extra.push("INSTRUMENT_METADATA_UNVERIFIED");
  const assessedAudit=extra.length?{...audit,status:"DATA_INCOMPLETE",
    reasons:[...audit.reasons,...extra]}:audit;
  const valid=assessedAudit.status==="VALID";
  const radius=tf==="15m"||tf==="1M"?2:3;
  const swing=valid?swingState(bars,radius,decisionAt):{state:"UNKNOWN",high:null,low:null};
  const volume=valid?volumeWindow(bars):{status:"DATA_INCOMPLETE",volumeBase:null,
    takerBuyBase:null,takerSellBase:null,takerDeltaBase:null,rvol:null};
  const prior=valid?bars.slice(-21,-1):[],priorHigh=prior.length===20?Math.max(...prior.map(b=>b.h)):null;
  const priorLow=prior.length===20?Math.min(...prior.map(b=>b.l)):null;
  const breakout=valid&&priorHigh!==null?(last.c>priorHigh?"LONG":last.c<priorLow?"SHORT":null):null;
  const side=breakout||(swing.state==="UP"?"LONG":swing.state==="DOWN"?"SHORT":null);
  const reasons=[...assessedAudit.reasons];
  if(valid&&!breakout)reasons.push("NO_CONFIRMED_20_BAR_BREAKOUT");
  if(valid&&breakout&&!(volume.rvol>=1.5))reasons.push("RVOL_BELOW_1_5_OR_MISSING");
  const blockedBy=["ACCOUNT_EQUITY_UNVERIFIED","OPEN_RISK_UNVERIFIED",
    "FEES_SLIPPAGE_FUNDING_UNCALIBRATED","FULL_SCMV3_ENGINE_NOT_IMPLEMENTED"];
  const btcDValid=btcDominance?.status==="VALID"&&btcDominance.receivedAt<=decisionAt&&
    btcDominance.asOf<=decisionAt;
  if(symbol==="ENAUSDT"&&!btcDValid)blockedBy.push("BTC_D_UNAVAILABLE_OR_POST_DECISION");
  return {id:MULTIFRAME_VERSION+":"+symbol+":"+tf+":"+audit.barCutoff,
    symbol,timeframe:tf,market:"BINANCE_USDM_PERPETUAL",priceBasis:"LAST_CLOSED",
    barCutoff:audit.barCutoff,decisionAt,receivedAt:audit.receivedAt,
    state:!valid?"DATA_INCOMPLETE":breakout?"WATCH":"WAIT",
    observation:breakout?"CLOSED_20_BAR_BREAKOUT":"MATURE_PIVOT_STRUCTURE",
    leaning:side||"UNDETERMINED",tradePermission:"NO_TRADE",paperOrderCreated:false,
    executionEnabled:false,closedAt:last?.end??null,close:last?.c??null,
    structure:swing.state,pivotRadius:radius,pivotHigh:swing.high,pivotLow:swing.low,
    volume,breakout,prior20High:priorHigh,prior20Low:priorLow,
    evidenceSupport:valid?(breakout&&volume.rvol>=1.5?"VUA":side?"THAP":"CHUA_XAC_DINH"):null,
    probability:null,entry:null,stop:null,target:null,size:null,netRR:null,
    scenarios:valid?{
      long:{triggerAbove:priorHigh,invalidationBelow:priorLow,target:null,action:"WATCH"},
      short:{triggerBelow:priorLow,invalidationAbove:priorHigh,target:null,action:"WATCH"},
      range:{lower:priorLow,upper:priorHigh,action:"WAIT"}
    }:null,
    reasons,blockedBy,audit:assessedAudit};
}
function evidenceBias(assessments){
  let long=0,short=0;
  for(const [tf,a] of Object.entries(assessments)){
    if(a.audit.status!=="VALID")continue;
    if(a.structure==="UP")long+=WEIGHTS[tf];
    if(a.structure==="DOWN")short+=WEIGHTS[tf];
  }
  const observed=long+short,possible=Object.values(WEIGHTS).reduce((a,b)=>a+b,0);
  return {method:"WEIGHTED_MATURE_PIVOT_STRUCTURE_V2",weights:WEIGHTS,
    longEvidencePct:observed?round(100*long/observed,1):null,
    shortEvidencePct:observed?round(100*short/observed,1):null,
    directionalCoveragePct:round(100*observed/possible,1),
    leaning:observed?long>short?"LONG":short>long?"SHORT":"BALANCED":"UNDETERMINED",
    probability:null,note:"Evidence share, not success probability or trading permission"};
}
export const FRAME_BIAS_VERSION = "SCM15_FRAME_EVIDENCE_SHARE_V1";
export function frameEvidenceBias(a){
  const empty={model:FRAME_BIAS_VERSION,status:"DATA_INCOMPLETE",longEvidencePct:null,
    shortEvidencePct:null,neutralEvidencePct:null,coveragePct:0,
    leaning:"UNDETERMINED",basis:null,probability:null};
  if(a?.audit?.status!=="VALID")return {...empty,reasons:a?.audit?.reasons||["SOURCE_UNAVAILABLE"]};
  let long=0,short=0,neutral=0,available=0;
  const basis={structure:a.structure,breakout:a.breakout||"NONE",
    takerBuySharePct:a.volume?.takerBuySharePct??null};
  if(a.structure==="UP"){long++;available++}
  else if(a.structure==="DOWN"){short++;available++}
  else if(a.structure==="MIXED"){neutral++;available++}
  else neutral++;
  if(a.breakout==="LONG"){long++;available++}
  else if(a.breakout==="SHORT"){short++;available++}
  else {neutral++;if(a.prior20High!=null&&a.prior20Low!=null)available++}
  if(typeof basis.takerBuySharePct==="number"&&
     basis.takerBuySharePct>=0&&basis.takerBuySharePct<=100){
    long+=basis.takerBuySharePct/100;
    short+=1-basis.takerBuySharePct/100;
    available++;
  }else neutral++;
  const longEvidencePct=round(100*long/3,1),shortEvidencePct=round(100*short/3,1);
  const neutralEvidencePct=Math.max(0,round(100-longEvidencePct-shortEvidencePct,1));
  const opposed=(a.structure==="UP"&&a.breakout==="SHORT")||
    (a.structure==="DOWN"&&a.breakout==="LONG");
  const leaning=opposed?"MIXED":
    longEvidencePct>shortEvidencePct&&
      (a.structure==="UP"||a.breakout==="LONG")?"LONG":
    shortEvidencePct>longEvidencePct&&
      (a.structure==="DOWN"||a.breakout==="SHORT")?"SHORT":"UNDETERMINED";
  return {model:FRAME_BIAS_VERSION,status:"VALID",longEvidencePct,shortEvidencePct,
    neutralEvidencePct,coveragePct:round(100*available/3,1),leaning,basis,
    probability:null,note:"Three observation weights: confirmed structure, closed 20-bar breakout, taker-side share. Not trade permission or win probability."};
}
export function buildMultiframe({rawBySymbol={},receiptBySymbol={},requestedAt,decisionAt,btcDominance=null,instrumentMetadata={}}){
  const assessments={},frameBarsBySymbol={},zonesBySymbol={},biasBySymbol={},frameBiasBySymbol={};
  for(const symbol of SYMBOLS){
    assessments[symbol]={};frameBarsBySymbol[symbol]={};zonesBySymbol[symbol]={};frameBiasBySymbol[symbol]={};
    for(const tf of FRAMES){
      const report=auditNativeFrame(rawBySymbol[symbol]?.[tf],tf,requestedAt,
        receiptBySymbol[symbol]?.[tf]);
      const a=assessFrame(symbol,tf,report,decisionAt,btcDominance,instrumentMetadata[symbol]);
      assessments[symbol][tf]=a;
      frameBiasBySymbol[symbol][tf]=frameEvidenceBias(a);
      frameBarsBySymbol[symbol][tf]=report.bars.slice(-72).map(b=>({
        t:b.end,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,buy:b.buy}));
      const bars=a.audit.status==="VALID"?report.bars:[];
      zonesBySymbol[symbol][tf]=observedZones(bars,{timeframe:tf,
        decisionAt,radius:tf==="15m"||tf==="1M"?2:3,maxZones:24})
        .map(z=>({...z,breakPressure:zoneBreakPressure(z,bars,decisionAt)}));
    }
    biasBySymbol[symbol]=evidenceBias(assessments[symbol]);
  }
  return {multiframeModel:MULTIFRAME_VERSION,frames:FRAMES,symbols:SYMBOLS,
    assessments,frameBarsBySymbol,zonesBySymbol,biasBySymbol,frameBiasBySymbol,
    moduleCoverage:{macroCycle:"NOT_IMPLEMENTED",pringSourceIndex:"NOT_IMPLEMENTED",
      fundingSettledVsDisplayed:"NOT_IMPLEMENTED",openInterest15m60m:"NOT_IMPLEMENTED",
      spotFuturesSeparateFlow:"NOT_IMPLEMENTED",orderBookPersistence:"NOT_IMPLEMENTED",
      reverseDivergence:"NOT_IMPLEMENTED",accountRiskAndCosts:"NOT_VERIFIED"},
    persistence:"ON_DEMAND_ONLY_NO_DURABLE_PER_BAR_HISTORY"};
}
