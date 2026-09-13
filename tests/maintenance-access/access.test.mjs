import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planAccess, cleanupRules, unchangedOutsideRules, operatorName } from '../../scripts/maintenance-runner-access.mjs';
const env = { GITHUB_REPOSITORY:'Victor-CS-Core/Filosage',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1' };
const rule = { name:operatorName,action:'Allow',ipAddressRange:'198.51.100.1/32' };
const app = rules => ({ id:'/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/group/providers/Microsoft.App/containerApps/app',identity:{type:'UserAssigned'},properties:{managedEnvironmentId:'fixed',configuration:{ingress:{ipSecurityRestrictions:rules,traffic:[{weight:100}]}},template:{containers:[]}} });
test('normal ingress no-ops; exact operator-only allow gets one owned runner rule', () => {
 assert.equal(planAccess(app([]), {}, env).enabled,false);
 const state=planAccess(app([rule]), {}, env,'203.0.113.7');
 assert.equal(state.rule.ipAddressRange,'203.0.113.7/32');
 assert.match(state.rule.name,/123-1$/); assert.ok(!JSON.stringify(state.intent).includes('203.0.113.7'));
});
test('broad, unknown, stale, duplicate and nonmain contexts fail closed', () => {
 for(const rules of [[{...rule,action:'Deny'}],[{...rule,ipAddressRange:'0.0.0.0/0'}],[{...rule,name:'other'}],[rule,rule]]) assert.throws(()=>planAccess(app(rules),{},env,'203.0.113.7'));
 for(const ip of ['bad','::1','203.0.113.7/32','127.0.0.1']) assert.throws(()=>planAccess(app([rule]),{},env,ip));
 assert.throws(()=>planAccess(app([rule]),{},{...env,GITHUB_REF:'refs/heads/other'},'203.0.113.7'));
});
test('cleanup removes exactly owned hash-matching rule, preserves other rules, and reconciles absent safely', () => {
 const state=planAccess(app([rule]),{},env,'203.0.113.7');
 const other={name:'other-owned-rule',action:'Allow',ipAddressRange:'203.0.113.8/32'};
 assert.deepEqual(cleanupRules([rule,state.rule,other],state.intent),[rule,other]);
 assert.deepEqual(cleanupRules([rule],state.intent),[rule]);
 assert.throws(()=>cleanupRules([rule,{...state.rule,ipAddressRange:'203.0.113.9/32'}],state.intent));
 assert.throws(()=>cleanupRules([rule,state.rule,state.rule],state.intent));
});
test('canonical ingress readback allows key order but detects any unrelated config auth or traffic change', () => {
 const before=app([rule]);const after=app([rule,{name:'runner'}]);
 assert.equal(unchangedOutsideRules(before,{},after,{}),true);
 after.properties.configuration.ingress.traffic[0].weight=0;
 assert.equal(unchangedOutsideRules(before,{},after,{}),false);
 assert.equal(unchangedOutsideRules(before,{},before,{changed:true}),false);
});

test('uncertain successful write remains removable using durable intent without repeating apply', async () => {
 const { changeAccess } = await import('../../scripts/maintenance-runner-access.mjs');
 let current=app([rule]);const auth={fixed:true};const state=planAccess(current,auth,env,'203.0.113.7');
 const observe=()=>({app:structuredClone(current),auth});let writes=0;
 assert.throws(()=>changeAccess('apply',state,env,observe,rules=>{writes++;current=app(rules);throw Error('uncertain response');}));
 assert.equal(writes,1);
 const result=changeAccess('cleanup',{intent:state.intent},env,observe,rules=>{writes++;current=app(rules);});
 assert.equal(result.verified,true);assert.deepEqual(current.properties.configuration.ingress.ipSecurityRestrictions,[rule]);
 assert.equal(writes,2);
});
test('changed preparation or concurrent routing stops before adding a rule', async () => {
 const { changeAccess } = await import('../../scripts/maintenance-runner-access.mjs');
 const initial=app([rule]);const state=planAccess(initial,{},env,'203.0.113.7');let reads=0,writes=0;
 const observe=()=>{const value=structuredClone(initial);if(++reads===2)value.properties.configuration.ingress.traffic=[];return {app:value,auth:{}};};
 assert.throws(()=>changeAccess('apply',state,env,observe,()=>writes++));assert.equal(writes,0);
});
test('IP discovery bounds response and does not accept redirects or private addresses', async () => {
 const { runnerAddress } = await import('../../scripts/maintenance-runner-access.mjs');
 assert.equal(await runnerAddress(async(_url,options)=>{assert.equal(options.redirect,'error');return new Response('203.0.113.7');}),'203.0.113.7');
 for(const value of ['10.0.0.1','172.16.0.1','192.168.1.1','x'.repeat(16)])await assert.rejects(runnerAddress(async()=>new Response(value)));
});
