import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const out = process.cwd()+'/.filosage-local/release-ui';
const label = process.argv[2] || 'baseline';
const browser = await chromium.launch();
const result = {label, conditions:{browser:browser.version(),viewport:'390x844', cpuSlowdown:4, latencyMs:150,downloadBitsPerSecond:1600000,uploadBitsPerSecond:750000,sessionDelayMs:750,catalog:'empty controlled response',samples:3,httpCache:'disabled by route interception; fresh context per navigation',server:'local optimized Next webpack production build on loopback; not field CWV or hosted API/DB latency'},pages:[]};
for (const path of ['/', '/library', '/pricing']) for(let i=0;i<3;i++) {
 const context = await browser.newContext({ viewport:{width:390,height:844},reducedMotion:'reduce',colorScheme:'light' });
 const page = await context.newPage();
 await page.addInitScript(() => {localStorage.setItem('filosage:analytics:consent:v1','declined');window.__auditLcp=0;new PerformanceObserver(list=>{window.__auditLcp=list.getEntries().at(-1).startTime;}).observe({type:'largest-contentful-paint',buffered:true});});
 await page.route('**/api/auth/session',async route=> {await new Promise(r=>setTimeout(r,750)); await route.fulfill({json:{user:null,recentAuthentication:false,authentication:{primaryProvider:'filosage',externalIdAvailable:true,externalIdNewAccountsAvailable:true,legacyGoogleAvailable:true}}});});
 await page.route('**/api/courses?scope=public',route=>route.fulfill({json:{courses:[]}}));
 await page.route('**/api/billing/status',route=>route.fulfill({json:{enabled:false,rolloutMode:'closed',ready:false,managementReady:false}}));
 const cdp = await context.newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1600000/8,uploadThroughput:750000/8});
 await page.goto('http://127.0.0.1:3217'+path);
 await page.locator('h1').first().waitFor();
 await page.waitForFunction(()=>!document.querySelector('.marketing-sign-in')?.disabled);
 if(path==='/') await page.locator('.marketing-course-proof-state').waitFor({state:'visible'});
 const data=await page.evaluate(()=>{
  const n=performance.getEntriesByType('navigation')[0];
  const resources=performance.getEntriesByType('resource');
  const scripts=resources.filter(x=>x.name.includes('/_next/')&&new URL(x.name).pathname.endsWith('.js'));
  return {ttfbMs:Math.round(n.responseStart-n.requestStart),fcpMs:Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime||0),observedLcpMs:Math.round(window.__auditLcp),uiReadyMs:Math.round(performance.now()),scriptCount:scripts.length,scriptTransferBytes:scripts.reduce((n,x)=>n+x.transferSize,0),scriptDecodedBytes:scripts.reduce((n,x)=>n+x.decodedBodySize,0),totalResourceTransferBytes:resources.reduce((n,x)=>n+x.transferSize,0)};
 });
 result.pages.push({path,attempt:i+1,...data});
 console.log(JSON.stringify(result.pages.at(-1)));
 await context.close();
}
await browser.close();
writeFileSync(out+`/performance-${label}.json`,JSON.stringify(result,null,2));
