const assert=require("node:assert/strict");
const http=require("node:http"),fs=require("node:fs");
const {chromium}=require("/Users/vinhvo/.codex/.chatgpt-projects/g-p-6ac605788564819194b2f9c6d116707f/apps/web/node_modules/@playwright/test");
const now=Date.now(),barEnd=Math.floor(now/900000)*900000;
const bars=Array.from({length:12},(_,i)=>({t:barEnd-(11-i)*900000,o:.24,h:.241,l:.239,c:.24+i*.00001,v:1000+i*30,buy:500+i*20}));
const zone={kind:"SUPPLY",state:"ACTIVE",lower:.2405,upper:.241,
 originAt:barEnd-3600000,knownAt:barEnd-1800000,retests:1,formation:"STRICT_PIVOT_R2_WICK_BODY",atrLocked:.002,
 volume:{origin:2000,takerBuy:1200,takerSell:800,takerDelta:400,relative:1.4},
 breakPressure:{level:"LOW",reasons:[],probability:null}};
const payload={status:"NO_SETUP",runAt:now,decisionCutoff:barEnd,lastClose:.24,btcLastClose:80000,
 btcH4:"MIXED",btcH1:"UP",enaH1:"UP",atr15:.002,dataQuality:"VALID_NATIVELY_CLOSED_CONTIGUOUS_REQUIRED_WINDOWS",
 signal:null,watch:null,bars,frameBars:{"15m":bars,"1h":bars,"4h":bars,"1d":bars},
 zones:{"15m":[zone],"1h":[{...zone,timeframe:"1h"}],"4h":[]},
 bias:{longEvidencePct:33.3,shortEvidencePct:66.7,directionalCoveragePct:100,leaning:"SHORT",
 details:{"15m":{structure:"UP",takerBuySharePct:55,volumeBase:10000},
 "1h":{structure:"DOWN",takerBuySharePct:45,volumeBase:20000},
 "4h":{structure:"DOWN",takerBuySharePct:40,volumeBase:30000}}},
 assessment15m:{barEnd,decisionAt:now,state:"NO_TRADE",reasons:["NO_QUALIFYING_15M_SETUP"],paperOrderCreated:false},
 eventHistory:[],btcDominance:{status:"VALID",valuePct:59.5,asOf:barEnd-1000,receivedAt:barEnd}};
const frames=["15m","1h","4h","1d","1w","1M"];
payload.assessments=Object.fromEntries(["BTCUSDT","ENAUSDT"].map(symbol=>[symbol,
 Object.fromEntries(frames.map(tf=>[tf,{symbol,timeframe:tf,state:"WAIT",tradePermission:"NO_TRADE",
  close:symbol==="BTCUSDT"?80000:.24,structure:"MIXED",closedAt:barEnd,
  prior20High:symbol==="BTCUSDT"?80100:.241,prior20Low:symbol==="BTCUSDT"?79900:.239,
  scenarios:{long:{triggerAbove:symbol==="BTCUSDT"?80100:.241,
    invalidationBelow:symbol==="BTCUSDT"?79900:.239},
    short:{triggerBelow:symbol==="BTCUSDT"?79900:.239,
    invalidationAbove:symbol==="BTCUSDT"?80100:.241}},
  decisionAt:now,audit:{status:"VALID",closedCount:120,requiredWarmup:30,gaps:0,
    duplicates:0,conflicts:0},reasons:["NO_CONFIRMED_20_BAR_BREAKOUT"],
  blockedBy:["ACCOUNT_EQUITY_UNVERIFIED"],volume:{volumeBase:1000,
    takerBuySharePct:60,takerDeltaBase:200,rvol:1}}]))]));
payload.frameBarsBySymbol={BTCUSDT:Object.fromEntries(frames.map(tf=>[tf,
 bars.map(b=>({...b,o:80000,h:80100,l:79900,c:80000}))])),
 ENAUSDT:Object.fromEntries(frames.map(tf=>[tf,bars]))};
payload.zonesBySymbol={BTCUSDT:Object.fromEntries(frames.map(tf=>[tf,[]])),
 ENAUSDT:Object.fromEntries(frames.map(tf=>[tf,tf==="15m"?[zone]:[]]))};
payload.biasBySymbol={BTCUSDT:{longEvidencePct:50,shortEvidencePct:50,
 directionalCoveragePct:40,leaning:"BALANCED"},ENAUSDT:payload.bias};
payload.frameBiasBySymbol=Object.fromEntries(["BTCUSDT","ENAUSDT"].map(symbol=>[symbol,
 Object.fromEntries(frames.map(tf=>[tf,{status:"VALID",longEvidencePct:40,
  shortEvidencePct:30,neutralEvidencePct:30,coveragePct:100,leaning:"LONG",
  basis:{takerBuySharePct:60},probability:null}]))]));
payload.frameBiasBySymbol.BTCUSDT["1w"]={status:"DATA_INCOMPLETE",longEvidencePct:null,
 shortEvidencePct:null,neutralEvidencePct:null,coveragePct:0,reasons:["CLOSED_CANDLE_GAP"]};
const historyRows=Array.from({length:32},(_,i)=>({
 id:"fixture-"+i,kind:"DECISION",symbol:"ENAUSDT",timeframe:"4h",state:"DATA_INCOMPLETE",
 expectedCutoff:barEnd,decisionAt:now-i*1000,receivedAt:now-i*1000-100,observedAt:now-i*1000,
 reasons:["SOURCE_RECEIPT_AFTER_DECISION_OR_MISSING"],blockedBy:["ACCOUNT_EQUITY_UNVERIFIED"],
 timeliness:"LATE_OBSERVATION",mode:"SHADOW",executionEnabled:false,tradePermission:"NO_TRADE",
 release:{codeHash:"b".repeat(64)},assessment:payload.assessments.ENAUSDT["4h"],
}));
const server=http.createServer((req,res)=>{
 if(req.url.startsWith("/api/history?")){
  const query=new URL(req.url,"http://localhost").searchParams;
  let rows=historyRows.filter(x=>(!query.get("symbol")||query.get("symbol")===x.symbol)&&
    (!query.get("frame")||query.get("frame")===x.timeframe));
  if(query.get("before"))rows=rows.slice(rows.findIndex(x=>x.id===query.get("before"))+1);
  const page=rows.slice(0,Number(query.get("limit")||30));
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify({status:"RECORDED_SHADOW_DECISIONS",records:page,
    nextCursor:rows.length>page.length?page.at(-1).id:null}));return;
 }
 if(req.url==="/api/live"){res.setHeader("content-type","application/json");res.end(JSON.stringify(payload));return;}
 if(req.url==="/api/feed"){res.setHeader("content-type","application/json");res.end(JSON.stringify({status:"CLOUD_SCAN_STALE",archivedReadyPlans:[]}));return;}
 if(req.url==="/"){res.setHeader("content-type","text/html");res.end(fs.readFileSync(__dirname+"/../index.html"));return;}
 res.statusCode=404;res.end();
});
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
 try{
  for(const [name,viewport] of [["desktop",{width:1440,height:900}],["mobile",{width:390,height:844}]]){
   const page=await browser.newPage({viewport});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:"+server.address().port+"/",{waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>document.querySelector("#market-status").textContent==="NO SETUP");
   assert.match(await page.locator("#bias-summary").textContent(),/Long 33.30% \/ Short 66.70%/);
   assert.equal(await page.locator("#zone-list .zone-row").count(),1);
   assert.match(await page.locator("#zone-list").textContent(),/volume 2,000 ENA/);
   await page.locator('.frame-tab[data-frame="1h"]').click();
   assert.equal(await page.locator('.frame-tab[data-frame="1h"]').getAttribute("class"),"frame-tab active");
   assert.equal(await page.locator("#chart rect").count()>0,true);
   assert.equal(await page.locator("#frame-assessments tr").count(),12);
   assert.equal(await page.locator(".bias-card").count(),2);
   assert.equal(await page.locator(".bias-row").count(),12);
   assert.equal(await page.locator("#signal-overview").getAttribute("data-state"),"LONG");
   assert.match(await page.locator("#signal-direction").textContent(),/LONG BIAS · CHỜ MUA/);
   assert.equal(await page.locator("#signal-score").textContent(),"+10.0");
   assert.equal(await page.locator("#signal-permission").textContent(),"NO_TRADE");
   assert.match(await page.locator("#signal-taker").textContent(),/60.00%/);
   assert.match(await page.locator("#signal-btc").textContent(),/59.50%/);
   assert.match(await page.locator('.bias-row[data-symbol="BTCUSDT"][data-frame="15m"]').textContent(),/L 40.0% · S 30.0%/);
   assert.match(await page.locator('.bias-row[data-symbol="BTCUSDT"][data-frame="1w"]').textContent(),/NULL/);
   assert.match(await page.locator("#frame-assessments tr").first().textContent(),/ACCOUNT_EQUITY_UNVERIFIED/);
   await page.locator('.symbol-tab[data-symbol="BTCUSDT"]').click();
   await page.locator('.frame-tab[data-frame="1M"]').click();
   assert.equal(await page.locator("#selected-symbol-tag").textContent(),"BTC / USDT");
   assert.equal(await page.locator("#selected-frame-tag").textContent(),"1M");
   assert.equal(await page.locator(".bias-row.active").getAttribute("data-frame"),"1M");
   await page.locator('.bias-row[data-symbol="BTCUSDT"][data-frame="1w"]').click();
   assert.equal(await page.locator("#signal-overview").getAttribute("data-state"),"DATA_INCOMPLETE");
   assert.equal(await page.locator("#signal-score").textContent(),"—");
   assert.equal(await page.locator("#signal-permission").textContent(),"DATA_INCOMPLETE");
   assert.match(await page.locator("#signal-gate").textContent(),/CLOSED_CANDLE_GAP/);
   await page.locator('.bias-row[data-symbol="ENAUSDT"][data-frame="4h"]').click();
   assert.equal(await page.locator("#selected-symbol-tag").textContent(),"ENA / USDT");
   assert.equal(await page.locator("#selected-frame-tag").textContent(),"4h");
   assert.equal(await page.locator("#chart rect").count()>0,true);
   assert.equal(await page.locator("#chart line[data-guide=LONG]").count(),1);
   assert.match(await page.locator("#scenario-long-price").textContent(),/Nến đóng >/);
   assert.equal(await page.locator("#scenario-probability").textContent(),"Chưa hiệu chuẩn");
   assert.match(await page.locator("#scenario-gates").textContent(),/NO_TRADE/);
   assert.equal(await page.locator("#copy").isDisabled(),true);
   await page.locator("#history-symbol").selectOption("ENAUSDT");
   await page.locator("#history-frame").selectOption("4h");
   await page.waitForFunction(()=>document.querySelectorAll("#events .event").length===30);
   assert.match(await page.locator("#events").textContent(),/ENAUSDT · 4h · DATA_INCOMPLETE/);
   assert.match(await page.locator("#events").textContent(),/SOURCE_RECEIPT_AFTER_DECISION_OR_MISSING/);
   assert.equal(await page.locator("#history-more").isVisible(),true);
   await page.locator("#history-more").click();
   await page.waitForFunction(()=>document.querySelectorAll("#events .event").length===32);
   assert.equal(await page.locator("#history-more").isVisible(),false);
   assert.deepEqual(await page.locator("#history-symbol option").evaluateAll(xs=>xs.map(x=>x.value)),["","BTCUSDT","ENAUSDT"]);
   await page.locator("#history-symbol").selectOption("BTCUSDT");
   await page.waitForFunction(()=>document.querySelectorAll("#events .event").length===0);
   assert.match(await page.locator("#events").textContent(),/Chưa có quyết định được ghi/);

   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:__dirname+"/../"+name+"-zones-smoke.png",fullPage:true});
   console.log(name,"UI_ZONES_PASS");
   await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
