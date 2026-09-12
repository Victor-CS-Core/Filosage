# Filosage QA database permission correction proposal

> Historical September 11 recovery record, preserved during September 12 branch consolidation. Later evidence and instructions in [AGENT_PROGRESS.md](../AGENT_PROGRESS.md) supersede pending states and older tracker requirements here. This record grants no new operational authorization.

Scope: QA database permission correction only. This document proposes no executed provider, database, secret, resource, deployment, or source change.

Candidate: `04723a6f1207b420799dce266f70f9ddf767c92a`

## Review verdict and exact approval scope

**Verdict: ready for a concrete approval decision; not executed.** The smallest safe correction is to create the absent non-owner login `filosageqa_runtime`, grant it only QA database `CONNECT`, QA `public` schema `USAGE`, and DML on `public.filosage_documents`, then add the new QA-only Key Vault/Container App secret reference `database-url-qa-runtime-v2` and bind only the candidate revision's `DATABASE_URL` to it. Preserve the existing `filosageqa_app` owners, login, secret, and prior QA revision unchanged for rollback.

Exact approval target:

- Azure subscription `bfc8f890-2681-43dc-8eac-51644341ae12`;
- resource group `filosage-staging-central-rg`;
- PostgreSQL server `filosagestg-p4ujucgnxq3gs-pg`;
- database `filosageqa` only;
- create login role `filosageqa_runtime` with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` and no memberships;
- grant only `CONNECT` on `filosageqa`, `USAGE` on its `public` schema, and `SELECT, INSERT, UPDATE, DELETE` on `public.filosage_documents`;
- create/bind `database-url-qa-runtime-v2` only to QA and point the candidate revision's `DATABASE_URL` at that new secret reference;
- retain database/table owner `filosageqa_app`, schema owner `azure_pg_admin`, the existing database secret, and the previous QA revision unchanged;
- make no ownership transfer, `PUBLIC` ACL change, production ACL/role/secret change, schema migration, data change, live-billing change, or public deployment.

## Observed failure and root cause

Parent read-only evidence against the exact Azure server and existing QA connection established:

```text
database=filosageqa
runtime_role=filosageqa_app
database_owner=filosageqa_app
schema_owner=azure_pg_admin
table_owner=filosageqa_app
SELECT/INSERT/UPDATE/DELETE=true
schema CREATE=true
database CREATE=true
elevated role membership=false
exact candidate verifier=CANDIDATE_QA_DB_PREFLIGHT_FAIL
```

Fresh ACL evidence resolved the cause precisely:

- production application database `filosage`: `PUBLIC` has `TEMPORARY` only, with no `CONNECT` or `CREATE`;
- QA database `filosageqa`: `PUBLIC` has `TEMPORARY` only; owner `filosageqa_app` has `CONNECT`, `CREATE`, and `TEMPORARY`;
- QA `public` schema: `PUBLIC` has `USAGE` only; `azure_pg_admin` and `filosageqa_app` each have `CREATE` and `USAGE`;
- proposed role `filosageqa_runtime` is absent;
- `filosageqa_app` is `NOINHERIT` with no elevated attributes; the only relevant membership row is `filosageadmin` as a member of `filosageqa_app`.

The candidate verifier requires DML but rejects database/schema `CREATE`, elevated-role membership, and membership in the table-owning role. Database/table ownership and the direct QA schema grant are the complete cause of the current failure. `PUBLIC` is not the source, so no `PUBLIC` revoke is required. Revoking ordinary privileges from the owner would not remove inherent ownership power and would still leave table-owner membership failing.

This matches the repository contract:

- `scripts/verify-azure-database.ts` rejects database/schema CREATE and table-owner membership.
- `scripts/provision-azure-postgres-roles.ts` deliberately refuses to proceed when its target runtime role owns `public.filosage_documents`; it says ownership transfer is a separately reviewed operation.
- `docs/BLUE_GREEN_BFF_OPERATIONS.md` requires exact ownership/membership inspection and separate approval, and forbids silently reassigning every object.

PostgreSQL 16 also documents that ownership carries inherent rights and that `PUBLIC` grants apply to every role: [Privileges](https://www.postgresql.org/docs/16/ddl-priv.html). Broad `REASSIGN OWNED` is unsuitable because it can reassign every object owned by the role in the current database plus shared objects: [REASSIGN OWNED](https://www.postgresql.org/docs/16/sql-reassign-owned.html).

## Recommended correction

Create or select a **distinct non-owner QA runtime login**, proposed name `filosageqa_runtime`, and point only the new QA candidate revision at a new versioned database secret for that login. Keep `filosageqa_app` unchanged as the owner and as the credential used by the current QA revision during the validation/rollback window.

This is safer than ownership transfer because it:

- changes no database, schema, table, index, or data ownership;
- changes no existing role attributes, password, memberships, or grants;
- preserves all existing rows and current DML behavior;
- leaves the existing QA revision and its secret available for immediate application rollback;
- gives the candidate a login with only `CONNECT`, schema `USAGE`, and exact-table DML;
- permits later hardening of the old owner role to `NOLOGIN`, after all old revisions are drained and under a separate approval.

The role is QA-scoped by name and explicit grants, but PostgreSQL roles are server-wide. The production application database does not grant `PUBLIC CONNECT/CREATE`, so the new role gains no production application-database access and no production ACL must change. System databases retain their existing `PUBLIC CONNECT` plus `TEMPORARY` defaults, so this is not absolute all-database no-connect isolation; it is QA application-data isolation on the shared server.

## Required explicit approval

The recommended path avoids ownership transfer, so it does **not** require approval to transfer database/table ownership. It still requires Victor's explicit approval for the concrete QA bootstrap operation because it creates a server role, changes QA ACLs, creates/binds a new secret, and changes the QA revision's database credential. The repository operations runbook requires approval for the specific bootstrap/ownership/RBAC operation; the general candidate source review is not that approval.

The approval packet should identify:

- exact Azure PostgreSQL server/resource and target database `filosageqa`;
- proposed role name `filosageqa_runtime` (or the independently verified existing non-owner role chosen instead);
- exact secret/app-secret names, with no value disclosed;
- confirmation that no `PUBLIC` ACL change is included;
- unchanged owner role `filosageqa_app` and unchanged owners;
- exact preflight, transaction, postconditions, and rollback below.

If the new-role path is rejected and ownership transfer is considered, obtain a separate explicit ownership-transfer approval. Do not infer it from QA deployment approval.

## Read-only preflight

Run as the approved bootstrap administrator, explicitly connected to `filosageqa` on subscription `bfc8f890-2681-43dc-8eac-51644341ae12`, resource group `filosage-staging-central-rg`, server `filosagestg-p4ujucgnxq3gs-pg`, with statement and lock timeouts. Retain sanitized results. Stop unless every assertion is resolved.

### 1. Confirm target and current ownership

```sql
SELECT current_database() AS database,
       session_user,
       current_user,
       current_setting('server_version_num') AS server_version_num;

SELECT d.datname,
       pg_get_userbyid(d.datdba) AS database_owner,
       d.datallowconn,
       d.datacl
FROM pg_database AS d
WHERE d.datname = 'filosageqa';

SELECT n.nspname,
       pg_get_userbyid(n.nspowner) AS schema_owner,
       n.nspacl
FROM pg_namespace AS n
WHERE n.nspname = 'public';

SELECT c.oid,
       c.relkind,
       n.nspname,
       c.relname,
       pg_get_userbyid(c.relowner) AS owner,
       c.relacl
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'filosage_documents';
```

Require exactly `filosageqa`, schema owner `azure_pg_admin`, and the observed owners above. If the server/resource identity does not match the already approved isolated QA datastore, stop.

### 2. Confirm the resolved schema-CREATE source and unchanged PUBLIC ACLs

```sql
SELECT 'database' AS object_type,
       d.datname AS object_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type,
       a.is_grantable
FROM pg_database AS d
CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) AS a
WHERE d.datname = 'filosageqa'

UNION ALL

SELECT 'schema',
       n.nspname,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
       a.privilege_type,
       a.is_grantable
FROM pg_namespace AS n
CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS a
WHERE n.nspname = 'public'
ORDER BY 1, 2, 3, 4;

SELECT member.rolname AS member,
       granted.rolname AS granted_role,
       membership.admin_option
FROM pg_auth_members AS membership
JOIN pg_roles AS member ON member.oid = membership.member
JOIN pg_roles AS granted ON granted.oid = membership.roleid
WHERE member.rolname IN ('filosageqa_app', 'filosageqa_runtime')
   OR granted.rolname IN ('filosageqa_app', 'filosageqa_runtime')
ORDER BY 1, 2;
```

Require the fresh result to remain unchanged: QA database `PUBLIC=TEMPORARY`, QA schema `PUBLIC=USAGE`, and the `CREATE` entries belong only to the existing owner/admin roles. Any new `PUBLIC CONNECT/CREATE` entry stops the operation for review. The correction contains no `PUBLIC` revoke because none is needed.

### 3. Prove a new role will not acquire shared/production rights

```sql
SELECT d.datname,
       pg_get_userbyid(d.datdba) AS owner,
       d.datallowconn,
       d.datacl
FROM pg_database AS d
WHERE NOT d.datistemplate
ORDER BY d.datname;

SELECT r.rolname,
       r.rolcanlogin,
       r.rolsuper,
       r.rolcreatedb,
       r.rolcreaterole,
       r.rolinherit,
       r.rolbypassrls
FROM pg_roles AS r
WHERE r.rolname IN ('filosageqa_app', 'filosageqa_runtime', 'azure_pg_admin');

SELECT NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'filosageqa_runtime'
) AS proposed_role_name_is_free;
```

Prefer a genuinely absent role name. If it exists, stop; do not let `provision-azure-postgres-roles.ts` rotate its password or attributes until its owners, memberships, grants, active sessions, and consumers are independently inventoried.

Fresh evidence shows the production application database grants `PUBLIC` only `TEMPORARY`, not `CONNECT/CREATE`, so the proposed role receives no production application-database connection privilege and no production ACL change is needed. System databases still grant `PUBLIC CONNECT` and `TEMPORARY`; record that limit accurately. A direct revoke from the new role would not override `PUBLIC`, and changing system-database ACLs is outside this QA correction.

### 4. Confirm no object/data operation is needed

```sql
SELECT n.nspname,
       c.relkind,
       c.relname
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_roles AS r ON r.oid = c.relowner
WHERE r.rolname = 'filosageqa_app'
ORDER BY n.nspname, c.relkind, c.relname;

SELECT count(*) AS row_count,
       pg_total_relation_size('public.filosage_documents') AS total_bytes,
       min(created_at) AS earliest_created_at,
       max(updated_at) AS latest_updated_at
FROM public.filosage_documents;
```

The inventory is evidence only. Do not run `REASSIGN OWNED`, `DROP OWNED`, `ALTER DEFAULT PRIVILEGES`, a schema migration, or an ownership change. If exact before/after row metrics are required, briefly quiesce QA writers; otherwise concurrent legitimate QA DML can change the metrics even though this permission correction changes no rows.

## Minimal approved database transaction

Use validated identifiers and a securely generated password that is never placed in Git, chat, command arguments, or retained logs. The statements below describe the exact intended effect; `<secure parameter>` is supplied only through the approved private execution channel.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(671206, 1);

CREATE ROLE filosageqa_runtime
  LOGIN
  PASSWORD '<secure parameter>'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;

GRANT CONNECT ON DATABASE filosageqa TO filosageqa_runtime;
REVOKE CREATE ON DATABASE filosageqa FROM filosageqa_runtime;

GRANT USAGE ON SCHEMA public TO filosageqa_runtime;
REVOKE CREATE ON SCHEMA public FROM filosageqa_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.filosage_documents
  TO filosageqa_runtime;

COMMIT;
```

No `PUBLIC` grant/revoke statement is part of this operation. Fresh ACL evidence proves the new role needs only its explicit QA grants.

### Existing bootstrap-script evaluation

The existing provisioner is safe with respect to data and ownership when pointed at a genuinely new role: its ownership guard will not fire, it creates the role with the required negative attributes, and it grants only exact-table DML plus schema USAGE. It does not transfer ownership.

However, running the existing Docker `bootstrap` command is broader than this correction:

- it first runs the additive schema migration even though the parent already verified compatible columns and primary key;
- the provisioner unconditionally revokes both `CONNECT` and `CREATE` on `filosageqa` from `PUBLIC`;
- it unconditionally revokes schema `CREATE` from `PUBLIC`;
- it changes the password and attributes if the selected role already exists.

Therefore, do not run the full bootstrap target unchanged for this correction. Fresh ACL evidence proves its unconditional PUBLIC revokes and migration are unnecessary. The smallest operation is the reviewed transaction above. Never point the existing provisioner at `filosageqa_app`; its ownership guard is expected to reject that path.

## New secret and revision binding

After the database transaction passes, construct a DSN that differs from the existing QA DSN only in the username/password and remains pinned to database `/filosageqa` with `sslmode=verify-full`.

Create a new Key Vault secret name and a new Container App secret reference, for example `database-url-qa-runtime-v2`. Do not overwrite or repoint the existing `database-url-qa` secret. Bind only the new candidate revision's `DATABASE_URL` to the new app-secret reference. Preserve the previous QA revision, image, environment, and old secret binding during acceptance.

Before starting the candidate, verify its environment contains no `DATABASE_ADMIN_URL`, `POSTGRES_APP_PASSWORD`, or `POSTGRES_QA_APP_PASSWORD`. The runtime must receive only `DATABASE_URL` by secret reference.

Secret creation/binding and revision creation are parent-owned provider mutations and are not performed or authorized by this proposal.

## Mandatory postconditions

Connect using the new QA runtime DSN and require all of these before accepting the candidate:

```sql
SELECT current_database() = 'filosageqa' AS correct_database,
       current_user = 'filosageqa_runtime' AS correct_role,
       has_table_privilege(current_user, 'public.filosage_documents', 'SELECT') AS can_select,
       has_table_privilege(current_user, 'public.filosage_documents', 'INSERT') AS can_insert,
       has_table_privilege(current_user, 'public.filosage_documents', 'UPDATE') AS can_update,
       has_table_privilege(current_user, 'public.filosage_documents', 'DELETE') AS can_delete,
       has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_schema,
       has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_in_database,
       EXISTS (
         SELECT 1 FROM pg_roles
         WHERE pg_has_role(current_user, oid, 'MEMBER')
           AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)
       ) AS has_elevated_membership,
       EXISTS (
         SELECT 1 FROM pg_class
         WHERE oid = to_regclass('public.filosage_documents')
           AND pg_has_role(current_user, relowner, 'MEMBER')
       ) AS has_table_owner_membership;
```

Required result:

```text
correct_database=true
correct_role=true
can_select/can_insert/can_update/can_delete=true
can_create_in_schema=false
can_create_in_database=false
has_elevated_membership=false
has_table_owner_membership=false
```

Then require:

1. The exact candidate `verifyAzureDatabaseSchema` returns success against the new DSN.
2. A transaction-only DML probe can insert, select, update, and delete one uniquely named probe row, followed by `ROLLBACK`; the row must not exist afterward. Do not run `ALTER`, `DROP`, or other DDL probes against the real table.
3. Read-only privilege/ownership introspection matches the required false/true matrix above.
4. The new role owns no databases, schemas, tables, sequences, routines, or types and has no memberships.
5. The existing owners remain exactly `filosageqa_app` for the database/table and `azure_pg_admin` for `public`.
6. The old QA revision remains healthy until the candidate is proven. The candidate startup log contains `AZURE_DATABASE_SCHEMA_VERIFIED`; `/api/health` reports configuration/datastore healthy and the exact candidate identity.
7. No production database/schema/table ACL, owner, role, secret, revision, image, or health result changed.

## Rollback and cleanup

Database role/grant creation does not change application rows and has no data rollback. Application rollback is therefore:

1. Route/revert QA to the captured prior revision using its original `database-url-qa` binding.
2. Confirm the prior revision's health and bounded DML behavior.
3. Leave `filosageqa_runtime` and its new secret in place but unused until all candidate sessions are drained and the failure is understood.

Only after a separate cleanup review may the operator revoke the new role's exact grants, set it `NOLOGIN`, delete the unused secret reference, and eventually drop the role. Do not use `DROP OWNED`; the role should own nothing, and broad cleanup is unnecessary. No `PUBLIC` ACL rollback exists because this operation changes no `PUBLIC` ACL.

After the candidate is accepted and all rollback needs are resolved, consider a separate hardening operation to set the old owner role `filosageqa_app` to `NOLOGIN`. That preserves ownership while preventing future runtime use of the owner credential. It is not part of this correction and must not happen while any rollback revision still uses the old DSN.

## Rejected alternatives

- **Revoke CREATE from `filosageqa_app` only:** insufficient because database ownership is an inherent source of power, and table ownership still fails the verifier.
- **Run the current provisioner against `filosageqa_app`:** intentionally blocked by its table-owner guard.
- **Transfer ownership now:** possible but more invasive, harder to roll back, and expressly requires separate approval. If ever selected, review exact database and table ownership changes individually after proving the new owner and operator permissions; never use `REASSIGN OWNED`.
- **Relax the candidate verifier:** defeats the reviewed least-privilege contract and leaves a runtime capable of DDL/destruction.
- **Overwrite the current database secret:** removes the clean revision-level rollback boundary.
- **Change production/PUBLIC ACLs to accommodate the QA role:** outside this QA-only scope.

## Operational state

Recommended decision: approve and execute only the exact distinct-role/grant/new-secret/candidate-binding scope stated at the top. Fresh ACL evidence removes the earlier PUBLIC uncertainty. Ownership transfer is not required, and the full existing bootstrap target is broader than the correction.

Multica item: parent recovery key `filosage-public-release-2026-09-11`; owner is the parent coordinating agent; status remains QA execution in progress. Multica is unavailable in this worker, so no item/event was fabricated. Evidence: parent read-only role/owner/ACL matrix plus exact candidate/runtime/bootstrap/runbook review. Blocker: concrete approval for the exact new-role/grants/new-secret/candidate-binding operation. Approval: explicit QA bootstrap/secret binding approval required; explicit ownership-transfer approval required only for the rejected/fallback ownership path. Commit: none. Push: none. QA database/provider mutation: none. QA deployment: none by this worker. Production mutation/deployment/verification: none.
