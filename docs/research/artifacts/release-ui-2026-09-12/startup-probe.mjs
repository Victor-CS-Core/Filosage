import {spawn} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
const out = process.cwd()+'/.filosage-local/release-ui';
const results=[];
for(let attempt=1;attempt<=3;attempt++) {
 const started=performance.now();
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3217'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
 let logs='';
 server.stdout.on('data',v=>logs+=String(v));
 server.stderr.on('data',()=>{});
 const exited=new Promise(resolve=>server.once('exit',resolve));
 const deadline=performance.now()+30000;
 let firstStatus=0;
 try {
  while(performance.now()<deadline) {
   try { const r=await fetch('http://127.0.0.1:3217/api/auth/session',{signal:AbortSignal.timeout(1000)}); firstStatus=r.status; if(r.status===200) break; } catch {}
   await new Promise(r=>setTimeout(r,25));
  }
  if(firstStatus!==200) throw new Error('Local startup readiness deadline exceeded');
  const startupToFirstSessionResponseMs=Math.round(performance.now()-started);
  const samples=[];
  for(const path of ['/api/auth/session','/api/account','/api/courses?scope=mine','/api/courses/audit-private/lessons/0-0']) for(let n=1;n<=5;n++){
   const before=performance.now();
   const r=await fetch('http://127.0.0.1:3217'+path,{signal:AbortSignal.timeout(3000)});
   await r.arrayBuffer();
   samples.push({path,attempt:n,status:r.status,latencyMs:Math.round((performance.now()-before)*10)/10});
  }
  const proc=readFileSync(`/proc/${server.pid}/status`,'utf8');
  results.push({attempt,startupToFirstSessionResponseMs,nextReportedReadyMs:Number(logs.match(/Ready in (\d+)ms/)?.[1]||0),rssKiB:Number(proc.match(/^VmRSS:\s+(\d+)/m)?.[1]||0),samples});
 } finally {server.kill('SIGTERM');await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>{server.kill('SIGKILL');reject(new Error('Server stop timeout'));},3000))]);}
}
writeFileSync(out+'/startup-final.json',JSON.stringify({conditions:'Three sequential local process starts; OS filesystem cache not flushed. No database/provider settings. Five sequential anonymous warm GET samples per endpoint after first session200. HTTP401 proves rejection at this local server boundary only; no real account identity or hosted authorization claim.',results},null,2));
console.log(JSON.stringify(results.map(({samples,...rest})=>rest)));
