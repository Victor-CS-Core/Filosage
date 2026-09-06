import "server-only";
import type { OwnerDocumentation } from "@/content/support/owner-documentation-types";

export const ownerDocumentation: OwnerDocumentation = {
  title: "Filosage owner handbook",
  introduction: "A source-reviewed operating guide for the September release candidate. Feature availability follows the deployed capability manifest; implementation and local checks do not establish hosted acceptance or authorization to enable billing.",
  version: "2026.09",
  reviewedOn: "2026-09-06",
  sections: [
    {
      id: "product-and-access",
      title: "Product and access model",
      summary: "Understand what Filosage promises and how guest, Free, Plus, Pro, and owner permissions differ.",
      topics: [
        {
          title: "Product contract",
          body: "Filosage turns a study, personal, career, or work goal into a focused learning path through the Capability Cycle: define one observable win, activate prerequisites, practice with only the explanation required, receive feedback after commitment, transfer the capability, and return through readiness-aware retrieval. The service is for individual learners aged 13 and older. Public visitors can inspect published course structure; lesson bodies and saved learning activity require a verified account, accepted current legal terms and age eligibility.",
          links: [{ label: "Read the teaching standard", href: "/standard" }],
        },
        {
          title: "Access levels",
          body: "Guests discover published topics. Verified Free accounts can open published lessons and save learning. Plus adds two complete private AI course credits monthly, with rollover up to twenty-four. Pro adds five monthly with rollover up to sixty, advanced capstone analysis, portable evidence exports and share links, and publishing after sequential completion, attestation, and review. Paid accounts can keep every course they create. The verified owner retains platform-wide moderation, operational, and Command Center privileges. Server routes repeat these checks; hiding a button is never the authorization boundary.",
          steps: [
            "Use the public library to verify what anonymous visitors can inspect.",
            "Use the profile to confirm a learner's current plan and account state.",
            "Use the Control room only for owner-authorized operational work.",
          ],
        },
      ],
      sources: ["PRODUCT.md", "src/components/AuthProvider.tsx", "src/lib/auth-server.ts", "src/components/AppShell.tsx"],
    },
    {
      id: "learner-flow",
      title: "Learner flow",
      summary: "Follow the complete path from discovery through durable evidence of learning.",
      topics: [
        {
          title: "Discover and begin",
          body: "The library exposes published outcomes, modules, lesson titles, and assessment structure before sign-in. A learner signs in when opening lesson content or saving progress, then follows the course sequence rather than jumping through unprepared material.",
          links: [{ label: "Open the learning library", href: "/library" }],
        },
        {
          title: "Study, practice, and review",
          body: "Lessons preserve semantic content such as headings, lists, and tables. Study tools support explanation and guided practice after a committed review attempt. Review orders due capabilities by prerequisite readiness and evidence need, while Progress separates completion from stronger assessed or demonstrated evidence. Notes, goals, baseline answers, capstone drafts and review state belong to the verified account and its current generation. Changing accounts or generations invalidates pending browser work; legacy guest storage is not adopted by a signed-in learner. A failed queue or evidence load must remain visibly unavailable rather than appear as an empty or zero result.",
          steps: [
            "Inspect the course structure before diagnosing a lesson-access report.",
            "Use Review to verify the learner's due practice queue.",
            "Use Progress and Evidence to distinguish self-report from observed work.",
          ],
          links: [
            { label: "Review queue", href: "/review" },
            { label: "Progress", href: "/progress" },
            { label: "Evidence report guide", href: "/support/articles/read-evidence-report" },
          ],
        },
      ],
      sources: ["src/app/library/", "src/app/course/[topic]/", "src/app/review/page.tsx", "src/lib/learner-storage.ts", "src/app/progress/page.tsx", "src/app/evidence/"],
    },
    {
      id: "course-authoring",
      title: "Course authoring and publishing",
      summary: "Create private learning paths, review generated work, and publish only after the quality gates pass.",
      topics: [
        {
          title: "Create a private course",
          body: "The author supplies a real outcome, proof of skill, time horizon, prior knowledge, and learning preferences. One course credit covers the approved outline and every lesson that learning design places in it, so course length follows the goal rather than a lesson quota. Source research is retained when it can be verified; scarcity falls back to disclosed model knowledge instead of blocking the private course. Generation saves operation stages and credit reservation durably. Create offers Resume course request or Open course for the same account and generation after a reload. A lost provider outcome is not blindly replayed: recovery may end the request and restore the course credit while retaining explicit uncertain provider cost. The course stays private until explicitly published. Menus remain English; requested single-language or bilingual course content must pass language and teaching checks.",
          links: [{ label: "Create a course", href: "/create" }],
        },
        {
          title: "Publication readiness",
          body: "Use Validate draft before publishing. Publishing requires structural completeness, teaching quality, language integrity, rights and source checks, and any required lesson regeneration. Review applies to the exact course snapshot and proof token; later lesson, moderation, source-pack or expiry changes invalidate approval. A manual source review resolves only the reviewed ambiguity and cannot waive malformed, unsafe or incomplete content. A rejected item stays private. Publication commits an immutable release, so draft edits do not alter released lessons. Owner overrides are consequential and require recent authentication and a recorded reason.",
          steps: [
            "Review the course outcome, module sequence, assessments, and source pack.",
            "Resolve creator-correctable blockers. Use an offered automatic repair only after inspecting its declared scope.",
            "Undo an automatic repair when its recorded result is not acceptable; do not conceal a repair by editing its audit evidence.",
            "Verify each source attestation against the released source and the exact claim before accepting it.",
            "Publish only after the final review confirms learner-safe content and correct visibility.",
          ],
        },
        {
          title: "Before permanent deletion",
          body: "Deleting a course can remove its lessons and linked learner progress, reviews, bookmarks, notes, evidence, feedback, and open reports for all affected learners. Unpublish first when temporary removal is sufficient. Before permanent deletion, preserve authorized records, resolve safety or rights reports, confirm that no required handoff remains, and record why deletion rather than unpublishing is necessary.",
        },
      ],
      sources: ["src/app/create/page.tsx", "src/lib/publication-readiness.ts", "src/lib/publication-proofs.ts", "src/lib/course-quality.ts", "src/app/api/courses/", "src/app/api/admin/courses/[courseId]/publication-override/"],
    },
    {
      id: "ai-quality",
      title: "AI generation and quality controls",
      summary: "Know what the models can draft, which gates protect stored content, and how to investigate failures.",
      topics: [
        {
          title: "Generation boundaries",
          body: "Course, lesson, tutor, and Command Center generation use separate execution profiles and structured validation. User text, uploaded content, reports, and ticket descriptions are untrusted. Generated content is rejected when it contains unsafe instructions, malformed language, unverifiable control fragments, or weak teaching structure.",
        },
        {
          title: "Operational review",
          body: "The Control room shows generation volume and failures without exposing private prompts or generated bodies. Diagnose from the request type, status, evaluation evidence, and the affected private record. Never copy secrets or unrestricted learner content into an audit entry.",
          links: [{ label: "Open the Control room", href: "/admin" }],
        },
      ],
      sources: ["src/lib/openai-generation.ts", "src/lib/course-quality.ts", "src/lib/lesson-quality.ts", "src/app/admin/page.tsx"],
    },
    {
      id: "support-command-center",
      title: "Support and Agent Command Center",
      summary: "Turn learner requests and content reports into bounded owner work without automating consequential actions.",
      topics: [
        {
          title: "Ticket intake",
          body: "The selected release keeps Command Center off. The public no-store support capability checks the server environment and normalized owner intake control before the browser offers composition. Off or unknown status offers published email and Help immediately; My requests still reads existing private tickets and published replies. A mailto link proves neither delivery nor a monitored mailbox. Support coverage is a separate operational acceptance item. When intake is explicitly enabled, verified learners can submit support, billing, privacy, product-feedback or general requests. A durable retry key produces one ticket for an unchanged submission; failed text stays in the current tab and clears on account change. Content-report receipt does not prove linked ticket creation while Command Center is off.",
          links: [
            { label: "Support wiki", href: "/support" },
            { label: "Agent Command Center", href: "/admin/command-center" },
          ],
        },
        {
          title: "Available draft agents",
          body: "Support, Legal intake, Billing explanation, Product operations, and Founder brief agents can create review-only drafts. Privacy, Content action, and Knowledge maintenance remain planned and unavailable. A visible environment flag and an owner control must both be enabled before an available agent can run.",
          steps: [
            "When Command Center is enabled, triage the ticket and verify the facts before generating a draft; select only the owner context needed for that ticket.",
            "Review evidence references, missing information, confidence, and cautions.",
            "Accept or reject the draft as an audit decision; acceptance does not send or execute it.",
          ],
        },
        {
          title: "Safety boundary",
          body: "Draft-agent simulation is locked on. Agents cannot auto-send, refund, restrict accounts, delete data, remove content, change policy, or publish status updates. A verified owner may separately publish a support reply from a learner ticket; that deliberate action is immediately visible to the requester and recorded in the audit log. The global kill switch blocks future agent execution while keeping evidence available for review.",
        },
      ],
      sources: ["src/app/support/page.tsx", "src/app/api/support/tickets/route.ts", "src/app/api/support/capabilities/route.ts", "src/lib/support-availability.ts", "src/app/admin/command-center/page.tsx", "src/lib/command-center-server.ts", "src/lib/command-center-policy.ts"],
    },
    {
      id: "trust-and-privacy",
      title: "Trust, privacy, and content safety",
      summary: "Handle reports and data requests without overreaching or exposing another person's information.",
      topics: [
        {
          title: "Privacy controls",
          body: "Signed-in users can review consent, export account-linked data, and request deletion from the Privacy Center. Recent authentication protects destructive requests. A durable deletion job immediately closes the account generation to new writes and resumes inventory, billing containment, owned documents and exclusive assets. Unknown cancellation or upload results remain pending. Another learner's evidence and shares remain theirs; public sharing can become unavailable when the source course is removed. Active-data removal is not complete erasure: identity mappings, billing consent, safety and support records remain under explicit review. No exact retention duration or legal hold is approved by this implementation. Retain the job reference and verify external identity, object storage and retention outcomes before closing that review. The owner account cannot be automatically deleted because it controls published courses and requires a documented transfer or shutdown path.",
          links: [{ label: "Privacy Center", href: "/privacy-center" }],
        },
        {
          title: "Content reports",
          body: "Reports preserve the target and reporter record. Learner reports create an urgent review signal but cannot automatically unpublish content. Only the owner can immediately quarantine a serious safety or rights concern; final removal remains a reviewed action.",
          steps: [
            "Open the linked course, lesson, or source without altering the evidence.",
            "Separate the reporter's claim from confirmed application facts.",
            "Resolve or dismiss the source report using its own status; inspect any linked Command Center ticket separately, because disabled intake or failed reconciliation can leave a ticket unavailable.",
          ],
        },
      ],
      sources: ["src/app/privacy-center/page.tsx", "src/app/api/account/data/route.ts", "src/lib/account-deletion.ts", "src/lib/account-lifecycle.ts", "src/app/api/content-reports/route.ts", "src/lib/content-report-policy.ts"],
    },
    {
      id: "billing",
      title: "Plans and billing lock",
      summary: "Keep commerce explicitly separate from product and AI readiness.",
      topics: [
        {
          title: "Current state",
          body: "Billing is a separately controlled capability. New paid checkout remains locked pending a separately approved launch. Pricing can explain terms and collect non-binding interest; that interest is not a purchase. Existing subscriptions still require verified provider reconciliation, cancellation containment and customer-management recovery independently of new acquisition. Enabling AI drafts does not change billing state. Stripe API readiness is independent of Portal readiness, so a missing Portal configuration must not block verified deletion cancellation. Portal return URLs and payment redirect parameters do not grant access or course credits. Approved immediate Plus/Pro monthly or annual transitions use Stripe proration with an unchanged billing anchor; entitlement and credit changes follow confirmed provider state through an idempotent transition ledger.",
          links: [{ label: "Plans and billing", href: "/pricing" }],
        },
        {
          title: "Before enabling commerce",
          body: "Confirm exact prices and currencies, Stripe lifecycle handling, cancellation and refund terms, webhook verification, support coverage, monitoring, legal acceptance, and production checkout acceptance. Billing should remain off until that release is separately authorized.",
        },
      ],
      sources: ["src/lib/billing-lock.ts", "src/app/pricing/page.tsx", "docs/BILLING_SETUP.md", "docs/COMMERCIAL_LAUNCH_RUNBOOK.md"],
    },
    {
      id: "owner-operations",
      title: "Owner operations",
      summary: "Use the owner surfaces deliberately and keep high-impact changes traceable.",
      topics: [
        {
          title: "Control room",
          body: "The Control room summarizes accounts, generation, publication, learning evidence, launch readiness, reports, and owner actions. A partial-data indicator means the summary is incomplete and must not be treated as a complete count. Use the underlying record before acting. Account-status and report-resolution mutations require the allowed transition, a recorded reason, server authorization, and an audit result; the visible control is not the authorization boundary.",
          links: [{ label: "Open the Control room", href: "/admin" }],
        },
        {
          title: "Routine review",
          steps: [
            "Check production health and recent failed generation requests.",
            "When Command Center is enabled, review high-risk and overdue tickets; otherwise verify the actual support channel and its operational owner without assuming the published mailbox is monitored.",
            "Review content reports and any pending approvals.",
            "Inspect publication failures and private drafts without exposing learner content.",
            "Confirm the billing lock before and after every release.",
          ],
          body: "A calm daily review is more useful than broad automation. Escalate uncertain legal, privacy, billing, or content decisions instead of turning draft confidence into authority.",
        },
      ],
      sources: ["src/app/admin/page.tsx", "src/app/admin/command-center/page.tsx", "src/app/api/admin/overview/route.ts", "src/app/api/admin/users/[uid]/route.ts", "src/lib/admin-types.ts", "src/lib/command-center-server.ts"],
    },
    {
      id: "release-and-recovery",
      title: "Release, health, and recovery",
      summary: "Distinguish a validated build, a Git publication, and a live Azure deployment.",
      topics: [
        {
          title: "Release acceptance",
          body: "One Azure Container App runs the Next.js frontend and same-origin backend routes in one immutable image. Blue and green are revisions of that app; there is no separate QA website. A source build does not prove production health. Bind the exact commit, image digest, capability manifest, canonical origin and auth mode to inactive-revision evidence. A zero-traffic revision URL is not private and uses shared durable services. Hosted mutations require approved test identities and data; a source commit does not authorize traffic changes. An alert webhook HTTP success proves transport only, not independent monitored acknowledgment, escalation or recovery. Existing-customer webhook and billing monitoring remain required even with checkout closed.",
          steps: [
            "Run lint, TypeScript, focused tests, and the full production build.",
            "Build the selected SHA once and verify the inactive revision digest at zero public traffic while the current revision remains at 100%.",
            "Confirm the hosted version, datastore and Blob readiness, actual traffic bindings and billing lock; collect evidence against that exact revision.",
            "Complete changed learner and owner flows before a separately approved 100% traffic swap. Recheck evidence and digest without rebuilding, then verify the canonical URL.",
          ],
        },
        {
          title: "Incident response",
          body: "If a release is unhealthy, stop new consequential work, preserve evidence, activate the relevant kill switch, and restore the last known-good version. Both revisions share services. Rollback requires compatible write protocols: retire old binaries and already-loaded legacy clients before accepting generation fences as hosted-proven. An old revision that can bypass account, publication or usage checks is not a safe rollback target. Preserve backups and evidence under the approved recovery procedure; a traffic swap cannot undo shared datastore writes.",
        },
      ],
      sources: ["docs/PRODUCTION_OPERATIONS.md", "docs/AZURE_MIGRATION_RUNBOOK.md", "docs/agent-command-center/incident-response.md", "src/app/api/health/route.ts", "scripts/check-production-health.mjs"],
    },
  ],
};
