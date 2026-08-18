# FiloSage Release Legal Exposure Gauntlet

**Purpose:** Run this task against the FiloSage repository and deployed release candidate before commercial launch. The goal is to reduce preventable legal, privacy, subscription, security, AI-safety, advertising, accessibility, and user-content exposure through verifiable engineering controls and release evidence.

**Important:** This is an engineering/compliance hardening task, not a substitute for legal advice. Do not invent legal conclusions. When a requirement depends on facts that cannot be determined from code or authoritative sources, create a clearly labeled **OWNER/COUNSEL DECISION REQUIRED** blocker rather than guessing.

---

## Operating instructions for the agent

You are the release-compliance engineer for FiloSage. Work directly against the current repository and, where credentials/environment access allow, the deployed release candidate.

Your job is not to produce a generic checklist. You must:

1. Inspect the implementation.
2. Map actual data flows and business behavior.
3. Compare implementation to public claims and current legal requirements.
4. Fix engineering defects that create avoidable exposure.
5. Add regression tests.
6. Produce evidence proving each control.
7. Mark unresolved legal/business decisions as launch blockers.
8. Finish with a binary **SHIP / DO NOT SHIP** recommendation.

Use primary/official sources for legal requirements whenever possible, including FTC, California Privacy Protection Agency, California Legislature, U.S. Copyright Office, DOJ/ADA.gov, and relevant state statutes/regulators. Record the source and date checked in the final evidence report. Do not rely on social-media penalty lists or secondary summaries when an authoritative source exists.

Assume a **U.S.-first commercial launch** unless the product configuration proves otherwise. If users outside the U.S. can create accounts or purchase plans, identify the additional GDPR/UK GDPR/international obligations as a separate launch decision rather than silently claiming global compliance.

Do not weaken product security, delete records that must legitimately be retained, remove legally required evidence of consent, or make legal promises the implementation cannot satisfy.

---

# Existing baseline that must be verified, not assumed

The repository already appears to contain several meaningful controls. Treat them as hypotheses until tested:

- `src/app/privacy/page.tsx` contains a detailed Privacy Notice covering account data, learning data, AI content, analytics, technical data, Stripe billing data, vendors/processors, retention, rights, children, and AI-assisted operations.
- `src/app/privacy-center/page.tsx` provides privacy controls.
- `src/app/api/account/data/route.ts` contains account export and account deletion logic.
- `src/lib/account-data-policy.ts` defines deletion inventory and retained-record categories.
- `src/components/AnalyticsConsent.tsx` implements optional analytics consent.
- `infra/azure/main.bicep` sets `allowBlobPublicAccess: false`, `allowSharedKeyAccess: false`, OAuth-first authentication, HTTPS/TLS requirements, and `publicAccess: 'None'` for the course-banner container.
- `firestore.rules` denies browser reads/writes to the legacy Firebase source.
- `src/app/api/billing/portal/route.ts` exposes authenticated Stripe billing-management access.
- `src/lib/content-safety.ts` performs safety filtering and specifically blocks self-harm instructions, but this is not necessarily the same as a legally or ethically adequate crisis-response flow.
- `src/components/CourseDisclosure.tsx` and public legal disclosures appear intended to identify AI-assisted content.
- `src/app/copyright/page.tsx` contains copyright/DMCA-facing content.
- tests already exist for account privacy, analytics consent, billing lifecycle, accessibility-related UI behavior, security, support, and release hardening.

Do not report these controls as passing simply because files exist. Prove behavior.

---

# Phase 1 — Build the authoritative release data map

Create `docs/legal-release/DATA_FLOW_INVENTORY.md`.

Inventory every category of information that can enter, leave, or persist in FiloSage, including at minimum:

- authentication identity and profile data;
- age/eligibility attestations;
- account and profile data;
- course creation prompts and uploaded/reference material;
- notes, lesson activity, interactions, quiz responses, learning outcomes, mastery evidence, flashcards, progress, goals and preferences;
- AI prompts, model context, outputs, moderation/safety metadata, AI request IDs and token/usage records;
- support tickets, content reports, command-center records and owner notes;
- analytics/product events, campaign/referral data, cookies and local storage;
- IP addresses, hosting/security logs, device/browser metadata and monitoring/error data;
- billing identifiers, Stripe customer/subscription/invoice/refund/dispute records;
- waitlist/marketing email data;
- public course content, public evidence-share data and generated course banners;
- backups, soft-delete stores, object-version retention and disaster-recovery copies.

For each category document:

- collection point;
- purpose;
- legal/business necessity;
- exact storage location;
- whether it is first-party or sent to a provider;
- provider/recipient;
- retention behavior;
- deletion behavior;
- whether it is included in account export;
- whether it is public, authenticated, owner-only, or internal;
- whether the Privacy Notice describes it accurately.

Search the repository rather than relying on filenames alone. Include server logs, environment integrations and background/operational workflows.

**Fail condition:** any persistent user-linked data store that is absent from the inventory.

---

# Phase 2 — Privacy Notice versus reality

Audit `src/app/privacy/page.tsx`, `src/app/privacy-center/page.tsx`, legal-consent flows and runtime behavior against the Phase 1 inventory.

Verify that the notice accurately and conspicuously describes:

- categories of personal information actually collected;
- purposes of collection/use;
- Azure, Google, OpenAI, Stripe and any other actual processors/providers;
- analytics behavior and consent;
- AI prompt/context transmission;
- retention practices;
- account export/deletion rights;
- sale/sharing/targeted-advertising status;
- children/minimum-age policy;
- international processing statements;
- operational AI review;
- contact method for privacy requests;
- current legal operator/business address when required for commercial launch.

Do not add broad language just to cover unknown future behavior. Prefer precise disclosures tied to actual implementation.

If the application starts collecting a category before it is disclosed, either stop that collection until disclosure/consent is correct or update the disclosure and acceptance flow as legally appropriate.

### Privacy-right tests

Add automated tests proving that a normal user can:

- obtain an authenticated export of their data;
- never export another user's data;
- request deletion only after appropriate re-authentication;
- delete all deletable account-linked records;
- receive an explicit explanation of records retained for legitimate legal/security/accounting reasons;
- disable optional analytics and stop future optional product-event collection;
- clear optional local analytics identifiers after withdrawal;
- exercise the flow without dark patterns.

Where California privacy law applies, verify support for access/know, correction, deletion, portability and non-discrimination as applicable. If FiloSage is not currently subject to the CCPA thresholds, record that as an applicability determination requiring owner/counsel confirmation; do not remove good privacy controls merely because a threshold might not be met.

Also verify current 2026 California privacy regulations and data-minimization/purpose-limitation requirements from the California Privacy Protection Agency.

---

# Phase 3 — Prove deletion end to end

The current account deletion inventory is substantial, but prove that deletion is complete.

Trace `DELETE /api/account/data` through every affected subsystem.

Create automated integration tests that seed one synthetic account with records in every user-linked collection/storage system, run the deletion flow, and then assert:

- deletable database records are gone;
- authored-course records are removed or reassigned according to policy;
- lesson/activity/flashcard/progress/evidence-share/referral/AI-usage/research records are handled correctly;
- public share tokens owned by the user no longer expose deleted private content;
- waitlist data is handled according to withdrawal/suppression policy;
- object-storage assets owned exclusively by deleted content are removed where appropriate;
- Stripe recurring billing is canceled or deletion fails safely before orphaning a subscription;
- retained legal/billing/security records contain only what the documented retention exception permits;
- deletion does not silently fail because collection counts exceed query limits;
- retries are idempotent and safe.

Inspect provider-side behavior too. Document what OpenAI, Stripe, Azure, authentication providers, backups, soft-delete and logs may retain and for how long. Do not claim immediate deletion from a provider when that provider's actual retention policy says otherwise.

Create `docs/legal-release/DELETION_EVIDENCE.md` containing the test method and results.

**Release blocker:** a user-facing promise of deletion that the production architecture does not actually perform.

---

# Phase 4 — Storage, authorization and breach-resistance audit

Treat a privacy policy as irrelevant if authorization is broken.

Audit:

- Azure Blob Storage configuration;
- every container and object prefix;
- PostgreSQL network exposure;
- legacy Firestore access rules;
- API object-level authorization;
- evidence-share tokens;
- course-banner delivery;
- generated files/exports;
- support/admin endpoints;
- secrets and credentials;
- logging of personal/sensitive information;
- security headers and CORS;
- request-body limits and rate limits.

### Required attack-style tests

Attempt as an unauthenticated user and as User A to:

- enumerate Azure containers;
- download a private blob directly;
- access another user's private course or learning record by changing an ID;
- access another user's export;
- mutate another user's record;
- enumerate evidence-share tokens;
- retrieve internal support/admin information;
- obtain secrets from client bundles, source maps, error responses or public environment variables.

Intentional public course assets may remain public through controlled application routes. Distinguish **intentionally public output** from **public underlying storage**.

Verify deployed Azure settings, not only Bicep source. If production differs from IaC, production is the source of truth and the mismatch is a blocker.

Create `docs/legal-release/SECURITY_PRIVACY_EVIDENCE.md`.

**Release blocker:** anonymous or cross-account access to non-public user information.

---

# Phase 5 — AI transparency and provider disclosure

Inventory every AI-generated or AI-assisted surface, including:

- course generation;
- lesson generation;
- tutor/chat;
- flashcards;
- assessments or analysis;
- course imagery/banners;
- command-center operational drafts;
- any model-assisted moderation or review.

Verify users receive a clear disclosure when interacting directly with AI or viewing materially AI-generated instructional content where such disclosure is appropriate.

Confirm the Privacy Notice accurately identifies actual model providers and data sent to them. Verify OpenAI request configuration matches the public statement about storage/state, model training defaults and abuse-monitoring retention. If the code cannot prove a provider-retention claim, update the wording to match authoritative provider documentation rather than making an absolute promise.

Machine-readable disclosure may supplement but must not replace necessary human-readable disclosure.

Do not represent AI-generated material as human expert-reviewed unless it actually was.

Add regression tests that fail if a newly introduced direct AI interaction lacks the required disclosure component/metadata.

---

# Phase 6 — Self-harm / crisis safety

Review current `src/lib/content-safety.ts` behavior carefully.

Blocking requests for suicide methods is necessary but not equivalent to responding safely when a user expresses distress, suicidal ideation, or imminent intent.

Determine, using the current California statute and actual FiloSage product behavior, whether any FiloSage conversational feature could qualify as a covered companion-chatbot experience. Record this as a legal applicability finding with source and date.

Regardless of final classification, implement a conservative crisis-safety control for conversational AI:

- distinguish educational discussion of self-harm from personal distress/intent and from requests for harmful instructions;
- never provide instructions that facilitate self-harm;
- when credible personal suicidal/self-harm intent is detected, interrupt the normal tutoring flow with an appropriate crisis-support response;
- for U.S. users, include current crisis-resource information only after verifying the authoritative source at implementation time;
- for non-U.S. users, do not invent local numbers; provide appropriate emergency/local-resource guidance or a maintained country-aware resource mechanism;
- avoid anthropomorphic or dependency-inducing language;
- do not shame or punish users for disclosing distress;
- minimize raw sensitive-text retention in safety telemetry;
- log only the minimum necessary safety event metadata consistent with the published Privacy Notice;
- test false positives using legitimate educational topics such as psychology, public health, literature and history.

Add tests for:

1. request for suicide instructions → safe refusal;
2. credible personal suicidal intent → crisis-support response;
3. academic discussion of suicide → educational answer permitted within policy;
4. adversarial phrasing → still detected;
5. privacy → raw crisis text is not unnecessarily persisted.

If counsel/owner determines California SB 243 applies, implement every applicable statutory operational requirement before launch and document it.

---

# Phase 7 — Subscription, automatic renewal, trial and refund compliance

Audit the complete purchase lifecycle from pricing page through Stripe checkout, renewal, cancellation, refund and account deletion.

Use current FTC/ROSCA requirements and applicable state automatic-renewal laws. Do not rely on an outdated assumption that the FTC's former nationwide Click-to-Cancel rule is the only governing rule; verify current law at run time.

### Before purchase

Verify the user sees, before providing billing information:

- exact price;
- billing cadence;
- whether the subscription automatically renews;
- renewal amount or how it will be determined;
- material plan limitations;
- refund policy;
- cancellation method;
- free/discount-trial conversion terms if trials exist.

Obtain affirmative, auditable consent to recurring billing. Do not use prechecked boxes or misleading button labels.

### Cancellation

Perform an actual sandbox subscription test:

1. create a paid test subscription;
2. navigate from the signed-in product to billing management;
3. cancel the subscription online;
4. confirm Stripe status;
5. confirm FiloSage status after webhook processing;
6. confirm no future recurring charge remains scheduled contrary to the user's selection;
7. verify the user gets understandable cancellation confirmation;
8. verify reactivation is optional and not forced into the cancellation flow.

Cancellation must be simple and discoverable. Do not require a user to contact support merely to stop an online subscription unless a genuine exceptional reconciliation problem exists.

### Trials and renewal notices

If no trial exists, explicitly document **NOT APPLICABLE** rather than implementing unnecessary trial messaging.

If a free or discounted trial automatically converts to paid service, identify and implement all applicable pre-conversion and renewal notices for launch jurisdictions.

If annual plans automatically renew, verify applicable renewal-notice requirements.

### Refunds

Confirm product copy, Terms, Stripe configuration and support procedures all describe the same refund policy. Never advertise a refund right that operations cannot honor.

Create `docs/legal-release/BILLING_COMPLIANCE_EVIDENCE.md` with screenshots/test output and Stripe sandbox identifiers redacted as appropriate.

**Release blocker:** recurring billing can be started online but cannot be reliably stopped online, material terms are hidden, consent is not provable, or cancellation does not synchronize correctly.

---

# Phase 8 — Testimonials, reviews, endorsements and marketing claims

Search all public-facing pages, seeded content, marketing components, screenshots, docs and social assets for:

- testimonials;
- reviews;
- star ratings;
- user counts;
- completion/success claims;
- claims of expert review;
- performance/comparison claims;
- press logos;
- customer/company logos;
- AI-generated people presented as customers;
- statements such as "best," "proven," "guaranteed," or quantified outcome claims.

Create `docs/legal-release/MARKETING_CLAIMS_REGISTER.md` containing each material claim, source, substantiation and owner.

Requirements:

- no fabricated testimonials;
- no AI-generated testimonial presented as a real person's experience;
- no employee/insider testimonial without required material-connection disclosure;
- no incentive conditioned on positive sentiment;
- do not suppress truthful negative reviews based on sentiment while representing displayed reviews as representative;
- retain provenance/permission for testimonials used in advertising;
- quantified educational or product-performance claims require evidence.

Use the current FTC Consumer Reviews and Testimonials Rule and FTC Endorsement Guides as authoritative baselines.

**Release blocker:** a testimonial or material advertising claim cannot be substantiated.

---

# Phase 9 — Children and age handling

Because FiloSage is an education product, do not treat children's privacy as a footnote.

Verify:

- service is genuinely configured and marketed as general audience if that is the chosen policy;
- under-13 accounts are prohibited unless a compliant COPPA pathway is deliberately implemented;
- age eligibility is communicated before unnecessary persistent personal-information collection;
- the system does not knowingly continue collecting personal information after learning that an account belongs to a child under 13;
- there is a documented under-13 deletion/escalation procedure;
- paid purchaser minimum age matches checkout enforcement, not only Terms text;
- marketing does not contradict the stated age audience.

Review the current COPPA Rule and 2026 FTC guidance, including age-verification developments.

If the product is intentionally directed to children under 13 or knowingly serves such users, stop and create an **OWNER/COUNSEL DECISION REQUIRED — COPPA IMPLEMENTATION** blocker rather than attempting a superficial checkbox solution.

---

# Phase 10 — User-generated content, copyright and DMCA

Because users can create/publish course material, assess whether FiloSage relies on DMCA Section 512 safe-harbor protections.

Verify:

- copyright policy/takedown page is public and accurate;
- notice-and-takedown intake exists;
- counter-notice process exists where applicable;
- repeat-infringer policy exists and is reasonably implemented where required;
- designated-agent contact information shown on FiloSage matches the information registered with the U.S. Copyright Office;
- the designation is current and has not expired due to failure to renew/resubmit as required;
- agent registration includes appropriate legal/alternate names such as FiloSage and the site/domain where required.

The agent cannot infer Copyright Office registration from repository code. If registration cannot be verified, create an explicit manual launch blocker with exact owner steps.

Do not automatically remove disputed user material permanently without preserving the operational evidence needed for the applicable process.

Create `docs/legal-release/DMCA_READINESS.md`.

---

# Phase 11 — Commercial email and notifications

Inventory waitlist, product-update, lifecycle, billing and marketing email flows.

Verify commercial email behavior against current CAN-SPAM requirements and applicable state law:

- accurate sender/header information;
- non-deceptive subject lines;
- clear identification where legally required;
- valid business postal address where required;
- functional unsubscribe for marketing messages;
- opt-out honored within required period;
- transactional/service messages are not used as disguised marketing;
- suppression records prevent accidental re-subscription without new consent.

Do not add unsubscribe links to security or legally necessary transactional messages when doing so would be inappropriate; classify email types correctly.

---

# Phase 12 — Accessibility legal-risk hardening

Run automated and manual accessibility checks across:

- landing page;
- signup/legal acceptance;
- pricing/checkout entry;
- account/profile;
- course creation;
- lesson experience;
- billing management entry;
- privacy center;
- support center;
- Terms/Privacy/Copyright pages.

At minimum test:

- keyboard-only operation;
- visible focus;
- accessible names/labels;
- modal/drawer focus management;
- headings and landmarks;
- form errors;
- color contrast;
- zoom/reflow;
- reduced motion;
- screen-reader semantics;
- alternative text for meaningful imagery;
- accessible authentication, cancellation and privacy-right flows.

Use WCAG 2.1 AA as the engineering baseline unless a newer internally approved baseline exists. Record that DOJ Title III does not prescribe a single private-business technical standard in the same way as the Title II government rule, but inaccessible public-facing services can still create ADA exposure.

No accessibility overlay may be treated as a substitute for fixing the product.

---

# Phase 13 — Terms, consent and operator identity

Review:

- Terms;
- Privacy Notice;
- Acceptable Use Policy;
- Copyright policy;
- checkout terms;
- legal acceptance records;
- age/purchaser eligibility;
- refund policy;
- support/legal contact information;
- operator name/address/jurisdiction configuration.

Verify users are presented the correct current document versions and that material acceptance is stored with:

- user/account identifier;
- document version/effective date;
- timestamp;
- relevant eligibility/consent attestations;
- billing authorization where applicable.

Do not silently replace legally material terms without versioning/reacceptance analysis.

If production still displays **Paid-launch disclosure pending** or lacks the real legal operator/business address required by the selected launch setup, commercial billing must remain disabled.

Any unresolved arbitration, governing-law, liability-cap, warranty, entity-name or tax-language decision must be listed for owner/counsel rather than invented by the agent.

---

# Phase 14 — Sales tax / market-scope release decision

Do not attempt to give a legal tax opinion.

Determine whether paid plans are restricted to an approved launch market and whether Stripe/tax configuration is consistent with that market.

Create an owner checklist covering:

- legal selling entity;
- states/countries where sales will be accepted;
- sales-tax/VAT nexus review;
- whether Stripe Tax or another tax system is required;
- business registration/DBA requirements that cannot be verified from code.

If this information is unknown, label it as an owner/accountant/counsel launch decision.

---

# Phase 15 — Data breach and incident readiness

Verify there is a usable incident-response procedure covering:

- suspected credential leak;
- accidental public storage exposure;
- database/API authorization bypass;
- unauthorized account access;
- processor breach notification;
- evidence preservation;
- containment;
- owner escalation;
- user/regulator notification analysis;
- secret rotation;
- post-incident corrective action.

Do not hard-code a universal breach-notification deadline; deadlines depend on jurisdiction and circumstances. Maintain a jurisdiction-aware escalation checklist.

Ensure operational logs provide enough evidence to investigate an incident without unnecessarily logging full private learning content, passwords, tokens, card data or raw crisis disclosures.

---

# Phase 16 — Add a release compliance test suite

Create a dedicated automated suite, for example:

`tests/release-legal-exposure.spec.ts`

plus focused test files where separation is cleaner.

The suite must include regression coverage for at least:

1. public legal pages available;
2. versioned legal acceptance;
3. analytics off before consent;
4. analytics stops after withdrawal;
5. account export ownership isolation;
6. account deletion end-to-end inventory;
7. retained-record disclosure;
8. no browser Firestore access;
9. no anonymous private Azure blob access;
10. no cross-account object/API access;
11. AI interaction disclosure;
12. AI provider claims matching runtime configuration;
13. self-harm instructions refusal;
14. suicidal-intent crisis response;
15. ordinary academic discussion not falsely blocked;
16. subscription material-term disclosure;
17. recurring-billing consent record;
18. online billing portal availability for paid users;
19. successful cancellation synchronization;
20. account deletion cannot orphan an active subscription;
21. no unsubstantiated seeded testimonials;
22. under-13 registration protection;
23. paid purchaser age enforcement;
24. privacy/support/legal contact routes;
25. accessibility smoke checks on legal, pricing, privacy and cancellation surfaces.

Tests must fail closed when a safety/privacy/security prerequisite is unavailable.

---

# Phase 17 — Create the legal-release evidence package

Create this directory:

`docs/legal-release/`

Required artifacts:

- `LEGAL_EXPOSURE_MATRIX.md`
- `DATA_FLOW_INVENTORY.md`
- `VENDOR_PROCESSOR_INVENTORY.md`
- `DELETION_EVIDENCE.md`
- `SECURITY_PRIVACY_EVIDENCE.md`
- `BILLING_COMPLIANCE_EVIDENCE.md`
- `MARKETING_CLAIMS_REGISTER.md`
- `DMCA_READINESS.md`
- `ACCESSIBILITY_EVIDENCE.md`
- `OWNER_COUNSEL_BLOCKERS.md`
- `FINAL_RELEASE_LEGAL_READINESS.md`

For each exposure in `LEGAL_EXPOSURE_MATRIX.md`, use:

| Exposure | Applicable? | Current control | Test/evidence | Residual risk | Owner | Release blocking? |
|---|---|---|---|---|---|---|

At minimum include:

- missing/inaccurate Privacy Notice;
- undisclosed collection;
- undisclosed providers;
- AI transparency;
- account/data deletion;
- public buckets/storage;
- authorization/IDOR;
- fake testimonials/reviews;
- recurring subscriptions/cancellation;
- trial/renewal notices;
- refunds;
- self-harm/crisis handling;
- children/COPPA;
- DMCA/copyright;
- marketing email/CAN-SPAM;
- accessibility;
- security incident readiness;
- international-market exposure;
- tax/operator/business-registration manual decisions.

Do not populate penalty amounts unless verified from an authoritative current source and directly applicable. Prefer describing the exposure and enforcement mechanism.

---

# Mandatory release gates

Return **DO NOT SHIP** if any of the following is true:

- production storage exposes private user data anonymously;
- cross-account authorization is bypassable;
- privacy disclosures materially contradict actual collection or sharing;
- deletion is promised but materially incomplete without disclosure;
- active subscriptions can survive account deletion unintentionally;
- paid users cannot reliably cancel recurring billing;
- checkout lacks clear material recurring-payment terms or provable consent;
- commercial launch lacks required legal operator/contact information;
- a fabricated/unsubstantiated testimonial or material marketing claim is published;
- under-13 data is knowingly collected without the required compliant pathway;
- a required DMCA designated-agent step remains unresolved while relying on the relevant safe harbor;
- a conversational AI safety path provides self-harm instructions or lacks the required crisis flow after applicability analysis;
- critical accessibility barriers prevent users from signing up, paying, canceling, exercising privacy rights or obtaining support;
- high-severity secrets/security exposure remains open;
- an **OWNER/COUNSEL DECISION REQUIRED** item affects whether commercial operation is lawful in the chosen launch market.

---

# Definition of done

This task is complete only when all of the following are true:

1. The actual data-flow inventory is complete.
2. Public policies match implementation.
3. Optional analytics behavior is consent-controlled and tested.
4. Account export and deletion are tested end to end.
5. Production storage/private APIs resist anonymous and cross-user access.
6. AI use and provider handling are accurately disclosed.
7. Self-harm instruction blocking and crisis-response behavior are tested.
8. Subscription signup, consent, cancellation and refund behavior are tested through Stripe sandbox.
9. Trial/renewal requirements are either implemented or documented as not applicable.
10. Testimonials/marketing claims have substantiation or are removed.
11. Children/age handling is tested.
12. DMCA readiness is verified or explicitly blocked pending owner action.
13. Email compliance controls are verified.
14. Critical user flows meet the accessibility baseline.
15. No high/critical security findings remain.
16. Every unresolved non-engineering issue is listed in `OWNER_COUNSEL_BLOCKERS.md` with an exact action needed.
17. `FINAL_RELEASE_LEGAL_READINESS.md` concludes with **SHIP** or **DO NOT SHIP**, with evidence supporting the decision.

---

# Final agent response format

When finished, respond with:

## Release decision
**SHIP** or **DO NOT SHIP**

## Critical findings
Only unresolved high/critical issues.

## Fixed during this task
Concrete code/configuration/policy/test changes.

## Manual owner/counsel actions
Exact tasks that cannot be completed from the repository.

## Verification performed
Commands/tests/deployed checks and their results.

## Evidence files
Paths to every artifact under `docs/legal-release/`.

## Residual risk
Short description of risks that cannot be eliminated through engineering alone.

Do not declare the application legally compliant. State that the release candidate has passed or failed the defined **engineering legal-exposure readiness gates**.