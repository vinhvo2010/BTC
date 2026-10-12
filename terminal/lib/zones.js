/* Closed-candle, causal supply/demand observations. These are pivot-wick
 * research zones, not verified SCMv3 full-engine zones or order-book walls. */
export const ZONE_VERSION = "SCM15_PIVOT_WICK_ZONES_V1";
const round=(x,n=6)=>Number(x.toFixed(n));
const sum=(xs,fn)=>xs.reduce((a,x)=>a+fn(x),0);
function atrAtOrigin(bars,i){
  if(i<14)return null;
  const tr=j=>Math.max(bars[j].h-bars[j].l,
    Math.abs(bars[j].h-bars[j-1].c),Math.abs(bars[j].l-bars[j-1].c));
  let atr=0;
  for(let j=1;j<=14;j++)atr+=tr(j);
  atr/=14;
  for(let j=15;j<=i;j++)atr=(13*atr+tr(j))/14;
  return round(atr,8);
}
export function observedZones(bars,{timeframe,decisionAt,radius=2,maxZones=80}){
  if(!Array.isArray(bars)||!bars.length||!Number.isInteger(decisionAt))return [];
  const result=[];
  for(let i=radius;i<bars.length-radius;i++){
    const origin=bars[i],knownAt=bars[i+radius].end;
    if(knownAt>decisionAt)continue;
    for(const kind of ["SUPPLY","DEMAND"]){
      const prior=bars.slice(i-radius,i),later=bars.slice(i+1,i+radius+1);
      const pivot=kind==="SUPPLY"
        ?prior.every(x=>origin.h>x.h)&&later.every(x=>origin.h>x.h)
        :prior.every(x=>origin.l<x.l)&&later.every(x=>origin.l<x.l);
      if(!pivot)continue;
      const lower=kind==="SUPPLY"?Math.min(origin.o,origin.c):origin.l;
      const upper=kind==="SUPPLY"?origin.h:Math.max(origin.o,origin.c);
      if(!(lower<upper))continue;
      const baseline=bars.slice(Math.max(0,i-20),i);
      const baselineVolume=baseline.length?sum(baseline,x=>x.v)/baseline.length:null;
      const after=bars.filter(x=>x.s>=knownAt&&x.end<=decisionAt);
      let state="ACTIVE",retests=0,breakAt=null,inside=false;
      for(const b of after){
        if(kind==="SUPPLY"?b.c>upper:b.c<lower){state="BROKEN";breakAt=b.end;break;}
        const touches=b.h>=lower&&b.l<=upper;
        if(touches&&!inside)retests++;
        inside=touches;
      }
      const buy=origin.buy,sell=origin.v-buy;
      const delta=buy-sell;
      result.push({
        id:ZONE_VERSION+":"+timeframe+":"+kind+":"+origin.s,
        version:ZONE_VERSION,timeframe,kind,state,lower:round(lower,8),upper:round(upper,8),
        originAt:origin.end,knownAt,breakAt,retests,
        formation:"STRICT_PIVOT_R"+radius+"_WICK_BODY",
        atrLocked:atrAtOrigin(bars,i),atrMethod:"WILDER14_CAUSAL_AT_ORIGIN",
        volume:{unit:"base asset",origin:round(origin.v,3),takerBuy:round(buy,3),
          takerSell:round(sell,3),takerDelta:round(delta,3),
          buySharePct:origin.v>0?round(100*buy/origin.v,1):null,
          prior20Mean:baselineVolume==null?null:round(baselineVolume,3),
          relative:baselineVolume>0?round(origin.v/baselineVolume,2):null},
      });
    }
  }
  return result.slice(-maxZones);
}
export function zoneBreakPressure(zone,bars,decisionAt){
  if(zone.state==="BROKEN")return {level:"BROKEN",reasons:["CLOSED_CANDLE_BEYOND_FAR_EDGE"],probability:null};
  const last=bars.filter(b=>b.end<=decisionAt).at(-1);
  if(!last)return {level:"UNKNOWN",reasons:["NO_CLOSED_BAR"],probability:null};
  const span=zone.upper-zone.lower;
  const distance=zone.kind==="SUPPLY"?zone.lower-last.c:last.c-zone.upper;
  const near=distance<=2*span;
  const directional=zone.kind==="SUPPLY"?zone.volume.takerDelta>0:zone.volume.takerDelta<0;
  const highVolume=zone.volume.relative!=null&&zone.volume.relative>=1.5;
  const reasons=[];
  if(near)reasons.push("PRICE_NEAR_ZONE");
  if(zone.retests>=2)reasons.push("REPEATED_RETEST");
  if(directional&&highVolume)reasons.push("ORIGIN_FLOW_AND_VOLUME_TOWARD_BREAK");
  const score=Number(near)+Number(zone.retests>=2)+Number(directional&&highVolume);
  return {level:score>=3?"HIGH":score>=2?"MEDIUM":"LOW",reasons,probability:null,
    note:"Heuristic pressure, not calibrated break probability"};
}
export function frameBias(frames,decisionAt,structureFn){
  const weights={"15m":1,"1h":2,"4h":3,"1d":4};
  const details={};let long=0,short=0,possible=0;
  for(const [tf,bars] of Object.entries(frames)){
    const weight=weights[tf];if(!weight)continue;possible+=weight;
    const state=structureFn(bars,tf==="15m"?2:3,decisionAt);
    const recent=bars.filter(b=>b.end<=decisionAt).slice(-20);
    const volume=sum(recent,b=>b.v),buy=sum(recent,b=>b.buy);
    details[tf]={structure:state,closedAt:recent.at(-1)?.end??null,
      takerBuySharePct:volume>0?round(100*buy/volume,1):null,
      volumeBase:round(volume,3)};
    if(state==="UP")long+=weight;
    if(state==="DOWN")short+=weight;
  }
  const observed=long+short;
  return {method:"WEIGHTED_CLOSED_PIVOT_STRUCTURE_V1",weights,
    longEvidencePct:observed?round(100*long/observed,1):null,
    shortEvidencePct:observed?round(100*short/observed,1):null,
    directionalCoveragePct:possible?round(100*observed/possible,1):0,
    leaning:observed<3?"UNDETERMINED":long>short?"LONG":short>long?"SHORT":"BALANCED",
    probability:null,details,
    note:"Evidence share from mature pivots, not win probability or entry permission"};
}
