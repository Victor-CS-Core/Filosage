export interface IdentifiedAccountDocument {
  id: string;
}

export interface AccountDeletionInventory {
  courseProgress: IdentifiedAccountDocument[];
  learningOutcomes: IdentifiedAccountDocument[];
  masteryEvidence: IdentifiedAccountDocument[];
  lessonNotes: IdentifiedAccountDocument[];
  lessonActivityRecords: IdentifiedAccountDocument[];
  aiUsagePeriods: IdentifiedAccountDocument[];
  aiRequestRecords: IdentifiedAccountDocument[];
  aiBudgetRecords: IdentifiedAccountDocument[];
  accountLinkedProductEvents: IdentifiedAccountDocument[];
  referralCodes: IdentifiedAccountDocument[];
}

export const AUTOMATED_ACCOUNT_DELETION_RETENTION = [
  {
    category: "Legal acceptance records",
    records: ["Versioned Terms, Privacy Notice, and age-eligibility acceptance records"],
    reason: "Retained only as reasonably needed to document consent, resolve disputes, and meet legal obligations.",
  },
  {
    category: "Safety and enforcement records",
    records: ["Safety cooldown summaries", "Blocked-request safety events", "Content reports", "Owner enforcement actions"],
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
    ...documentPaths(`users/${uid}/lessonNotes`, inventory.lessonNotes),
    ...documentPaths(`users/${uid}/lessonActivity`, inventory.lessonActivityRecords),
    `users/${uid}/learningData/preferences`,
    `users/${uid}/billingCheckout/current`,
    ...documentPaths("usagePeriods", inventory.aiUsagePeriods),
    ...documentPaths("aiRequests", inventory.aiRequestRecords),
    ...documentPaths("userAiBudgets", inventory.aiBudgetRecords),
    ...documentPaths("productEvents", inventory.accountLinkedProductEvents),
    ...documentPaths("referralCodes", inventory.referralCodes),
    `userEngagement/${uid}`,
    `pricingIntents/${uid}`,
    ...(waitlistPath ? [waitlistPath] : []),
    `users/${uid}`,
  ]));
}
