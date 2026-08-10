import "server-only";

import {
  activityDocumentId,
  signActivityReceipt,
  validateActivityReceipt,
  type ActivityReceiptClaims,
} from "@/lib/activity-receipt-crypto";
import { serverEnvironment } from "@/lib/runtime-environment";

export { activityDocumentId };
export type { ActivityReceiptClaims };

function receiptSecret() {
  const configured = serverEnvironment.ACTIVITY_RECEIPT_SECRET?.trim();
  if (configured) {
    if (serverEnvironment.NODE_ENV === "production" && configured.length < 32) {
      throw new Error("ACTIVITY_RECEIPT_SECRET must contain at least 32 characters.");
    }
    return configured;
  }
  if (serverEnvironment.NODE_ENV !== "production") return "filosage-local-activity-receipts";
  throw new Error("ACTIVITY_RECEIPT_SECRET is not configured.");
}

export function issueActivityReceipt(claims: ActivityReceiptClaims) {
  return signActivityReceipt(receiptSecret(), claims);
}

export function verifyActivityReceipt(
  receipt: string,
  expected: Pick<ActivityReceiptClaims, "uid" | "courseId" | "lessonId" | "quizIndex">,
  now = Date.now(),
) {
  return validateActivityReceipt(receiptSecret(), receipt, expected, now);
}
