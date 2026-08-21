import { z } from "zod";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  createStoredDocument,
  runStoredDocumentTransaction,
} from "@/lib/document-store";
import { isPaidLearnerPlan } from "@/lib/membership-plans";

const userActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    reason: z.string().trim().min(3).max(200),
  }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
  z.object({
    action: z.literal("grant_plan"),
    planId: z.enum(["plus", "pro"]),
    duration: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal("permanent")]),
  }).strict(),
  z.object({ action: z.literal("revoke_plan") }).strict(),
  z.object({
    action: z.literal("grant_pro"),
    duration: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal("permanent")]),
  }).strict(),
  z.object({ action: z.literal("revoke_pro") }).strict(),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  try {
    const owner = await requireOwner(request);
    const { uid } = await context.params;
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(uid)) {
      return Response.json({ error: "Invalid account." }, { status: 400 });
    }
    if (uid === owner.uid) {
      return Response.json({ error: "The owner account cannot be modified here." }, { status: 403 });
    }

    const parsed = userActionSchema.safeParse(await readJsonBody(request, 1_024));
    if (!parsed.success) {
      return Response.json({ error: "Choose a valid account action." }, { status: 400 });
    }
    const path = `users/${uid}`;
    const now = new Date();
    let reason: string | undefined;
    if (parsed.data.action === "suspend") {
      reason = parsed.data.reason;
    } else if (parsed.data.action === "grant_plan") {
      reason = `${parsed.data.planId === "plus" ? "Plus" : "Pro"} owner grant (${parsed.data.duration === "permanent" ? "permanent" : `${parsed.data.duration} days`})`;
    } else if (parsed.data.action === "grant_pro") {
      reason = parsed.data.duration === "permanent"
        ? "Permanent owner grant"
        : `${parsed.data.duration}-day owner grant`;
    }
    const outcome = await runStoredDocumentTransaction<{ saved?: Record<string, unknown>; billingManaged?: true } | null>([path], (documents) => {
      const current = documents[path];
      if (!current) return { writes: [], result: null };
      const subscriptionStatus = String(current.subscriptionStatus ?? "none");
      if ((parsed.data.action === "grant_plan" || parsed.data.action === "grant_pro")
        && (subscriptionStatus === "active" || subscriptionStatus === "trialing" || subscriptionStatus === "past_due")) {
        return { writes: [], result: { billingManaged: true } };
      }
      const next: Record<string, unknown> = { ...current, updatedAt: now.toISOString() };
      if (parsed.data.action === "suspend") {
        next.accountStatus = "suspended";
        next.suspensionReason = parsed.data.reason;
        next.suspendedAt = now.toISOString();
      } else if (parsed.data.action === "restore") {
        next.accountStatus = "active";
        next.suspensionReason = null;
        next.suspendedAt = null;
      } else if (parsed.data.action === "grant_plan" || parsed.data.action === "grant_pro") {
        const planId = parsed.data.action === "grant_plan" ? parsed.data.planId : "pro";
        const manualPlanUntil = parsed.data.duration === "permanent"
          ? "permanent"
          : new Date(now.getTime() + parsed.data.duration * 24 * 60 * 60 * 1_000).toISOString();
        next.manualPlan = planId;
        next.manualPlanUntil = manualPlanUntil;
        next.manualProUntil = planId === "pro" ? manualPlanUntil : null;
        next.plan = planId;
      } else {
        next.manualPlan = null;
        next.manualPlanUntil = null;
        next.manualProUntil = null;
        next.plan = subscriptionStatus === "active" || subscriptionStatus === "trialing"
          ? isPaidLearnerPlan(current.billingPlan) ? current.billingPlan : "pro"
          : "free";
      }
      return { writes: [{ path, data: next }], result: { saved: next } };
    });
    if (!outcome) return Response.json({ error: "Account not found." }, { status: 404 });
    if (outcome.billingManaged) {
      return Response.json({ error: "This membership is managed by its Stripe subscription." }, { status: 409 });
    }
    const saved = outcome.saved!;
    await createStoredDocument("adminEvents", {
      actorUid: owner.uid,
      targetUid: uid,
      action: parsed.data.action,
      reason: reason ?? null,
      createdAt: now.toISOString(),
    });

    return Response.json({
      ok: true,
      accountStatus: saved.accountStatus,
      plan: saved.plan,
      manualPlan: saved.manualPlan,
      manualPlanUntil: saved.manualPlanUntil,
      manualProUntil: saved.manualProUntil,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    console.error("Admin account action failed:", error);
    return Response.json({ error: "The account action could not be completed." }, { status: 500 });
  }
}
