import { createHash } from 'node:crypto';
import { isIPv4 } from 'node:net';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const approvedAppId = '/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg/providers/Microsoft.App/containerApps/filosagestg-app';
export const operatorName = 'release-maintenance-operator-20260912';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
 ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : value;
const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const normalizedRule = rule => {const v={...rule};if(v.description===null||v.description==='')delete v.description;return v;};
const ruleHash = rule => hash(normalizedRule(rule));
const sameRules = (a,b) => equal(a.map(normalizedRule),b.map(normalizedRule));
const rulesOf = app => app.properties?.configuration?.ingress?.ipSecurityRestrictions ?? [];
const ipv4 = value => {
 if(!isIPv4(value))return false;const [a,b]=value.split('.').map(Number);
 return a!==0&&a!==10&&a!==127&&a<224&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&b===168)&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));
};
const context = env => {
 if(env.GITHUB_REPOSITORY!=='Victor-CS-Core/Filosage' || env.GITHUB_REF!=='refs/heads/main'
  || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID) || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT)) throw Error('Unapproved workflow context.');
};
export function planAccess(app, auth, env, runnerIpv4) {
 context(env);if(app.id?.toLowerCase()!==approvedAppId.toLowerCase())throw Error('Unapproved application.');const rules=rulesOf(app);
 if(!Array.isArray(rules)) throw Error('Invalid ingress rules.');
 const base={schemaVersion:1,operation:'maintenance-runner-access',appId:app.id,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,repository:env.GITHUB_REPOSITORY};
 if(rules.length===0)return {enabled:false,intent:{...base,enabled:false}};
 const operator=rules[0]; const [ip,mask]=String(operator.ipAddressRange).split('/');
 if(rules.length!==1 || operator.name!==operatorName || operator.action!=='Allow' || !ipv4(ip) || mask!=='32' || operator.ipAddressRange!==`${ip}/32` || Object.keys(operator).some(k=>!['action','ipAddressRange','name','description'].includes(k)) || ('description' in operator && operator.description!==null && typeof operator.description!=='string')) throw Error('Expected exact operator-only maintenance rule.');
 if(!ipv4(runnerIpv4))throw Error('Invalid public runner IPv4.');
 const rule={name:`release-runner-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,action:'Allow',ipAddressRange:`${runnerIpv4}/32`};
 const intent={...base,enabled:true,ownedRuleName:rule.name,ownedRuleSha256:ruleHash(rule),operatorRuleSha256:ruleHash(operator),beforeRulesSha256:hash(rules),beforeAppSha256:hash(app),beforeAuthSha256:hash(auth),createdAt:new Date().toISOString()};
 return {enabled:true,rule,intent};
}
export function cleanupRules(rules,intent) {
 if(!Array.isArray(rules) || !/^release-runner-[1-9][0-9]*-[1-9][0-9]*$/.test(intent.ownedRuleName) || !/^[a-f0-9]{64}$/.test(intent.ownedRuleSha256))throw Error('Invalid cleanup ownership.');
 const owned=rules.filter(r=>r.name===intent.ownedRuleName);
 if(owned.length>1 || (owned.length===1 && ruleHash(owned[0])!==intent.ownedRuleSha256))throw Error('Owned rule changed; reconcile manually.');
 return rules.filter(r=>r.name!==intent.ownedRuleName);
}
export function unchangedOutsideRules(before,authBefore,after,authAfter) {
 const project = app => {
  const v=structuredClone({id:app.id,identity:app.identity,environment:app.properties?.managedEnvironmentId,environmentId:app.properties?.environmentId,configuration:app.properties?.configuration,template:app.properties?.template});
  if(v.configuration?.ingress)delete v.configuration.ingress.ipSecurityRestrictions;
  return v;
 };
 return equal(project(before),project(after))&&equal(authBefore,authAfter);
}
export async function runnerAddress(request=fetch) {
 const response=await request('https://api.ipify.org',{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(8000)});
 if(!response.ok || !response.body)throw Error('Runner IP observation failed.');
 const reader=response.body.getReader();const chunks=[];let size=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>15)throw Error('Runner IP bound.');chunks.push(value);}}
 finally {await reader.cancel();}
 const ip=Buffer.concat(chunks).toString('ascii');if(!ipv4(ip))throw Error('Runner IPv4 invalid.');return ip;
}

export function changeAccess(mode,state,env,observe,patch) {
 if(!['apply','cleanup'].includes(mode))throw Error('Invalid access change.');
 const before=observe();let expected;
 if(mode==='apply') {
  context(env);
  if(state.intent.runId!==env.GITHUB_RUN_ID||state.intent.runAttempt!==env.GITHUB_RUN_ATTEMPT||hash(before.app)!==state.intent.beforeAppSha256||hash(before.auth)!==state.intent.beforeAuthSha256||ruleHash(state.rule)!==state.intent.ownedRuleSha256)throw Error('Prepared access context changed.');
  expected=[...rulesOf(before.app),state.rule];
 } else expected=cleanupRules(rulesOf(before.app),state.intent);
 // Shared workflow concurrency + the approved exclusive operator lease are required.
 // ARM read/patch is not claimed atomic against out-of-band configuration writers.
 const latest=observe();if(!equal(before,latest))throw Error('Concurrent provider change.');
 if(!sameRules(rulesOf(before.app),expected))patch(expected);
 const after=observe();
 if(!sameRules(rulesOf(after.app),expected)||!unchangedOutsideRules(before.app,before.auth,after.app,after.auth))throw Error('Access readback mismatch; owned intent requires reconciliation.');
 return {operation:'maintenance-runner-access',mode,enabled:true,ownedRuleName:state.intent.ownedRuleName,verified:true,observedRulesSha256:hash(expected),observedAt:new Date().toISOString()};
}

async function main() {
 const [mode,manualIntent]=process.argv.slice(2);
 if(!['prepare','apply','cleanup'].includes(mode) || (manualIntent&&mode!=='cleanup'))throw Error('Invalid access operation.');
 const temp=process.env.RUNNER_TEMP||'/tmp'; const directory=join(temp,'maintenance-access-evidence');mkdirSync(directory,{recursive:true,mode:0o700});
 const privatePath=join(temp,'maintenance-access-private.json');const intentPath=join(directory,'intent.json');
 const save=(path,value,exclusive=false)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:exclusive?'wx':'w'});
 const read=path=>{const s=readFileSync(path,'utf8');if(Buffer.byteLength(s)>65536)throw Error('Access evidence bound.');return JSON.parse(s);};
 // Cleanup before prepare/login failure is a no-op; it must not create or fetch credentials.
 if(mode==='cleanup'&&!manualIntent&&!existsSync(privatePath)){save(join(directory,'cleanup.json'),{operation:'maintenance-runner-access-cleanup',noPreparedState:true});return;}
 const cliEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('AZURE_STORAGE_')));
 Object.assign(cliEnv,{AZURE_LOGGING_ENABLE_LOG_FILE:'false',AZURE_CORE_COLLECT_TELEMETRY:'false'});
 const az=args=>{const r=spawnSync('az',[...args,'--only-show-errors','--output','json'],{encoding:'utf8',env:cliEnv,timeout:45000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});if(r.status!==0||r.error)throw Error('Provider call failed; reconcile owned intent.');return JSON.parse(r.stdout||'null');};
 const subscription=az(['account','show']).id;
 const group=process.env.AZURE_RESOURCE_GROUP, appName=process.env.AZURE_CONTAINER_APP_NAME;
 if(!/^[a-f0-9-]{36}$/i.test(subscription)||!/^[-a-zA-Z0-9_.()]{1,90}$/.test(group||'')||!/^[-a-z0-9]{1,32}$/.test(appName||''))throw Error('Invalid app target.');
 const appId=`/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.App/containerApps/${appName}`;
 if(appId.toLowerCase()!==approvedAppId.toLowerCase())throw Error('Only approved production app is allowed.');
 const url=`https://management.azure.com${appId}?api-version=2025-01-01`;
 const authUrl=`https://management.azure.com${appId}/authConfigs/current?api-version=2025-01-01`;
 const observe=()=>({app:az(['rest','--method','get','--url',url]),auth:az(['rest','--method','get','--url',authUrl])});
 const patch=(rules)=>{const path=join(temp,'maintenance-access-patch.private.json');save(path,{properties:{configuration:{ingress:{ipSecurityRestrictions:rules}}}});try{az(['rest','--method','patch','--url',url,'--headers','Content-Type=application/merge-patch+json','--body',`@${path}`]);}finally{rmSync(path,{force:true});}};
 if(mode==='prepare') {
  const before=observe();const rules=rulesOf(before.app);
  const state=planAccess(before.app,before.auth,process.env,Array.isArray(rules)&&rules.length?await runnerAddress():undefined);
  save(privatePath,state,true);save(intentPath,state.intent,true);return;
 }
 const state=manualIntent?{enabled:true,intent:read(resolve(manualIntent))}:read(privatePath);
 if(state.intent?.operation!=='maintenance-runner-access'||state.intent?.schemaVersion!==1||state.intent.appId?.toLowerCase()!==appId.toLowerCase())throw Error('Intent app mismatch.');
 if(!state.enabled){save(join(directory,`${mode}.json`),{operation:'maintenance-runner-access',enabled:false,mode});return;}
 const result=changeAccess(mode,state,process.env,observe,patch);
 save(join(directory,`${mode}.json`),result);
 if(mode==='cleanup')rmSync(privatePath,{force:true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Maintenance runner access failed closed; inspect durable owned intent and provider readback.');process.exitCode=1;});
