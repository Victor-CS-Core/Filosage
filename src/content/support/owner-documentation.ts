import "server-only";
import type { OwnerDocumentation } from "@/content/support/owner-documentation-types";

export const ownerDocumentation: OwnerDocumentation = {
  title: "Filosage owner handbook",
  introduction: "A practical operating guide to the live product: who can access each surface, how learning and authoring work, where evidence is stored, and which safeguards must remain in place.",
  version: "2026.08",
  reviewedOn: "2026-08-16",
  sections: [
    {
      id: "product-and-access",
      title: "Product and access model",
      summary: "Understand what Filosage promises and how guest, Free, Plus, Pro, and owner permissions differ.",
      topics: [
        {
          title: "Product contract",
          body: "Filosage turns a professional outcome into a focused learning path through the Capability Cycle: define one observable win, activate prerequisites, practice with only the explanation required, receive feedback after commitment, transfer the capability, and return through readiness-aware retrieval. Public visitors can inspect published course structure; lesson bodies and saved learning activity require a verified account.",
          links: [{ label: "Read the teaching standard", href: "/standard" }],
        },
        {
          title: "Access levels",
          body: "Guests discover published topics. Verified Free accounts can open published lessons and save learning. Plus adds two complete private AI course credits monthly, with rollover up to twenty-four. Pro adds five monthly with rollover up to sixty, advanced capstone analysis, professional evidence exports and share links, and publishing after sequential completion, attestation, and review. Paid accounts can keep every course they create. The verified owner retains platform-wide moderation, operational, and Command Center privileges. Server routes repeat these checks; hiding a button is never the authorization boundary.",
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
          body: "Lessons preserve semantic content such as headings, lists, and tables. Study tools support explanation and guided practice after a committed review attempt. Review orders due capabilities by prerequisite readiness and evidence need, while Progress separates completion from stronger assessed or demonstrated evidence.",
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
      sources: ["src/app/library/", "src/app/course/[topic]/", "src/app/review/page.tsx", "src/app/progress/page.tsx", "src/app/evidence/"],
    },
    {
      id: "course-authoring",
      title: "Course authoring and publishing",
      summary: "Create private learning paths, review generated work, and publish only after the quality gates pass.",
      topics: [
        {
          title: "Create a private course",
          body: "The author supplies a real outcome, proof of skill, time horizon, prior knowledge, and learning preferences. One course credit covers the approved outline and every lesson that learning design places in it, so course length follows the goal rather than a lesson quota. Source research is retained when it can be verified; scarcity falls back to disclosed model knowledge instead of blocking the private course. Lesson generation remains staged, and the course stays private until explicitly published.",
          links: [{ label: "Create a course", href: "/create" }],
        },
        {
          title: "Publication readiness",
          body: "Publishing requires structural completeness, teaching quality, language integrity, rights and source checks, and any required lesson regeneration. Review applies to the exact course snapshot; later content or source changes invalidate snapshot-bound approval. A rejected item stays private. Owner overrides are consequential and require recent authentication and a recorded reason.",
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
      sources: ["src/app/create/page.tsx", "src/lib/publication-readiness.ts", "src/lib/course-quality.ts", "src/app/api/courses/", "src/app/api/admin/courses/[courseId]/publication-override/"],
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
          body: "Signed-in learners can submit private support, billing, privacy, product-feedback, or general requests from the Support wiki. Each request receives a ticket number, is rate-limited, and enters the owner queue as unverified context. Content reports create linked tickets with immutable record references. The owner can also create a normalized manual ticket.",
          links: [
            { label: "Support wiki", href: "/support" },
            { label: "Agent Command Center", href: "/admin/command-center" },
          ],
        },
        {
          title: "Available draft agents",
          body: "Support, Legal intake, Billing explanation, Product operations, and Founder brief agents can create review-only drafts. Privacy, Content action, and Knowledge maintenance remain planned and unavailable. A visible environment flag and an owner control must both be enabled before an available agent can run.",
          steps: [
            "Triage the ticket and verify the facts before generating a draft.",
            "Review evidence references, missing information, confidence, and cautions.",
            "Accept or reject the draft as an audit decision; acceptance does not send or execute it.",
          ],
        },
        {
          title: "Safety boundary",
          body: "Draft-agent simulation is locked on. Agents cannot auto-send, refund, restrict accounts, delete data, remove content, change policy, or publish status updates. A verified owner may separately publish a support reply from a learner ticket; that deliberate action is immediately visible to the requester and recorded in the audit log. The global kill switch blocks future agent execution while keeping evidence available for review.",
        },
      ],
      sources: ["src/app/support/page.tsx", "src/app/api/support/tickets/route.ts", "src/app/admin/command-center/page.tsx", "src/lib/command-center-server.ts", "src/lib/command-center-policy.ts"],
    },
    {
      id: "trust-and-privacy",
      title: "Trust, privacy, and content safety",
      summary: "Handle reports and data requests without overreaching or exposing another person's information.",
      topics: [
        {
          title: "Privacy controls",
          body: "Signed-in users can review consent, export account-linked data, and request deletion from the Privacy Center. Recent authentication protects destructive requests. The owner account cannot be automatically deleted because it controls published courses and requires a documented transfer or shutdown path.",
          links: [{ label: "Privacy Center", href: "/privacy-center" }],
        },
        {
          title: "Content reports",
          body: "Reports preserve the target and reporter record. Learner reports create an urgent review signal but cannot automatically unpublish content. Only the owner can immediately quarantine a serious safety or rights concern; final removal remains a reviewed action.",
          steps: [
            "Open the linked course, lesson, or source without altering the evidence.",
            "Separate the reporter's claim from confirmed application facts.",
            "Resolve or dismiss the source report so its Command Center ticket stays synchronized.",
          ],
        },
      ],
      sources: ["src/app/privacy-center/page.tsx", "src/app/api/account/data/route.ts", "src/app/api/content-reports/route.ts", "src/lib/content-report-policy.ts"],
    },
    {
      id: "billing",
      title: "Plans and billing lock",
      summary: "Keep commerce explicitly separate from product and AI readiness.",
      topics: [
        {
          title: "Current state",
          body: "Billing is a separately controlled capability. With the billing lock disabled, pricing can explain future terms and collect non-binding interest, but checkout cannot create a subscription and users cannot be charged. Enabling AI drafts does not change billing state.",
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
            "Review high-risk and overdue Command Center tickets.",
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
          body: "A source build does not prove production health. For an exact release, verify the intended commit, the hosted version marker, the production health endpoint, datastore connectivity, billing state, and visible behavior on the deployed URL. Keep unrelated local changes out of the release.",
          steps: [
            "Run lint, TypeScript, focused tests, and the full production build.",
            "Publish the exact validated source revision.",
            "Confirm the hosted version and production health endpoint.",
            "Perform visible acceptance on the changed owner and learner flows.",
          ],
        },
        {
          title: "Incident response",
          body: "If a release is unhealthy, stop new consequential work, preserve evidence, activate the relevant kill switch, and restore the last known-good version. Never diagnose from a single dashboard number when the live route and datastore can be checked directly.",
        },
      ],
      sources: ["docs/PRODUCTION_OPERATIONS.md", "docs/AZURE_MIGRATION_RUNBOOK.md", "docs/agent-command-center/incident-response.md", "src/app/api/health/route.ts", "scripts/check-production-health.mjs", ".github/workflows/azure-staging.yml", ".github/workflows/azure-promote-staging.yml"],
    },
  ],
};
