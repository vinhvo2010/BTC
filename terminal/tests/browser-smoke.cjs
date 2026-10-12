const assert=require('node:assert/strict');
const {chromium}=require('/Users/vinhvo/.codex/.chatgpt-projects/g-p-6ac605788564819194b2f9c6d116707f/apps/web/node_modules/@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const errors=[];
 try{
  for(const [label,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
   const page=await browser.newPage({viewport,deviceScaleFactor:1});
   page.on('pageerror',e=>errors.push(label+':'+e.message));
   const response=await page.goto('https://scmv3-signal15.vercel.app/',{waitUntil:'domcontentloaded',timeout:30000});
   assert.equal(response.status(),200,'Website must return HTTP200');
   await page.waitForFunction(()=>document.querySelector('#market-status').textContent!=='CONNECTING',{timeout:40000});
   const result=await page.evaluate(()=>({
    status:document.querySelector('#market-status').textContent,
    price:document.querySelector('#ena-price').textContent,
    cloud:document.querySelector('#cloud-foot').textContent,
    chartPoints:document.querySelectorAll('#chart polyline').length,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
    copyDisabled:document.querySelector('#copy').disabled,
   }));
   await page.screenshot({path:'/Users/vinhvo/Documents/SCMv3-Signal15/'+label+'-smoke.png',fullPage:true});
   console.log(label,JSON.stringify(result));
   assert.equal(result.horizontalOverflow,false,'Page must be responsive');
   assert.notEqual(result.status,'CONNECTING');
   assert.ok(result.chartPoints>0 || result.status==='DATA BLOCKED','Verified chart or blocker must display');
   if(result.status!=='SIGNAL READY')assert.equal(result.copyDisabled,true);
   await page.close();
  }
  assert.deepEqual(errors,[],'No browser JS errors');
  console.log('BROWSER_SMOKE_PASS');
 } finally {await browser.close()}
})().catch(e=>{console.error('BROWSER_SMOKE_FAIL',e);process.exitCode=1;});
