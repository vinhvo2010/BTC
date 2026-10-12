import { observedZones, zoneBreakPressure, frameBias, ZONE_VERSION } from "./zones.js";

/* SCM15 V2 — Deterministic, research-only 15m setup/plan engine.
 * Neither broker orders nor certified SCMv3 full causal zones/scores.
 * All inputs are native Binance USD-M closed candles, with no backdating.
 */

export const VERSION = "SCM15_RESEARCH_PLAN_V2";
export const M15 = 900000;
const TF = { "5m": 300000, "15m": 900000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };
export const PARAMETERS = Object.freeze({
  costRoundtripFraction:0.0023, // ASSUMED, not calibrated account cost.
  minRvol:1.5,minNetRR:2,maxSetupAgeMs:45*60000,
  pivot15mRadius:2,pivotHigherRadius:3,breakoutLookbackBars:20,
});
const COST_RT_FRACTION = PARAMETERS.costRoundtripFraction;
const MIN_RVOL = PARAMETERS.minRvol;
const MIN_NET_RR = PARAMETERS.minNetRR;
const MAX_SETUP_AGE = PARAMETERS.maxSetupAgeMs;
const round = (x, n=6) => Number(x.toFixed(n));

export class DataError extends Error {
  constructor(code) { super(code); this.name = "DataError"; this.code = code; }
}

function num(value) {
  if (value === null || value === undefined || value === "") throw new DataError("INVALID_NUMERIC");
  const v = Number(value);
  if (!Number.isFinite(v)) throw new DataError("NONFINITE_NUMERIC");
  return v;
}
export function parseKlines(rows, timeframe, cutoff, required) {
  const ms = TF[timeframe];
  if (!ms || !Array.isArray(rows) || !Number.isInteger(cutoff) || cutoff % ms)
    throw new DataError("INVALID_FRAME_OR_CUTOFF");
  const selected = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 11) throw new DataError("BAD_BINANCE_KLINE");
    const s = num(r[0]), end = num(r[6])+1;
    if (end > cutoff) continue; // never use still-open candle.
    const [o,h,l,c,v,buy] = [1,2,3,4,5,9].map(k=>num(r[k]));
    if (s < 0 || s % ms || end !== s+ms || Math.min(o,h,l,c)<=0 || l>Math.min(o,c) ||
      h<Math.max(o,c) || v<0 || buy<0 || buy>v) throw new DataError("INVALID_KLINE_VALUES");
    selected.push({s,end,o,h,l,c,v,buy});
  }
  if (selected.length < required) throw new DataError("INSUFFICIENT_"+timeframe.toUpperCase()+"_HISTORY");
  for (let i=1;i<selected.length;i++) if(selected[i-1].s>=selected[i].s)
    throw new DataError("KLINE_DUPLICATE_OR_UNSORTED_"+timeframe.toUpperCase());
  const bars=selected.slice(-required);
  if (bars[bars.length-1].end !== cutoff) throw new DataError("LATEST_CLOSED_"+timeframe.toUpperCase()+"_MISSING");
  for (let i=1;i<bars.length;i++) if(bars[i-1].end!==bars[i].s)
    throw new DataError("KLINE_GAP_CONFLICT_"+timeframe.toUpperCase());
  return bars;
}
function atr(bars,n=14) {
  if(bars.length<200) return null; // operational warm-up requirement
  let a=0;
  for(let i=1;i<=n;i++) a+=Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-bars[i-1].c),Math.abs(bars[i].l-bars[i-1].c));
  a/=n;
  for(let i=n+1;i<bars.length;i++) {
    const tr=Math.max(bars[i].h-bars[i].l,Math.abs(bars[i].h-bars[i-1].c),Math.abs(bars[i].l-bars[i-1].c));
    a=(a*(n-1)+tr)/n;
  }
  return a>0?a:null;
}
export function maturePivots(bars,r=3,cutoff=Infinity) {
  const high=[],low=[];
  for(let i=r;i<bars.length-r;i++){
    const b=bars[i],knownAt=bars[i+r].end;
    if(knownAt>cutoff) continue;
    if(bars.slice(i-r,i).every(x=>b.h>x.h)&&bars.slice(i+1,i+r+1).every(x=>b.h>x.h))
      high.push({price:b.h,at:b.end,knownAt});
    if(bars.slice(i-r,i).every(x=>b.l<x.l)&&bars.slice(i+1,i+r+1).every(x=>b.l<x.l))
      low.push({price:b.l,at:b.end,knownAt});
  }
  return {high,low};
}
function structure(bars,r=3,cutoff=Infinity){
  const p=maturePivots(bars,r,cutoff);
  if(p.high.length<2 || p.low.length<2) return "UNKNOWN";
  const h=p.high.slice(-2),l=p.low.slice(-2);
  if(h[1].price>h[0].price&&l[1].price>l[0].price) return "UP";
  if(h[1].price<h[0].price&&l[1].price<l[0].price) return "DOWN";
  return "MIXED";
}
function tickRound(value,tick,direction){
  if(!Number.isFinite(tick)||tick<=0) throw new DataError("MISSING_TICK_SIZE");
  const scaled=value/tick;
  const rounded=direction==="UP"?Math.ceil(scaled-1e-9):direction==="DOWN"?Math.floor(scaled+1e-9):Math.round(scaled);
  return Number((rounded*tick).toFixed(10));
}
function instrument(info){
  const candidates=(info?.symbols||[]).filter(s=>s.symbol==="ENAUSDT");
  if(candidates.length!==1)throw new DataError("ENA_INSTRUMENT_NOT_UNIQUE");
  const s=candidates[0];
  if(s.status!=="TRADING" || s.contractType!=="PERPETUAL" || s.quoteAsset!=="USDT" ||
     s.marginAsset!=="USDT") throw new DataError("CONTRACT_NOT_TRADING_PERPETUAL_USDT");
  const tick=num((s.filters||[]).find(f=>f.filterType==="PRICE_FILTER")?.tickSize);
  const step=num((s.filters||[]).find(f=>f.filterType==="LOT_SIZE")?.stepSize);
  if(tick<=0||step<=0)throw new DataError("INVALID_EXCHANGE_FILTER");
  return {tick,step,base:s.baseAsset,quote:s.quoteAsset};
}
function latestConditions(bars){
  const i=bars.length-1;
  if(i<20)return null;
  const last=bars[i],previous=bars.slice(i-20,i);
  const meanVolume=previous.reduce((a,b)=>a+b.v,0)/20;
  const priorHigh=Math.max(...previous.map(b=>b.h));
  const priorLow=Math.min(...previous.map(b=>b.l));
  const takerDelta=2*last.buy-last.v;
  const rvol=meanVolume>0?last.v/meanVolume:null;
  return {barEnd:last.end,volumeBase:round(last.v,3),takerBuyBase:round(last.buy,3),
    takerSellBase:round(last.v-last.buy,3),takerDeltaBase:round(takerDelta,3),
    prior20MeanBase:round(meanVolume,3),rvol:rvol==null?null:round(rvol,3),
    minRvol:MIN_RVOL,prior20High:round(priorHigh,8),prior20Low:round(priorLow,8),
    close:last.c,breakoutLong:last.c>priorHigh,breakoutShort:last.c<priorLow,
    return1hPct:round(100*(last.c/bars[i-4].c-1),3),
    window:"20 prior closed 15m candles, Binance USD-M base-asset volume"};
}
function marketEvent(bars,i) {
  if(i<20)return null;
  const last=bars[i],previous=bars.slice(i-20,i),meanVolume=previous.reduce((a,b)=>a+b.v,0)/20;
  if(meanVolume<=0||last.v<=0) return null;
  const priorHigh=Math.max(...previous.map(b=>b.h)),priorLow=Math.min(...previous.map(b=>b.l));
  const rvol=last.v/meanVolume;
  const return1h=100*(last.c/bars[i-4].c-1);
  const delta=2*last.buy-last.v;
  const upBreak=last.c>priorHigh,downBreak=last.c<priorLow;
  const direction=upBreak || (return1h>=3&&delta>0)?"LONG":
    downBreak || (return1h<=-3&&delta<0)?"SHORT":null;
  if(!direction || rvol<MIN_RVOL) return null;
  return {
    side:direction,kind:(upBreak||downBreak)?"BREAKOUT":"MOMENTUM",
    setupClose:last.c,setupEnd:last.end,priorHigh,priorLow,
    setupLow:last.l,setupHigh:last.h,rvol:round(rvol,3),
    return1h:round(return1h,3),takerDelta:round(delta,0),
    deltaFraction:round(delta/last.v,3),
    eligibleTrade:(direction==="LONG"?upBreak&&delta>0:downBreak&&delta<0),
  };
}
export function planForEvent(ev,ctx) {
  const reasons=[];
  const {ena15,ena1,ena4,ena5,btc4,btc1,lockedAt,now,meta,atr15}=ctx;
  if(!ev.eligibleTrade)reasons.push("MOMENTUM_WATCH_ONLY_NEEDS_BREAKOUT");
  const enaH1=structure(ena1,3,ev.setupEnd),btcH1=structure(btc1,3,ev.setupEnd);
  const btcH4=structure(btc4,3,ev.setupEnd);
  if(ev.side==="LONG") {
    if(btcH4==="DOWN"||btcH4==="UNKNOWN")reasons.push("BTC4H_LONG_BLOCKED");
    if(btcH1!=="UP")reasons.push("BTC1H_NOT_UP");
    if(enaH1!=="UP")reasons.push("ENA1H_NOT_UP");
  } else {
    if(btcH4==="UP"||btcH4==="UNKNOWN")reasons.push("BTC4H_SHORT_BLOCKED");
    if(btcH1!=="DOWN")reasons.push("BTC1H_NOT_DOWN");
    if(enaH1!=="DOWN")reasons.push("ENA1H_NOT_DOWN");
  }
  const cutoff=ev.setupEnd;
  const piv15=maturePivots(ena15,2,cutoff);
  const ref=ev.side==="LONG" ? piv15.low.slice(-1)[0] : piv15.high.slice(-1)[0];
  if(!ref || cutoff-ref.knownAt>48*M15) reasons.push("MATURE_15M_INVALIDATION_PIVOT_MISSING");
  const entry=ev.side==="LONG"
    ?tickRound(ev.priorHigh+meta.tick,meta.tick,"UP")
    :tickRound(ev.priorLow-meta.tick,meta.tick,"DOWN");
  const stop=ref ? tickRound(ev.side==="LONG"
    ?Math.min(ref.price,ev.setupLow)-0.15*atr15
    :Math.max(ref.price,ev.setupHigh)+0.15*atr15,
    meta.tick,ev.side==="LONG"?"DOWN":"UP"):null;
  if(stop===null || (ev.side==="LONG"?stop>=entry:stop<=entry)) reasons.push("STRUCTURAL_STOP_INVALID");
  const candidateTargets=[];
  for(const [frame,tf] of [[ena1,"1h"],[ena4,"4h"]]) {
    const piv=maturePivots(frame,3,cutoff);
    const targets=ev.side==="LONG"?piv.high:piv.low;
    for(const p of targets) {
      if(p.knownAt>cutoff || cutoff-p.knownAt>10*24*3600000)continue;
      if(ev.side==="LONG" ? p.price>entry : p.price<entry)
        candidateTargets.push({price:p.price,timeframe:tf,knownAt:p.knownAt});
    }
  }
  candidateTargets.sort((a,b)=>Math.abs(a.price-entry)-Math.abs(b.price-entry));
  const targetRef=candidateTargets[0];
  if(!targetRef)reasons.push("CONFIRMED_PIVOT_TARGET_MISSING");
  const target=targetRef?tickRound(targetRef.price,meta.tick,ev.side==="LONG"?"DOWN":"UP"):null;
  let grossRR=null,netRR=null;
  if(target!==null && stop!==null && entry>0){
    const loss=Math.abs(entry-stop),gross=Math.abs(target-entry),cost=entry*COST_RT_FRACTION;
    grossRR=loss>0?round(gross/loss,3):null;
    netRR=loss>0?round((gross-cost)/(loss+cost),3):null;
    if(netRR===null || netRR<MIN_NET_RR)reasons.push("NET_RR_BELOW_2_AFTER_ASSUMED_COSTS");
  }
  const retests=ena5.filter(b=>b.s>=ev.setupEnd && b.end<=now &&
    b.end<=ev.setupEnd+MAX_SETUP_AGE && (ev.side==="LONG" ?
      b.l<=entry+0.2*atr15 && b.c>entry && 2*b.buy>b.v :
      b.h>=entry-0.2*atr15 && b.c<entry && 2*b.buy<b.v));
  const retest=retests[0]||null;
  if(!retest)reasons.push("LATER_CLOSED_5M_RETEST_NOT_CONFIRMED");
  if(now>ev.setupEnd+MAX_SETUP_AGE) reasons.push("SETUP_EXPIRED");
  // Historical candle close is NOT a real observed receipt; never backdate knowledge.
  const decisionAt=ctx.receivedAt??now;
  const result={
    id:VERSION+":ENAUSDT:15m:"+ev.setupEnd+":"+ev.side,
    side:ev.side,orderType:ev.side==="LONG"?"BUY_LIMIT_ON_RETEST":"SELL_LIMIT_ON_RETEST",
    state:reasons.length?"WATCH":"PLAN_READY_RESEARCH",
    entry:reasons.length?null:entry,
    stop:reasons.length?null:stop,
    target:reasons.length?null:target,
    candidateEntry:entry,candidateStop:stop,candidateTarget:target,
    grossRR,netRR,
    targetTimeframe:targetRef?.timeframe||null,
    stopBasis:"LAST_PRICE_HYPOTHETICAL",
    knownAt:decisionAt,setupAt:ev.setupEnd,expiresAt:ev.setupEnd+MAX_SETUP_AGE,
    trigger5mClosedAt:retest?.end||null,
    reasons,btcH4,btcH1,enaH1,
    model:VERSION,executionEnabled:false,fullCausalScore:null,
    cost:"ASSUMED roundtrip 0.23% of entry incl fee/slippage/funding reserve",
    validatedEdge:false,
  };
  return result;
}
export function analyze({serverTime,clockReceivedAt,requestedAt,receivedAt,btc4Raw,btc1Raw,ena4Raw,ena1Raw,ena15Raw,ena5Raw,ena1dRaw,exchangeInfo}) {
  if(!Number.isInteger(serverTime)||Math.abs(serverTime-clockReceivedAt)>5000)
    throw new DataError("CLOCK_DRIFT_EXCEEDS_5_SECONDS");
  const meta=instrument(exchangeInfo), lock15=Math.floor(requestedAt/M15)*M15;
  if(serverTime < lock15 || receivedAt<requestedAt)throw new DataError("INVALID_CAUSAL_CLOCK");
  const btc4=parseKlines(btc4Raw,"4h",Math.floor(lock15/TF["4h"])*TF["4h"],110);
  const btc1=parseKlines(btc1Raw,"1h",Math.floor(lock15/TF["1h"])*TF["1h"],110);
  const ena4=parseKlines(ena4Raw,"4h",Math.floor(lock15/TF["4h"])*TF["4h"],110);
  const ena1=parseKlines(ena1Raw,"1h",Math.floor(lock15/TF["1h"])*TF["1h"],110);
  const ena15=parseKlines(ena15Raw,"15m",lock15,230);
  const ena1d=ena1dRaw?parseKlines(ena1dRaw,"1d",Math.floor(lock15/TF["1d"])*TF["1d"],110):null;
  // 5m trigger uses a separately completed 5m cutoff no later than trusted request time.
  const ena5=parseKlines(ena5Raw,"5m",Math.floor(requestedAt/TF["5m"])*TF["5m"],120);
  const atr15=atr(ena15);
  if(atr15===null)throw new DataError("ATR14_INSUFFICIENT_HISTORY");
  const ctx={btc4,btc1,ena4,ena1,ena15,ena5,meta,now:receivedAt,receivedAt,lockedAt:lock15,atr15};
  const candidates=[];
  for(let i=ena15.length-4;i<ena15.length;i++) {
    const event=marketEvent(ena15,i);
    if(event && requestedAt-event.setupEnd<=MAX_SETUP_AGE)
      candidates.push({event,plan:planForEvent(event,ctx)});
  }
  const eligible=candidates.map(x=>x.plan).filter(x=>x.state==="PLAN_READY_RESEARCH")
    .sort((a,b)=>b.knownAt-a.knownAt);
  const ready=eligible[0]||null;
  const active=candidates.at(-1)||null;
  const last=ena15.at(-1),btc=btc1.at(-1);
  const latest15m=latestConditions(ena15);
  const state=ready?"SIGNAL_READY":active||latest15m?.breakoutLong||latest15m?.breakoutShort?"WATCH":"NO_SETUP";
  const frameBars={"15m":ena15,"1h":ena1,"4h":ena4};
  if(ena1d)frameBars["1d"]=ena1d;
  const bias=frameBias(frameBars,receivedAt,structure);
  const zones=Object.fromEntries(Object.entries(frameBars).map(([tf,bars])=>[
    tf,observedZones(bars,{timeframe:tf,decisionAt:receivedAt,radius:tf==="15m"?2:3})
      .map(z=>({...z,breakPressure:zoneBreakPressure(z,bars,receivedAt)}))
  ]));
  const assessment={barEnd:lock15,decisionAt:receivedAt,receiptAt:receivedAt,
    state:ready?"PLAN_READY_RESEARCH":active||latest15m?.breakoutLong||latest15m?.breakoutShort?"WATCH":"NO_TRADE",
    side:ready?.side||active?.event.side||(latest15m?.breakoutLong?"LONG":latest15m?.breakoutShort?"SHORT":null),
    reasons:ready?[]:active?.plan.reasons||[
      latest15m?.rvol!=null&&latest15m.rvol<MIN_RVOL?"RVOL_BELOW_1_5":"NO_QUALIFYING_15M_SETUP",
      latest15m?.breakoutLong||latest15m?.breakoutShort?"BREAKOUT_OBSERVED":"NO_20_BAR_BREAKOUT"],
    paperOrderCreated:false,executionEnabled:false};
  return {
    model:VERSION,parameters:PARAMETERS,runAt:receivedAt,decisionCutoff:lock15,timezone:"Asia/Ho_Chi_Minh",
    market:"BINANCE_USDM_PERPETUAL",symbol:"ENAUSDT",quote:"USDT",priceBasis:"LAST_CLOSED",
    fullCausalEngineVerified:false,actualOrdersEnabled:false,
    status:state,signal:ready,assessment15m:assessment,bias,zones,
    zoneVersion:ZONE_VERSION,zoneDefinition:"Causal pivot-wick observations; not full SCMv3 supply/demand engine",
    watch:active?{...active.event,planState:active.plan.state,reasons:active.plan.reasons,
      candidateEntry:active.plan.candidateEntry,candidateStop:active.plan.candidateStop,
      candidateTarget:active.plan.candidateTarget,netRR:active.plan.netRR}:null,
    lastClose:last.c,btcLastClose:btc.c,btcH4:structure(btc4),btcH1:structure(btc1),
    enaH1:structure(ena1),latest15m,rvolLatest:latest15m?.rvol??null,
    atr15:round(atr15,7),tickSize:meta.tick,quantityStep:meta.step,
    bars:ena15.slice(-72).map(b=>({t:b.end,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,buy:b.buy})),
    frameBars:Object.fromEntries(Object.entries(frameBars).map(([tf,bars])=>[
      tf,bars.slice(-72).map(b=>({t:b.end,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,buy:b.buy}))
    ])),
    eventHistory:candidates.map(x=>({...x.event,state:x.plan.state,
      reasonCount:x.plan.reasons.length})),
    costAssumptionPercent:round(COST_RT_FRACTION*100,3),
    btcDominance:"NOT_COLLECTED",fullScores:null,
    dataQuality:"VALID_NATIVELY_CLOSED_CONTIGUOUS_REQUIRED_WINDOWS",
    limitations:["RESEARCH_ONLY","NO_VERIFIED_FULL_CAUSAL_ZONE_SCORE",
      "NO_CALIBRATED_SUCCESS_PROBABILITY","NO_ACCOUNT_EQUITY_OR_TRUE_SLIPPAGE",
      "REAL_ORDER_EXECUTION_DISABLED","HISTORICAL_SOURCE_RECEIPT_NOT_RECORDED"],
  };
}
