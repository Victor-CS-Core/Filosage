import test from 'node:test';import assert from 'node:assert/strict';
import {buildOnRunner,createExecutor} from '../../scripts/build-release-image.mjs';
const sha='b'.repeat(40),digest='sha256:'+'d'.repeat(64);
const env={EXPECTED_SHA:sha,GITHUB_SHA:sha,GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',AZURE_ACR_NAME:'filosagestp4ujucgnxq3gsacr',PUBLIC_SITE_URL:'https://filosage.com'};
function fixture(change={}){const calls=[];const execute=(command,args,input)=>{calls.push({command,args,input});if(command==='git')return sha;if(command==='node')return 'COURSE_PIPELINE_V2=true\n';if(command==='az'&&args[0]==='account')return 'bfc8f890-2681-43dc-8eac-51644341ae12';if(command==='az'&&args.includes('show-tags'))return '[]';if(command==='az'&&args.includes('login'))return JSON.stringify({loginServer:env.AZURE_ACR_NAME+'.azurecr.io',accessToken:'synthetic-private-token'});if(command==='az')return digest;if(args[0]==='push')return `tag: digest: ${digest} size: 42`;return '';};return {calls,execute:(...args)=>change.execute?change.execute(execute,...args):execute(...args)};}
test('one runtime amd64 build, private stdin login, immutable push/readback match',()=>{const f=fixture();assert.equal(buildOnRunner(env,f.execute),digest);const build=f.calls.filter(c=>c.command==='docker'&&c.args[0]==='build');assert.equal(build.length,1);assert.ok(build[0].args.includes('runtime'));assert.ok(build[0].args.includes('linux/amd64'));assert.ok(build[0].args.includes('SITE_VERSION='+sha));assert.ok(build[0].args.includes('COURSE_PIPELINE_V2=true'));const login=f.calls.find(c=>c.command==='docker'&&c.args[0]==='login');assert.ok(login.args.includes('--password-stdin'));assert.equal(login.input,'synthetic-private-token');assert.ok(f.calls.every(c=>!c.args.join(' ').includes('synthetic-private-token')));assert.ok(f.calls.filter(c=>c.command==='az').every(c=>!c.args.includes('build')));});
test('wrong source/ref or existing tag prevents build and push',()=>{for(const patch of [{GITHUB_SHA:'a'.repeat(40)},{GITHUB_REF:'refs/heads/other'}]){const f=fixture();assert.throws(()=>buildOnRunner({...env,...patch},f.execute));assert.ok(!f.calls.some(c=>c.args[0]==='build'));}const f=fixture({execute:(base,c,a,i)=>a.includes('show-tags')?'["existing"]':base(c,a,i)});assert.throws(()=>buildOnRunner(env,f.execute));assert.ok(!f.calls.some(c=>c.args[0]==='build'));});
test('registry mismatch or push failure stops, digest mismatch fails without rebuild',()=>{for(const scenario of ['registry','push','digest']){const f=fixture({execute:(base,c,a,i)=>{if(scenario==='registry'&&c==='az'&&a.includes('login'))return JSON.stringify({loginServer:'other.azurecr.io',accessToken:'private'});if(scenario==='push'&&c==='docker'&&a[0]==='push')throw Error('failure');if(scenario==='digest'&&c==='az'&&a.includes('show'))return 'sha256:'+'e'.repeat(64);return base(c,a,i);}});assert.throws(()=>buildOnRunner(env,f.execute));assert.ok(f.calls.filter(c=>c.command==='docker'&&c.args[0]==='build').length<=1);}});

test('commands pin subscription and wrong Azure context stops before registry use',()=>{const f=fixture();buildOnRunner(env,f.execute);for(const c of f.calls.filter(c=>c.command==='az'))assert.equal(c.args[c.args.indexOf('--subscription')+1],'bfc8f890-2681-43dc-8eac-51644341ae12');const bad=fixture({execute:(base,c,a,i)=>c==='az'&&a[0]==='account'?'wrong-subscription':base(c,a,i)});assert.throws(()=>buildOnRunner(env,bad.execute));assert.ok(!bad.calls.some(c=>c.args.includes('show-tags')));});
test('failure diagnostics identify safe stage and numeric exit without child output credentials or arguments',()=>{const logs=[];const execute=createExecutor({},()=>({status:17,signal:null,stdout:'private-token',stderr:'private-log',error:Error('private-error')}),v=>logs.push(v));assert.throws(()=>execute('docker',['login','private-argument'],'private-token'),/Build command failed/);assert.deepEqual(logs,[{operation:'docker-login',status:'started'},{operation:'docker-login',status:'failed',exitCode:17,signalNumber:null}]);assert.equal(JSON.stringify(logs).includes('private'),false);});

test('real capability stdout passes every manifest build argument independently',async()=>{
 const {execFileSync}=await import('node:child_process');
 const output=execFileSync(process.execPath,['scripts/release-capabilities.mjs','environment'],{encoding:'utf8'});
 const lines=output.trim().split(String.fromCharCode(10));assert.equal(lines.length,15);
 const f=fixture({execute:(base,c,a,i)=>c==='node'?output:base(c,a,i)});buildOnRunner(env,f.execute);
 const args=f.calls.find(c=>c.command==='docker'&&c.args[0]==='build').args;
 for(const line of lines)assert.ok(args.includes(line));
 assert.equal(args.filter(a=>a==='--build-arg').length,17);
});

test('actual CLI writes a real LF-delimited GITHUB_ENV digest and removes private Docker config',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'runner-build-contract-'));const output=join(dir,'github-env');
 const program=`#!${process.execPath}
const {basename}=require('node:path');const command=basename(process.argv[1]);const args=process.argv.slice(2);
if(command==='git')console.log(process.env.EXPECTED_SHA);
else if(command==='az'){
 if(args[0]==='account')console.log('bfc8f890-2681-43dc-8eac-51644341ae12');
 else if(args.includes('show-tags'))console.log('[]');
 else if(args.includes('login'))console.log(JSON.stringify({loginServer:'filosagestp4ujucgnxq3gsacr.azurecr.io',accessToken:'synthetic-private-token'}));
 else console.log(process.env.FIXTURE_DIGEST);
}else if(args[0]==='push')console.log('tag: digest: '+process.env.FIXTURE_DIGEST+' size: 42');
`;
 try{
  for(const command of ['git','az','docker'])writeFileSync(join(dir,command),program,{mode:0o700});
  const result=spawnSync(process.execPath,[resolve('scripts/build-release-image.mjs')],{encoding:'utf8',env:{...process.env,...env,PATH:dir+':'+process.env.PATH,RUNNER_TEMP:dir,GITHUB_ENV:output,FIXTURE_DIGEST:digest},timeout:10000});
  assert.equal(result.status,0,result.stderr);const data=readFileSync(output);assert.equal(data.at(-1),10);
  assert.deepEqual(data.toString().split(String.fromCharCode(10)),['EXPECTED_IMAGE_DIGEST='+digest,'']);
  assert.equal(result.stdout.includes('synthetic-private-token'),false);assert.equal(result.stderr.includes('synthetic-private-token'),false);
  assert.ok(!readdirSync(dir).some(name=>name.startsWith('release-docker-')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
