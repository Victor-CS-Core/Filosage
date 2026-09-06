# Blue/green BFF release contract

Victor changed the deployment architecture on September 6, 2026: eliminate the
separate QA site and keep blue and green for testing the inactive deployment
before swapping traffic. The frontend and backend must run in the same Azure
application using the Backend for Frontend (BFF) pattern.

This decision supersedes separate-QA-site requirements in the September 5
release plan and its later implementation notes. The remaining R01–R26 product,
privacy, billing, quality, recovery and operating requirements remain in scope.

## Application and request boundary

One Azure Container App runs the Next.js frontend and its server API route
handlers in the same immutable container image. Browser application requests use
same-origin `/api` endpoints. Authentication is verified server-side at that BFF;
database, storage, billing and model-provider credentials remain server-side.
No separately deployed frontend, public backend app, or third QA website is
introduced. Blue and green are revision labels of that same Container App.

## Candidate verification and traffic swap

1. Read actual blue/green revision bindings, image digests and traffic weights.
   Require one live revision at 100% public traffic and the candidate at 0%; fail
   ambiguous, partial, missing or unexpected bindings. Never infer the inactive
   revision from its color alone.
2. Build the selected full source SHA once. Bind the immutable image digest,
   committed capability manifest, canonical origin, authentication mode and
   compatibility requirements in candidate evidence.
3. Deploy that image as the inactive revision while preserving the live traffic
   binding. Test it through its revision/label URL. Read back actual traffic
   after deployment to prove that public traffic stayed on the live revision.
4. Collect engineering, BFF/authentication, real learner, publication, privacy,
   billing-containment and operations evidence against that exact candidate.
   A zero public-traffic weight does not make its URL private or its data writes
   harmless; only approved test accounts/data may be used for hosted mutations.
5. Before an approved swap, recheck the source, digest, revision, manifest,
   origin/authentication, current traffic and all required evidence. Route 100%
   public traffic to the verified candidate. Do not rebuild during promotion.
6. Verify canonical public routing and critical signed-in behavior after the
   swap. Retain the prior compatible revision at 0% for rollback. A traffic
   rollback must also respect account, publication and accounting write-version
   compatibility; an older binary that bypasses new fences is not a safe target.

Both revisions share the application's durable services. Schema changes must
support overlapping old/new readers and writers. Use additive migrations and an
explicit write-protocol cutover where required; zero traffic does not prove that
the previous revision has no in-flight work. Hosted tests, migration execution,
traffic changes and cleanup require a concrete reviewed operation and the
applicable authorization. Source changes and commits/pushes remain authorized.

## QA retirement and outstanding provider evidence

Remove the separate QA deployment workflow, QA-only infrastructure provisioning,
and dependencies on QA run IDs, hosts, credentials and service identities from
the release path. Replace them with inactive-revision test evidence. Preserve
historical evidence as history, not as a release prerequisite or current topology.

Existing Azure resources, DNS/auth callback registrations, role assignments,
databases and Blob contents must be inventoried before retirement. Removing a
Bicep resource from an incremental template does not delete the live resource or
revoke its access. No live QA resource deletion, database purge, role revocation,
deployment or traffic change has been performed by this implementation.
Provider access and an exact retirement inventory remain required before those
operations can be made reviewable and executed.

R06 now separates runtime and bootstrap privileges within the one-app topology.
R17/R19/R20/R21/R25 use inactive-revision verification instead of a QA website.
R18 retains separate private recovery targets for restore rehearsals; these are
temporary recovery infrastructure, not an additional deployed application site.
