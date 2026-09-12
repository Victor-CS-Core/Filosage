/* Read-only QA catalog and aggregate probe. Credentials never leave this process. */
const { Client } = require('pg');
const nonce = '__PROTOCOL_NONCE__';
const stages = ['target', 'connect', 'transaction', 'catalog', 'aggregates', 'rollback'];
let stage = 'target';
let sent = false;
function emit(value) {
  if (!sent) process.stdout.write(`__FSG_RESULT_${nonce}__${Buffer.from(JSON.stringify(value)).toString('base64')}\n`);
  sent = true;
}
const deadline = setTimeout(() => { emit({ ok: false, stage, sqlstate: null }); process.exit(1); }, 55000);
const collections = [
  'users', 'courses', 'lessons', 'courseReleases', 'courseProgress', 'learningData',
  'lessonNotes', 'lessonActivity', 'lessonInteraction', 'lessonInteractionMutations',
  'learningOutcomes', 'masteryEvidence', 'flashcardDecks', 'flashcards', 'flashcardReviewState',
  'evidenceShares', 'evidenceShareRefs', 'courseCredits', 'courseCreditClaims',
  'billingCheckout', 'billingReconciliation', 'billingTransitions', 'stripeEvents', 'billingEvents',
  'billingWebhookEvents', 'legalAcceptances', 'billingConsents', 'userSafety', 'safetyEvents',
  'contentReports', 'adminEvents', 'commandCenterTickets', 'commandCenterApprovals',
  'commandCenterDrafts', 'commandCenterAuditEvents', 'commandCenterTicketRequests',
  'commandCenterPublicReplyRequests', 'commandCenterApprovalReviewRequests',
  'identityLinks', 'identityEmails', 'identityEmailOwners', 'identityLinkIntents', 'identityLinkEvents',
  'accountLifecycles', 'accountDeletionJobs', 'generationUsageReceipts', 'systemUsageShards',
  'generationOperations', 'generationStages', 'aiRequests', 'usagePeriods', 'userAiBudgets',
  'userEngagement', 'pricingIntents', 'productEvents', 'referralCodes', 'courseResearchArtifacts',
  'courseBannerKeys', 'courseBannerAssets', 'coursePipelineEvents', 'courseRepairs',
  'courseManualReviewMutations', 'outcomeFeedback', 'waitlist',
];
const retained = ['legalAcceptances', 'billingConsents', 'userSafety', 'safetyEvents', 'contentReports',
  'adminEvents', 'commandCenterTickets', 'commandCenterApprovals', 'commandCenterDrafts',
  'commandCenterAuditEvents', 'commandCenterTicketRequests', 'commandCenterPublicReplyRequests',
  'commandCenterApprovalReviewRequests', 'identityLinks', 'identityEmails', 'identityEmailOwners',
  'identityLinkIntents', 'identityLinkEvents', 'accountLifecycles', 'accountDeletionJobs'];
async function main() {
  let client;
  let transaction = false;
  try {
    const dsn = process.env.DATABASE_URL;
    const url = new URL(dsn);
    if (url.hostname !== 'filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com'
        || url.pathname !== '/filosageqa' || url.username !== 'filosageqa_runtime'
        || url.searchParams.get('sslmode') !== 'verify-full'
        || process.env.SITE_VERSION !== 'c7d9c2c274bfcaee805332a83d94a208af32f09e') throw new Error('target');
    stage = 'connect';
    client = new Client({ connectionString: dsn, ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 8000, query_timeout: 10000, statement_timeout: 10000,
      application_name: 'qa-retirement-readonly', options: '-c default_transaction_read_only=on' });
    await client.connect();
    stage = 'transaction';
    await client.query('BEGIN READ ONLY'); transaction = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const identity = (await client.query(`SELECT current_database() = 'filosageqa' AS correct_database,
      current_user = 'filosageqa_runtime' AS correct_role,
      current_setting('transaction_read_only') = 'on' AS read_only`)).rows[0];
    if (!Object.values(identity).every(v => v === true)) throw new Error('identity');
    stage = 'catalog';
    const roles = (await client.query(`SELECT oid::int, rolname AS role, rolcanlogin AS login,
      rolsuper AS superuser, rolcreatedb AS create_database, rolcreaterole AS create_role,
      rolinherit AS inherit, rolbypassrls AS bypass_rls FROM pg_roles
      WHERE rolname IN ('filosageqa_app', 'filosageqa_runtime') ORDER BY rolname`)).rows;
    const databases = (await client.query(`SELECT oid::int, datname AS database,
      datdba::int AS owner_oid, CASE WHEN datname='filosageqa' THEN pg_database_size(oid)::text ELSE NULL END AS bytes,
      has_database_privilege('filosageqa_runtime', oid, 'CONNECT') AS runtime_connect
      FROM pg_database WHERE datname IN ('filosageqa', 'filosage') ORDER BY datname`)).rows;
    const dependencies = (await client.query(`SELECT r.rolname AS role,
      CASE WHEN s.dbid = 0 THEN '_shared' WHEN d.datname IN ('filosageqa','filosage','postgres','azure_sys','azure_maintenance')
      THEN d.datname ELSE '_other' END AS database, s.dbid::int AS database_oid,
      s.deptype::text AS dependency_type, count(*)::int AS count
      FROM pg_shdepend s JOIN pg_roles r ON r.oid=s.refobjid
      LEFT JOIN pg_database d ON d.oid=s.dbid WHERE s.refclassid='pg_authid'::regclass
      AND r.rolname IN ('filosageqa_app','filosageqa_runtime') GROUP BY 1,2,3,4 ORDER BY 1,2,4`)).rows;
    const memberships = (await client.query(`SELECT granted.oid::int AS granted_role_oid,
      member.oid::int AS member_role_oid, m.admin_option FROM pg_auth_members m
      JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid
      WHERE member.rolname IN ('filosageqa_app','filosageqa_runtime')
      OR granted.rolname IN ('filosageqa_app','filosageqa_runtime') ORDER BY 1,2`)).rows;
    const sessions = (await client.query(`SELECT r.rolname AS role,
      count(a.pid)::int AS connection_count,
      count(a.pid) FILTER (WHERE a.pid <> pg_backend_pid())::int AS other_connection_count
      FROM pg_roles r LEFT JOIN pg_stat_activity a ON a.usesysid=r.oid
      WHERE r.rolname IN ('filosageqa_app','filosageqa_runtime') GROUP BY r.rolname ORDER BY r.rolname`)).rows;
    const relation = (await client.query(`SELECT c.oid::int, c.relowner::int AS owner_oid,
      pg_total_relation_size(c.oid)::text AS bytes,
      has_schema_privilege(current_user,'public','CREATE') AS runtime_schema_create,
      has_database_privilege(current_user,current_database(),'CREATE') AS runtime_database_create
      FROM pg_class c WHERE c.oid=to_regclass('public.filosage_documents')`)).rows;
    stage = 'aggregates';
    const counts = (await client.query(`SELECT CASE WHEN collection_id = ANY($1::text[]) THEN collection_id
      ELSE '_unclassified' END AS category, count(*)::int AS count
      FROM public.filosage_documents GROUP BY 1 ORDER BY 1`, [collections])).rows;
    const summary = (await client.query(`SELECT count(*)::int AS total_documents,
      count(*) FILTER (WHERE collection_id = ANY($1::text[]))::int AS retained_policy_category_documents,
      count(*) FILTER (WHERE data ? 'uid' OR data ? 'ownerUid' OR data ? 'createdBy')::int AS documents_with_account_relation,
      count(*) FILTER (WHERE data ? 'courseId')::int AS documents_with_course_relation,
      count(*) FILTER (WHERE data ? 'billingCustomerId' OR data ? 'billingSubscriptionId')::int AS documents_with_billing_relation,
      count(*) FILTER (WHERE collection_id='courses' AND data->>'isPublic'='true')::int AS public_course_documents,
      count(*) FILTER (WHERE collection_id='accountDeletionJobs')::int AS account_deletion_job_documents,
      count(*) FILTER (WHERE collection_id IN ('courseBannerAssets','courseBannerKeys'))::int AS banner_reference_documents,
      min(created_at)::text AS earliest_created_at, max(updated_at)::text AS latest_updated_at
      FROM public.filosage_documents`, [retained])).rows[0];
    stage = 'rollback';
    await client.query('ROLLBACK'); transaction = false;
    emit({ ok: true, identity, roles, databases, dependencies, memberships, sessions, relation, counts, summary });
  } catch (error) {
    emit({ ok: false, stage: stages.includes(stage) ? stage : 'target',
      sqlstate: typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null });
  } finally {
    if (transaction) await client?.query('ROLLBACK').catch(() => undefined);
    await client?.end().catch(() => undefined);
    clearTimeout(deadline);
  }
}
main();
