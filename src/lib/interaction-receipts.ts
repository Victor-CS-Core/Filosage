import "server-only";

import {
  interactionDocumentId,
  signInteractionReceipt,
  validateInteractionReceipt,
  type InteractionReceiptClaims,
} from "@/lib/interaction-receipt-crypto";
import { serverEnvironment } from "@/lib/runtime-environment";

export { interactionDocumentId };
export type { InteractionReceiptClaims };

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

export function issueInteractionReceipt(claims: InteractionReceiptClaims) {
  return signInteractionReceipt(receiptSecret(), claims);
}

export function verifyInteractionReceipt(
  receipt: string,
  expected: Pick<InteractionReceiptClaims, "uid" | "courseId" | "lessonId" | "interactionId" | "itemId">,
  now = Date.now(),
) {
  return validateInteractionReceipt(receiptSecret(), receipt, expected, now);
}
