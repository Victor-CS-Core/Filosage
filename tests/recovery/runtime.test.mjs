import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationOptions, prepareRecoveryRuntime } from '../../scripts/prepare-recovery-runtime.mjs';
// fake-credential: isolated parser fixture, never sent to a provider.
const dsn='postgresql://filosageadmin:fixture@filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com/filosage?sslmode=verify-full';
const password='a'.repeat(64);
const base={correct_database:true,correct_admin:true,database_owner_ok:true,schema_owner_ok:true,table_owner_ok:true,no_user_triggers:true,no_rls:true,ordinary_table:true,no_rewrite_rules:true,public_create_denied:true,role_exists:false,max_connections:'50',reserved_connections:'5',superuser_reserved_connections:'10'};
function fixture({preflight={},existing=false,badCatalog=false,dmlFailure=false}={}) {
 const sql=[]; const clients=[];
 const factory=(options)=>{ const runtime=options.user==='filosage_recovery_runtime'; const client={options,closed:false,async connect(){},async end(){this.closed=true;},async query(q){sql.push(q);
 if(q.includes('/* preparation-preflight */'))return {rows:[{...base,role_exists:existing,...preflight}]};
 if(q.startsWith('SELECT 1 FROM pg_roles'))return {rowCount:existing?1:0,rows:[]};
 if(q.startsWith('SELECT format'))return {rows:[{sql:'CREATE ROLE filosage_recovery_runtime fixture'}]};
 if(q.includes('/* runtime-catalog */'))return {rows:[{attributes:!badCatalog,database_acl:true,schema_acl:true,dml:true,no_ddl:true,exact_acl:true,no_memberships:true,owns_nothing:true,no_qa_connect:true}]};
 if(q.includes('/* runtime-identity */'))return {rows:[{correct:true}]};
 if(q.includes('/* current-schema-guard */'))return {rows:[{compatible:true}]};
 if(q.startsWith('INSERT INTO')){if(dmlFailure)throw Object.assign(new Error('private-content'),{code:'42501'});return {rowCount:1,rows:[]};}
 if(q.startsWith('SELECT 1 FROM public.filosage_documents'))return {rowCount:runtime&&sql.at(-2)?.startsWith('INSERT')?1:0,rows:[]};
 if(q.startsWith('UPDATE ')||q.startsWith('DELETE '))return {rowCount:1,rows:[]};
 return {rows:[],rowCount:0};}};clients.push(client);return client;};return {sql,clients,factory};
}
test('rejects wrong source, DSN overrides and unsafe modes before opening any connection',async()=>{
 for(const bad of [dsn.replace('/filosage?','/filosageqa?'),dsn+'&host=other',dsn.replace('filosageadmin:','other:')])assert.throws(()=>preparationOptions(bad,undefined));
 const f=fixture();await assert.rejects(prepareRecoveryRuntime(f.factory,dsn,undefined,password,'other'));assert.equal(f.clients.length,0);
});
test('read-only preflight performs no role or document mutation',async()=>{
 const f=fixture();const r=await prepareRecoveryRuntime(f.factory,dsn,undefined,password,'preflight');assert.equal(r.ok,true);assert(!f.sql.some(q=>/^(CREATE|GRANT|INSERT|UPDATE|DELETE)/.test(q)));assert(f.clients.every(c=>c.closed));
});
test('changed owner or table side effects abort before creating a role',async()=>{
 for(const preflight of [{table_owner_ok:false},{no_user_triggers:false},{ordinary_table:false},{no_rewrite_rules:false}]){const f=fixture({preflight});await assert.rejects(prepareRecoveryRuntime(f.factory,dsn,undefined,password,'apply'));assert(!f.sql.some(q=>q.startsWith('CREATE ROLE')));assert(f.clients.every(c=>c.closed));}
});
test('an existing incompatible role is never altered or granted permissions',async()=>{
 const f=fixture({existing:true,badCatalog:true});await assert.rejects(prepareRecoveryRuntime(f.factory,dsn,undefined,password,'apply'));assert(!f.sql.some(q=>/^(CREATE|ALTER|GRANT)/.test(q)));
});
test('DML failure rolls back and closes all connections without leaking its message',async()=>{
 const f=fixture({existing:true,dmlFailure:true});await assert.rejects(prepareRecoveryRuntime(f.factory,dsn,undefined,password,'verify'));assert.equal(f.sql.at(-1),'ROLLBACK');assert(f.clients.every(c=>c.closed));
});
test('new role uses bounded grants; existing role verifies without password changes',async()=>{
 for(const existing of [false,true]){const f=fixture({existing});const r=await prepareRecoveryRuntime(f.factory,dsn,undefined,password,'apply','SELECT true AS compatible');assert.equal(r.ok,true);assert.equal(r.created,!existing);assert(!f.sql.some(q=>q.startsWith('ALTER ROLE')));assert.equal(f.sql.filter(q=>q.startsWith('GRANT ')).length,existing?0:3);assert(f.clients.every(c=>c.closed));assert.equal(r.connectionLimit,3);}
});

test('every connection targets only the exact private clone and rejects production overrides before factory',async()=>{
 const host='filosage-recovery-20260912-b.postgres.database.azure.com';
 const f=fixture();await prepareRecoveryRuntime(f.factory,dsn,undefined,password,'apply','SELECT true AS compatible');
 assert(f.clients.every(c=>c.options.host===host&&c.options.ssl.rejectUnauthorized===true&&!('connectionString' in c.options)));
 for(const target of ['filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com','other.postgres.database.azure.com',host+'.evil.test']){
   const bad=fixture();await assert.rejects(prepareRecoveryRuntime(bad.factory,dsn,undefined,password,'apply','SELECT true AS compatible',target));assert.equal(bad.clients.length,0);
 }
});
