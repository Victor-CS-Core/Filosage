export interface IdentifiedAccountDocument {
  id: string;
}

export interface AccountDeletionInventory {
  courseProgress: IdentifiedAccountDocument[];
  learningOutcomes: IdentifiedAccountDocument[];
  masteryEvidence: IdentifiedAccountDocument[];
  flashcardDecks: IdentifiedAccountDocument[];
  flashcards: IdentifiedAccountDocument[];
  flashcardReviewState: IdentifiedAccountDocument[];
  evidenceShareRefs: IdentifiedAccountDocument[];
  evidenceShares: IdentifiedAccountDocument[];
  courseCreditClaims: IdentifiedAccountDocument[];
  lessonNotes: IdentifiedAccountDocument[];
  lessonActivityRecords: IdentifiedAccountDocument[];
  lessonInteractionRecords: IdentifiedAccountDocument[];
  lessonInteractionMutationRecords: IdentifiedAccountDocument[];
  aiUsagePeriods: IdentifiedAccountDocument[];
  aiRequestRecords: IdentifiedAccountDocument[];
  aiBudgetRecords: IdentifiedAccountDocument[];
  accountLinkedProductEvents: IdentifiedAccountDocument[];
  referralCodes: IdentifiedAccountDocument[];
  courseResearchArtifacts: IdentifiedAccountDocument[];
}

export const ACCOUNT_DELETION_POLICY_REVIEW = {
  status: "owner_privacy_review_pending",
  approvedRetentionDurations: null,
  approvedHolds: null,
  contact: "legal@filosage.com",
  completionClaimPermitted: false,
} as const;

export const AUTOMATED_ACCOUNT_DELETION_RETENTION = [
  {
    category: "Deletion control and identity recovery records",
    records: ["Immutable account-generation tombstones", "Resumable deletion jobs and cancellation references", "Identity links and email ownership mappings"],
    reason: "Retained to prevent account resurrection and keep verified identity and privacy recovery possible. Exact retention durations and holds require owner and privacy review; complete erasure is not claimed while that review is pending.",
  },
  {
    category: "Shared assets and operational cost totals",
    records: ["Previously shared course-banner assets with unverified exclusive ownership", "Non-personal aggregate AI cost and usage receipts", "Other learners' work referencing formerly published courses"],
    reason: "Shared assets and other learners' work are preserved under explicit ownership policy. Exclusive assets are removed only after upload completion and reference checks; uncertain ownership remains subject to manual review.",
  },
  {
    category: "Legal acceptance records",
    records: ["Versioned Terms, Privacy Notice, and age-eligibility acceptance records"],
    reason: "Retained only as reasonably needed to document consent, resolve disputes, and meet legal obligations.",
  },
  {
    category: "Safety and enforcement records",
    records: ["Safety cooldown summaries", "Blocked-request safety events", "Content reports", "Owner enforcement actions", "Command-center tickets, review drafts, approvals, and audit events"],
    reason: "Retained only as reasonably needed to prevent abuse, preserve report integrity, enforce the service rules, and resolve legal claims.",
  },
  {
    category: "Billing and transaction records",
    records: [
      "Versioned billing authorization and checkout consent records",
      "Payment-processor customer, subscription, invoice, refund, dispute, and transaction records",
    ],
    reason: "Billing consent is retained only as reasonably needed to document authorization and resolve disputes; the payment processor may retain transaction records for tax, accounting, fraud-prevention, and consumer-protection requirements after cancellation.",
  },
] as const;

function documentPaths(collectionPath: string, records: IdentifiedAccountDocument[]) {
  return records.map((record) => `${collectionPath}/${record.id}`);
}

export function accountDeletionDocumentPaths(
  uid: string,
  inventory: AccountDeletionInventory,
  waitlistPath?: string,
) {
  return Array.from(new Set([
    ...documentPaths(`users/${uid}/courseProgress`, inventory.courseProgress),
    ...documentPaths(`users/${uid}/learningOutcomes`, inventory.learningOutcomes),
    ...documentPaths(`users/${uid}/masteryEvidence`, inventory.masteryEvidence),
    ...documentPaths(`users/${uid}/flashcardDecks`, inventory.flashcardDecks),
    ...documentPaths(`users/${uid}/flashcards`, inventory.flashcards),
    ...documentPaths(`users/${uid}/flashcardReviewState`, inventory.flashcardReviewState),
    ...documentPaths(`users/${uid}/evidenceShareRefs`, inventory.evidenceShareRefs),
    ...documentPaths("evidenceShares", inventory.evidenceShares),
    `users/${uid}/courseCredits/current`,
    ...documentPaths(`users/${uid}/courseCreditClaims`, inventory.courseCreditClaims),
    ...documentPaths(`users/${uid}/lessonNotes`, inventory.lessonNotes),
    ...documentPaths(`users/${uid}/lessonActivity`, inventory.lessonActivityRecords),
    ...documentPaths(`users/${uid}/lessonInteraction`, inventory.lessonInteractionRecords),
    ...documentPaths(`users/${uid}/lessonInteractionMutations`, inventory.lessonInteractionMutationRecords),
    `users/${uid}/learningData/preferences`,
    `users/${uid}/billingCheckout/current`,
    ...documentPaths("usagePeriods", inventory.aiUsagePeriods),
    ...documentPaths("aiRequests", inventory.aiRequestRecords),
    ...documentPaths("userAiBudgets", inventory.aiBudgetRecords),
    ...documentPaths("productEvents", inventory.accountLinkedProductEvents),
    ...documentPaths("referralCodes", inventory.referralCodes),
    ...documentPaths("courseResearchArtifacts", inventory.courseResearchArtifacts),
    `userEngagement/${uid}`,
    `pricingIntents/${uid}`,
    ...(waitlistPath ? [waitlistPath] : []),
    `users/${uid}`,
  ]));
}
