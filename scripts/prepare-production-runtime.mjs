import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { runtimeDatabaseOptions } from './inspect-runtime-database.mjs';

export function preparationOptions(dsn, sslMode) {
  const options=runtimeDatabaseOptions(dsn,sslMode);
  if(options.user!=='filosageadmin')throw new Error('Unexpected preparation principal.');
  return {...options,application_name:'filosage-reviewed-runtime-preparation',options:'-c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=15000'};
}
const requireTrue=(row)=>{if(!row||Object.values(row).some(v=>v!==true))throw new Error('Runtime acceptance failed.');};
export async function prepareProductionRuntime(factory,dsn,sslMode,password,mode,schemaSql='SELECT false AS compatible') {
  if(!['preflight','apply','verify'].includes(mode)||!/^[a-f0-9]{64}$/.test(password))throw new Error('Invalid preparation context.');
  const options=preparationOptions(dsn,sslMode);const admin=factory(options);let runtime;let created=false;let stage='admin-connect';
  try {
    await admin.connect();stage='preflight';await admin.query('BEGIN READ ONLY');let preflight;
    try {
      preflight=(await admin.query(`/* preparation-preflight */ SELECT
        current_database()='filosage' AS correct_database,current_user='filosageadmin' AS correct_admin,
        (SELECT pg_get_userbyid(datdba)='filosageqa_app' FROM pg_database WHERE datname=current_database()) AS database_owner_ok,
        (SELECT pg_get_userbyid(nspowner)='azure_pg_admin' FROM pg_namespace WHERE nspname='public') AS schema_owner_ok,
        (SELECT pg_get_userbyid(relowner)='filosageadmin' FROM pg_class WHERE oid=to_regclass('public.filosage_documents')) AS table_owner_ok,
        NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.filosage_documents') AND NOT tgisinternal) AS no_user_triggers,
        EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.filosage_documents') AND NOT relrowsecurity) AS no_rls,
        EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.filosage_documents') AND relkind='r' AND NOT relispartition) AND NOT EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=to_regclass('public.filosage_documents') OR inhparent=to_regclass('public.filosage_documents')) AS ordinary_table,
        NOT EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=to_regclass('public.filosage_documents')) AS no_rewrite_rules,
        NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE')
          AND NOT EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a WHERE d.datname='filosage' AND a.grantee=0 AND a.privilege_type='CREATE') AS public_create_denied,
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname='filosage_runtime') AS role_exists,
        current_setting('max_connections') AS max_connections,current_setting('reserved_connections') AS reserved_connections,
        current_setting('superuser_reserved_connections') AS superuser_reserved_connections`)).rows[0];
      requireTrue(Object.fromEntries(['correct_database','correct_admin','database_owner_ok','schema_owner_ok','table_owner_ok','no_user_triggers','no_rls','ordinary_table','no_rewrite_rules','public_create_denied'].map(k=>[k,preflight?.[k]])));
      if(preflight.max_connections!=='50'||preflight.reserved_connections!=='5'||preflight.superuser_reserved_connections!=='10'||typeof preflight.role_exists!=='boolean')throw new Error('Capacity changed.');
    } finally {await admin.query('ROLLBACK');}
    if(mode==='preflight')return {ok:true,mode,preflight,mutationPerformed:false};
    if(!preflight.role_exists){
      if(mode!=='apply')throw new Error('Dedicated role missing.');
      stage='create-role';await admin.query('BEGIN');
      try {
        await admin.query('SELECT pg_advisory_xact_lock(671206,1)');
        if((await admin.query("SELECT 1 FROM pg_roles WHERE rolname='filosage_runtime'")).rowCount)throw new Error('Role appeared concurrently.');
        const sql=(await admin.query("SELECT format('CREATE ROLE filosage_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 18',$1::text) AS sql",[password])).rows[0]?.sql;
        if(typeof sql!=='string'||!sql.startsWith('CREATE ROLE filosage_runtime '))throw new Error('Invalid role statement.');
        await admin.query(sql);
        await admin.query('GRANT CONNECT ON DATABASE filosage TO filosage_runtime');
        await admin.query('GRANT USAGE ON SCHEMA public TO filosage_runtime');
        await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.filosage_documents TO filosage_runtime');
        await admin.query('COMMIT');created=true;
      } catch(error){await admin.query('ROLLBACK').catch(()=>undefined);throw error;}
    }
    stage='catalog';await admin.query('BEGIN READ ONLY');let catalog;
    try {
      catalog=(await admin.query(`/* runtime-catalog */ SELECT
        r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconnlimit=18 AS attributes,
        has_database_privilege(r.rolname,'filosage','CONNECT') AND NOT has_database_privilege(r.rolname,'filosage','CREATE') AS database_acl,
        has_schema_privilege(r.rolname,'public','USAGE') AND NOT has_schema_privilege(r.rolname,'public','CREATE') AS schema_acl,
        has_table_privilege(r.rolname,'public.filosage_documents','SELECT') AND has_table_privilege(r.rolname,'public.filosage_documents','INSERT')
          AND has_table_privilege(r.rolname,'public.filosage_documents','UPDATE') AND has_table_privilege(r.rolname,'public.filosage_documents','DELETE') AS dml,
        NOT has_table_privilege(r.rolname,'public.filosage_documents','TRUNCATE') AND NOT has_table_privilege(r.rolname,'public.filosage_documents','REFERENCES')
          AND NOT has_table_privilege(r.rolname,'public.filosage_documents','TRIGGER') AS no_ddl,
        NOT EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a WHERE a.grantee=r.oid AND(a.is_grantable OR d.datname<>'filosage' OR a.privilege_type<>'CONNECT'))
          AND NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE a.grantee=r.oid AND(a.is_grantable OR n.nspname<>'public' OR a.privilege_type<>'USAGE'))
          AND NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE a.grantee=r.oid AND(a.is_grantable OR c.oid<>to_regclass('public.filosage_documents') OR a.privilege_type NOT IN('SELECT','INSERT','UPDATE','DELETE')))
          AND NOT EXISTS(SELECT 1 FROM pg_attribute t CROSS JOIN LATERAL aclexplode(t.attacl) a WHERE a.grantee=r.oid)
          AND NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE a.grantee=r.oid) AS exact_acl,
        NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
          AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=r.oid AND(member<>(SELECT oid FROM pg_roles WHERE rolname=session_user) OR NOT admin_option)) AS no_memberships,
        NOT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype='o') AS owns_nothing,
        NOT has_database_privilege(r.rolname,'filosageqa','CONNECT') AS no_qa_connect
        FROM pg_roles r WHERE r.rolname='filosage_runtime'`)).rows[0];requireTrue(catalog);
    } finally {await admin.query('ROLLBACK');}
    stage='runtime-login';runtime=factory({...options,user:'filosage_runtime',password});await runtime.connect();
    requireTrue((await runtime.query("/* runtime-identity */ SELECT current_database()='filosage' AND current_user='filosage_runtime' AS correct")).rows[0]);
    stage='schema-guard';await runtime.query('BEGIN READ ONLY');
    try {requireTrue((await runtime.query('/* current-schema-guard */ '+schemaSql)).rows[0]);}finally{await runtime.query('ROLLBACK');}
    stage='dml';const id=randomUUID(),path=`releaseRuntimeProbes/${id}`;await runtime.query('BEGIN');
    try {
      await runtime.query("INSERT INTO public.filosage_documents(path,collection_id,collection_path,document_id,data,version,created_at,updated_at) VALUES($1,'releaseRuntimeProbes','releaseRuntimeProbes',$2,'{\"value\":1}'::jsonb,1,transaction_timestamp(),transaction_timestamp())",[path,id]);
      if((await runtime.query('SELECT 1 FROM public.filosage_documents WHERE path=$1',[path])).rowCount!==1)throw new Error('Read verification failed.');
      if((await runtime.query("UPDATE public.filosage_documents SET data='{\"value\":2}'::jsonb WHERE path=$1",[path])).rowCount!==1)throw new Error('Update verification failed.');
      if((await runtime.query('DELETE FROM public.filosage_documents WHERE path=$1',[path])).rowCount!==1)throw new Error('Delete verification failed.');
    } finally {await runtime.query('ROLLBACK');}
    if((await runtime.query('SELECT 1 FROM public.filosage_documents WHERE path=$1',[path])).rowCount!==0)throw new Error('Probe row persisted.');
    return {ok:true,mode,created,capacity:{maxConnections:50,reservedConnections:5,superuserReservedConnections:10,modernConnections:18,qaAllowance:11,operationalReserve:6},role:'filosage_runtime',connectionLimit:18,catalog,runtimeTlsLoginVerified:true,rolledBackDmlVerified:true,currentSchemaSqlVerified:true,oldRuntimeBindingChanged:false};
  } catch(error){error.preparationStage=stage;throw error;}
  finally{await runtime?.end().catch(()=>undefined);await admin.end().catch(()=>undefined);}
}
const schemaSql='__CURRENT_SCHEMA_SQL__';
export async function runProductionRuntime(expectedSha,mode,password){
  const context={schemaVersion:1,operation:'production-runtime-preparation',sourceSha:expectedSha,mode,observedAt:new Date().toISOString()};
  if(!/^[a-f0-9]{40}$/.test(expectedSha)||process.env.SITE_VERSION!==expectedSha)throw new Error('Runtime source mismatch.');
  const require=createRequire(`${process.cwd()}/package.json`),pg=require('pg');
  try{return {...context,...await prepareProductionRuntime(o=>new pg.Client(o),process.env.DATABASE_URL,process.env.DATABASE_SSL,password,mode,schemaSql)};}
  catch(error){return {...context,ok:false,stage:['admin-connect','preflight','create-role','catalog','runtime-login','dml','schema-guard'].includes(error.preparationStage)?error.preparationStage:'unknown',sqlState:/^[0-9A-Z]{5}$/.test(error.code)?error.code:null};}
}
