import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require("/Users/vinhvo/.codex/.chatgpt-projects/g-p-6ac605788564819194b2f9c6d116707f/apps/web/node_modules/@playwright/test");
const base=process.env.SCM_BASE_URL||"http://127.0.0.1:3301";
const api=await fetch(base+"/api/live",{signal:AbortSignal.timeout(30000)});
assert.equal(api.status,200);
const data=await api.json();
assert.equal(data.model,"SCM15_RESEARCH_MULTIFRAME_V3");
assert.equal(data.actualOrdersEnabled,false);
assert.equal(data.executionEnabled,false);
for(const symbol of ["BTCUSDT","ENAUSDT"])
  for(const tf of ["15m","1h","4h","1d","1w","1M"]){
    const a=data.assessments?.[symbol]?.[tf];
    assert.ok(a,symbol+" "+tf);
    assert.equal(a.tradePermission,"NO_TRADE");
    assert.equal(a.paperOrderCreated,false);
    assert.equal(a.entry,null);
    const bias=data.frameBiasBySymbol?.[symbol]?.[tf];
    assert.ok(bias,symbol+" "+tf+" bias");
    assert.equal(bias.probability,null);
    if(bias.status==="VALID")assert.ok(Math.abs(bias.longEvidencePct+
      bias.shortEvidencePct+bias.neutralEvidencePct-100)<0.01);
    else assert.equal(bias.longEvidencePct,null);
  }
const browser=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base+"/",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#frame-assessments")?.children.length===12,{timeout:30000});
 assert.equal(await page.locator("#frame-assessments tr").count(),12);
 assert.equal(await page.locator(".bias-card").count(),2);
 assert.equal(await page.locator(".bias-row").count(),12);
 await page.locator('.symbol-tab[data-symbol="BTCUSDT"]').click();
 await page.locator('.frame-tab[data-frame="1M"]').click();
 assert.equal(await page.locator("#selected-symbol-tag").textContent(),"BTC / USDT");
 assert.equal(await page.locator("#selected-frame-tag").textContent(),"1M");
 assert.equal(await page.locator("#signal-context").textContent().then(s=>s.startsWith("BTCUSDT · 1M")),true);
 assert.equal(await page.locator("#signal-permission").textContent(),"NO_TRADE");
 assert.notEqual(await page.locator("#signal-score").textContent(),"—");
 assert.match(await page.locator("#signal-gate").textContent(),/NO_TRADE/);
 assert.equal(await page.locator(".bias-row.active").getAttribute("data-frame"),"1M");
 assert.equal(await page.locator("#scenario-probability").textContent(),"Chưa hiệu chuẩn");
 assert.match(await page.locator("#scenario-long-price").textContent(),/Nến đóng >/);
 assert.match(await page.locator("#scenario-gates").textContent(),/NO_TRADE/);
 assert.equal(await page.locator("#chart line[data-guide=LONG]").count(),1);
 assert.equal(await page.locator("#copy").isDisabled(),true);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:"evidence/local-v3-live-ui.png",fullPage:true});
 console.log(JSON.stringify({status:"LIVE_UI_PASS",model:data.model,sourceErrors:data.sourceErrors,
  apiStatus:data.status,bars:Object.fromEntries(["BTCUSDT","ENAUSDT"].map(s=>[s,
  Object.fromEntries(["15m","1h","4h","1d","1w","1M"].map(tf=>[
    tf,data.assessments[s][tf].audit.status]))]))}));
 await page.close();
}finally{await browser.close()}
