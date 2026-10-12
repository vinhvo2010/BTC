import { FRAMES,SYMBOLS,frameCutoff } from "../lib/multiframe.js";
import { RELEASE } from "../lib/provenance.js";
export const at=Date.UTC(2026,9,12,6,2);
export function payload(t=at) {
 const assessments=Object.fromEntries(SYMBOLS.map(symbol=>[symbol,Object.fromEntries(FRAMES.map(timeframe=>[timeframe,{
   symbol,timeframe,state:"WAIT",leaning:"UNDETERMINED",
   barCutoff:frameCutoff(t,timeframe),closedAt:frameCutoff(t,timeframe),
   decisionAt:t+2000,receivedAt:t+1000,audit:{status:"VALID",reasons:[]},
   reasons:["NO_CONFIRMED_20_BAR_BREAKOUT"],blockedBy:["ACCOUNT_EQUITY_UNVERIFIED"],
   executionEnabled:false,paperOrderCreated:false,tradePermission:"NO_TRADE",
   entry:null,stop:null,target:null,size:null,netRR:null,probability:null,
   volume:{rvol:0.8},breakout:null,structure:"MIXED",
 }]))]));
 return {runAt:t+2000,mode:"SHADOW",executionEnabled:false,actualOrdersEnabled:false,
   paperOrderCreated:false,tradePermission:"NO_TRADE",signal:null,status:"NO_SETUP",
   assessments,release:RELEASE,sourceErrors:{},sourceEvidence:{},
   btcDominance:{status:"UNAVAILABLE",reason:"COINGECKO_HTTP_429"}};
}
export const transport=(t=at)=>({requestedAt:t,receivedAt:t+3000,httpStatus:200});
export function res(){return {setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return data}}}
