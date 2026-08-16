import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import {
  commandCenterControlsSafetyEnvelopePresent,
  commandCenterDraftEligibility,
  failClosedCommandCenterControls,
} from "../src/lib/command-center-policy";
import type {
  CommandCenterDraft,
  CommandCenterSnapshotV2,
  CommandCenterTicket,
} from "../src/lib/command-center-types";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import {
  COMMAND_CENTER_V2_CANARIES,
  COMMAND_CENTER_V2_LEGACY_FOUNDER_DRAFT_ID,
  COMMAND_CENTER_V2_LEGACY_TICKET_ID,
  COMMAND_CENTER_V2_LOW_RISK_TICKET_ID,
  COMMAND_CENTER_V2_MALFORMED_TICKET_ID,
  COMMAND_CENTER_V2_PROTECTED_TICKET_ID,
  COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID,
  COMMAND_CENTER_V2_SUPPORT_TICKET_B_ID,
  COMMAND_CENTER_V2_VALID_TICKET_COUNT,
  COMMAND_CENTER_V2_VALID_TICKET_IDS,
} from "./fixtures/command-center-v2-store.mjs";

const ownerHeaders = { Authorization: "Bearer playwright-local-owner" };
const ownerProofHeaders = {
  ...ownerHeaders,
  "X-Reauthentication-Token": "playwright-local-owner",
};

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

async function acceptOwnerTerms(request: APIRequestContext) {
  const response = await request.post("/api/legal/acceptance", {
    headers: ownerHeaders,
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(response.ok()).toBe(true);
}

async function snapshotV2(request: APIRequestContext, query = "") {
  const response = await request.get(`/api/admin/command-center/v2${query}`, { headers: ownerHeaders });
  const body = await response.text();
  expect(response.ok(), `${response.status()} ${body}`).toBe(true);
  return JSON.parse(body) as CommandCenterSnapshotV2;
}

function uiTicket(input: {
  id: string;
  ticketNumber: string;
  subject: string;
}): CommandCenterTicket {
  return {
    ...input,
    version: 1,
    source: "user_support",
    category: "support",
    riskLevel: "medium",
    priority: 3,
    status: "new",
    normalizedSummary: `Operational summary for ${input.subject}.`,
    relatedUserId: "local-free-learner",
    requiresHumanApproval: true,
    confirmedFacts: [],
    unverifiedClaims: [],
    evidenceReferences: [],
    tags: ["ui-isolation"],
    notes: [],
    publicReplies: [],
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    dueAt: "2026-08-17T10:00:00.000Z",
  };
}

function canonicalPageOrder(tickets: CommandCenterTicket[]) {
  return [...tickets].sort((left, right) => (
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || left.id.localeCompare(right.id)
  )).map((ticket) => ticket.id);
}

test("enforces the protected-risk draft-output matrix as a pure policy", () => {
  const cases = [
    { agentType: "support", category: "support", riskLevel: "low", mode: "response_draft" },
    { agentType: "support", category: "other", riskLevel: "medium", mode: "response_draft" },
    { agentType: "support", category: "support", riskLevel: "high", mode: "internal_summary" },
    { agentType: "support", category: "support", riskLevel: "critical", mode: "internal_summary" },
    { agentType: "support", category: "security", riskLevel: "low", mode: "internal_summary" },
    { agentType: "support", category: "abuse", riskLevel: "medium", mode: "internal_summary" },
    { agentType: "support", category: "system_alert", riskLevel: "low", mode: "internal_summary" },
    { agentType: "legal", category: "legal", riskLevel: "low", mode: "internal_summary" },
    { agentType: "legal", category: "copyright", riskLevel: "medium", mode: "internal_summary" },
    { agentType: "legal", category: "privacy", riskLevel: "critical", mode: "internal_summary" },
    { agentType: "billing", category: "billing", riskLevel: "medium", mode: "response_draft" },
    { agentType: "billing", category: "billing", riskLevel: "high", mode: "internal_summary" },
    { agentType: "productOperations", category: "product_feedback", riskLevel: "low", mode: "internal_summary" },
    { agentType: "productOperations", category: "content_report", riskLevel: "high", mode: "internal_summary" },
  ] as const;

  for (const fixture of cases) {
    expect(commandCenterDraftEligibility(fixture)).toMatchObject({
      eligible: true,
      mode: fixture.mode,
    });
  }
  expect(commandCenterDraftEligibility({
    agentType: "support",
    category: "content_report",
    riskLevel: "medium",
  })).toMatchObject({ eligible: false, mode: "ineligible" });
  expect(commandCenterDraftEligibility({ agentType: "founderBrief" }))
    .toMatchObject({ eligible: true, mode: "founder_brief" });
  expect(commandCenterDraftEligibility({
    agentType: "founderBrief",
    category: "support",
    riskLevel: "low",
  })).toMatchObject({ eligible: false, mode: "ineligible" });

  expect(failClosedCommandCenterControls()).toMatchObject({
    systemEnabled: false,
    simulationMode: true,
    killSwitchActive: true,
    agentFlags: { support: false, founderBrief: false },
    actionFlags: { externalEffects: false },
  });
  expect(commandCenterControlsSafetyEnvelopePresent({ version: 1 })).toBe(false);
  expect(commandCenterControlsSafetyEnvelopePresent({
    version: 1,
    systemEnabled: false,
    simulationMode: true,
    killSwitchActive: true,
  })).toBe(true);
});

test("reports a truthful 501-record traversal, isolates malformed records, and normalizes v1 data", async ({ request }) => {
  await acceptOwnerTerms(request);
  const first = await snapshotV2(request);

  expect(first).toMatchObject({
    contractVersion: 2,
    consistency: "best_effort_non_atomic",
    schemaVersions: { controls: 1, tickets: 1, approvals: 1, drafts: 1, auditEvents: 1 },
    summaryCompleteness: { basis: "loaded_records", complete: false },
  });
  expect(Date.parse(first.retrievedAt)).not.toBeNaN();
  expect(first.collections.tickets).toMatchObject({
    total: COMMAND_CENTER_V2_VALID_TICKET_COUNT + 1,
    inspected: 500,
    loaded: 499,
    malformed: 1,
    limit: 500,
    cursorApplied: false,
    scanComplete: false,
    complete: false,
    traversalOrder: { field: "id", direction: "asc" },
    presentationOrder: {
      field: "updatedAt",
      direction: "desc",
      tieBreaker: "id",
      tieDirection: "asc",
    },
  });
  expect(first.collections.tickets.nextCursor).toEqual(expect.any(String));
  expect(first.tickets.map((ticket) => ticket.id)).toEqual(canonicalPageOrder(first.tickets));
  expect(first.tickets.slice(0, 2).map((ticket) => ticket.id)).toEqual([
    COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID,
    COMMAND_CENTER_V2_SUPPORT_TICKET_B_ID,
  ]);

  expect(first.collections.approvals).toMatchObject({ total: 2, inspected: 2, loaded: 1, malformed: 1, scanComplete: true, complete: false });
  expect(first.collections.drafts).toMatchObject({ total: 2, inspected: 2, loaded: 1, malformed: 1, scanComplete: true, complete: false });
  expect(first.collections.auditEvents).toMatchObject({ total: 2, inspected: 2, loaded: 1, malformed: 1, scanComplete: true, complete: false });
  expect(first.warnings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "malformed_record", section: "tickets", recordId: COMMAND_CENTER_V2_MALFORMED_TICKET_ID }),
    expect.objectContaining({ code: "malformed_record", section: "approvals", recordId: "ccv2-approval-malformed" }),
    expect.objectContaining({ code: "malformed_record", section: "drafts", recordId: "ccv2-draft-malformed" }),
    expect.objectContaining({ code: "malformed_record", section: "auditEvents", recordId: "ccv2-audit-malformed" }),
  ]));
  for (const canary of COMMAND_CENTER_V2_CANARIES) {
    expect(JSON.stringify(first)).not.toContain(canary);
  }

  const legacyTicket = first.tickets.find((ticket) => ticket.id === COMMAND_CENTER_V2_LEGACY_TICKET_ID);
  expect(legacyTicket).toMatchObject({ notes: [], publicReplies: [] });
  expect(first.drafts.find((draft) => draft.id === COMMAND_CENTER_V2_LEGACY_FOUNDER_DRAFT_ID)).toMatchObject({
    scope: "founder_brief",
    status: "pending_review",
  });
  expect(first.drafts.find((draft) => draft.id === COMMAND_CENTER_V2_LEGACY_FOUNDER_DRAFT_ID)).not.toHaveProperty("sourceManifest");

  const cursor = first.collections.tickets.nextCursor;
  if (!cursor) throw new Error("The first ticket page did not return its required cursor.");
  const second = await snapshotV2(request, `?ticketsCursor=${encodeURIComponent(cursor)}`);
  expect(second.collections.tickets).toMatchObject({
    total: COMMAND_CENTER_V2_VALID_TICKET_COUNT + 1,
    inspected: 2,
    loaded: 2,
    malformed: 0,
    cursorApplied: true,
    nextCursor: null,
    scanComplete: false,
    complete: false,
  });
  expect(second.consistency).toBe("best_effort_non_atomic");
  expect(second.tickets.map((ticket) => ticket.id)).toEqual(canonicalPageOrder(second.tickets));
  expect(first.tickets.map((ticket) => ticket.id).sort()).toEqual(
    COMMAND_CENTER_V2_VALID_TICKET_IDS.slice(0, 499),
  );
  expect(second.tickets.map((ticket) => ticket.id).sort()).toEqual(
    COMMAND_CENTER_V2_VALID_TICKET_IDS.slice(499),
  );
  const ids = [...first.tickets, ...second.tickets].map((ticket) => ticket.id);
  expect(new Set(ids).size).toBe(COMMAND_CENTER_V2_VALID_TICKET_COUNT);
  expect([...new Set(ids)].sort()).toEqual(COMMAND_CENTER_V2_VALID_TICKET_IDS);
  expect(ids).not.toContain(COMMAND_CENTER_V2_MALFORMED_TICKET_ID);

  const wrongSection = await request.get(
    `/api/admin/command-center/v2?approvalsCursor=${encodeURIComponent(cursor)}`,
    { headers: ownerHeaders },
  );
  expect(wrongSection.status()).toBe(400);
  const tampered = await request.get(
    `/api/admin/command-center/v2?ticketsCursor=${encodeURIComponent(`${cursor}A`)}`,
    { headers: ownerHeaders },
  );
  expect(tampered.status()).toBe(400);
  for (const invalidLimit of ["0", "501", "1.5", "not-a-number"]) {
    const response = await request.get(`/api/admin/command-center/v2?limit=${invalidLimit}`, { headers: ownerHeaders });
    expect(response.status()).toBe(400);
  }
});

test("requires recent owner proof and recovers one public reply after a lost response", async ({ request }) => {
  await acceptOwnerTerms(request);
  const idempotencyKey = "ccv2-public-reply-retry-0001";
  const payload = {
    expectedVersion: 1,
    body: "The owner reviewed this deterministic reply. It is published exactly once.",
  };
  const path = `/api/admin/command-center/tickets/${COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID}/public-replies`;

  const missingProof = await request.post(path, {
    headers: { ...ownerHeaders, "Idempotency-Key": idempotencyKey },
    data: payload,
  });
  expect(missingProof.status()).toBe(401);
  await expect(missingProof.json()).resolves.toMatchObject({ code: "RECENT_AUTHENTICATION_REQUIRED" });

  const wrongIdentityProof = await request.post(path, {
    headers: {
      ...ownerHeaders,
      "X-Reauthentication-Token": "playwright-free-learner",
      "Idempotency-Key": idempotencyKey,
    },
    data: payload,
  });
  expect(wrongIdentityProof.status()).toBe(401);
  await expect(wrongIdentityProof.json()).resolves.toMatchObject({ code: "RECENT_AUTHENTICATION_REQUIRED" });

  const staleProof = await request.post(path, {
    headers: {
      ...ownerHeaders,
      "X-Reauthentication-Token": "playwright-stale-local-owner",
      "Idempotency-Key": idempotencyKey,
    },
    data: payload,
  });
  expect(staleProof.status()).toBe(401);
  await expect(staleProof.json()).resolves.toMatchObject({ code: "RECENT_AUTHENTICATION_REQUIRED" });

  const first = await request.post(path, {
    headers: { ...ownerProofHeaders, "Idempotency-Key": idempotencyKey },
    data: payload,
  });
  expect(first.status()).toBe(201);
  const created = await first.json() as {
    ticket: CommandCenterTicket;
    reply: { id: string; body: string };
    operationId: string;
    recovered: boolean;
  };
  expect(created).toMatchObject({
    recovered: false,
    ticket: { id: COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID, version: 2 },
    reply: { body: payload.body },
  });
  expect(created.operationId).toMatch(/^[a-f0-9]{64}$/);

  // The first response body is intentionally not used by the retry. This models
  // a committed request whose response was lost before the client observed it.
  const replay = await request.post(path, {
    headers: { ...ownerProofHeaders, "Idempotency-Key": idempotencyKey },
    data: payload,
  });
  expect(replay.status()).toBe(200);
  expect(replay.headers()["x-idempotent-replay"]).toBe("true");
  await expect(replay.json()).resolves.toMatchObject({
    recovered: true,
    operationId: created.operationId,
    ticket: { id: COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID, version: 2 },
    reply: { id: created.reply.id, body: payload.body },
  });

  const changedPayload = await request.post(path, {
    headers: { ...ownerProofHeaders, "Idempotency-Key": idempotencyKey },
    data: { ...payload, body: "A different reply must not reuse the completed operation key." },
  });
  expect(changedPayload.status()).toBe(409);

  const snapshot = await snapshotV2(request);
  const ticket = snapshot.tickets.find((candidate) => candidate.id === COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID);
  expect(ticket).toMatchObject({ version: 2 });
  expect(ticket?.publicReplies).toHaveLength(1);
  expect(ticket?.publicReplies[0]).toMatchObject({ id: created.reply.id, body: payload.body });
  expect(snapshot.auditEvents.filter((event) => (
    event.ticketId === COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID
    && event.action === "ticket.public_reply_published"
  ))).toHaveLength(1);
});

test("reconciles a committed approval decision with the exact idempotent request", async ({ request }) => {
  await acceptOwnerTerms(request);
  const ticketResponse = await request.post("/api/admin/command-center/tickets", {
    headers: { ...ownerHeaders, "Idempotency-Key": "ccv2-approval-review-ticket-0001" },
    data: {
      category: "support",
      riskLevel: "medium",
      subject: "Approval idempotency contract ticket",
      summary: "A dedicated record proves exact recovery after an approval response is lost.",
      confirmedFacts: [],
      unverifiedClaims: [],
      tags: ["approval-idempotency"],
    },
  });
  expect(ticketResponse.status()).toBe(201);
  const ticket = (await ticketResponse.json() as { ticket: CommandCenterTicket }).ticket;
  const approvalResponse = await request.post("/api/admin/command-center/approvals", {
    headers: ownerHeaders,
    data: {
      ticketId: ticket.id,
      expectedTicketVersion: ticket.version,
      actionType: "send_response",
      proposedAction: "Record a simulated owner decision for retry validation.",
      riskLevel: "medium",
      sideEffects: ["No action executes in simulation mode."],
      affectedRecords: [`commandCenterTickets/${ticket.id}`],
      policyReferences: ["Support response policy v1"],
      expiresInHours: 24,
    },
  });
  expect(approvalResponse.status()).toBe(201);
  const approval = (await approvalResponse.json() as { approval: { id: string; version: number } }).approval;
  const path = `/api/admin/command-center/approvals/${approval.id}`;
  const idempotencyKey = "ccv2-approval-review-retry-0001";
  const payload = {
    expectedVersion: approval.version,
    decision: "approved",
    reason: "The bounded simulated decision is supported by the recorded policy evidence.",
  };

  const first = await request.patch(path, {
    headers: { ...ownerProofHeaders, "Idempotency-Key": idempotencyKey },
    data: payload,
  });
  expect(first.ok()).toBe(true);
  await expect(first.json()).resolves.toMatchObject({
    approval: { status: "approved", executionState: "not_executed" },
    recovered: false,
    executed: false,
  });

  const replay = await request.patch(path, {
    headers: { ...ownerProofHeaders, "Idempotency-Key": idempotencyKey },
    data: payload,
  });
  expect(replay.ok()).toBe(true);
  await expect(replay.json()).resolves.toMatchObject({
    approval: { status: "approved", executionState: "not_executed" },
    recovered: true,
    executed: false,
  });

  const changedPayload = await request.patch(path, {
    headers: { ...ownerProofHeaders, "Idempotency-Key": idempotencyKey },
    data: { ...payload, reason: "A changed reason must not reuse the completed decision key." },
  });
  expect(changedPayload.status()).toBe(409);

  const snapshot = await snapshotV2(request);
  expect(snapshot.auditEvents.filter((event) => (
    event.targetId === approval.id && event.action === "approval.approved"
  ))).toHaveLength(1);
});

test("persists protected cases as internal summaries while retaining low-risk response drafts", async ({ request }) => {
  await acceptOwnerTerms(request);
  const protectedResponse = await request.post("/api/admin/command-center/drafts", {
    headers: { ...ownerHeaders, "Idempotency-Key": "ccv2-protected-draft-0001" },
    data: {
      agentType: "support",
      ticketId: COMMAND_CENTER_V2_PROTECTED_TICKET_ID,
      expectedTicketVersion: 1,
    },
  });
  expect(protectedResponse.status()).toBe(201);
  const protectedBody = await protectedResponse.json() as { draft: CommandCenterDraft };
  expect(protectedBody.draft).toMatchObject({
    agentType: "support",
    externalSideEffect: false,
    content: { responseDraft: null },
  });
  expect(protectedBody.draft.content.cautions.join(" ")).toContain("Internal-summary-only policy");

  const lowRiskResponse = await request.post("/api/admin/command-center/drafts", {
    headers: { ...ownerHeaders, "Idempotency-Key": "ccv2-low-risk-draft-0001" },
    data: {
      agentType: "support",
      ticketId: COMMAND_CENTER_V2_LOW_RISK_TICKET_ID,
      expectedTicketVersion: 1,
    },
  });
  expect(lowRiskResponse.status()).toBe(201);
  const lowRiskBody = await lowRiskResponse.json() as { draft: CommandCenterDraft };
  expect(lowRiskBody.draft.content.responseDraft?.trim().length).toBeGreaterThan(20);
  expect(lowRiskBody.draft.externalSideEffect).toBe(false);

  const laterPageTicketId = COMMAND_CENTER_V2_VALID_TICKET_IDS.at(-2);
  if (!laterPageTicketId) throw new Error("The later-page ticket fixture is missing.");
  const laterPageResponse = await request.post("/api/admin/command-center/drafts", {
    headers: { ...ownerHeaders, "Idempotency-Key": "ccv2-later-page-draft-0001" },
    data: {
      agentType: "support",
      ticketId: laterPageTicketId,
      expectedTicketVersion: 1,
    },
  });
  expect(laterPageResponse.status()).toBe(201);
  await expect(laterPageResponse.json()).resolves.toMatchObject({
    draft: { ticketId: laterPageTicketId, sourceTicketVersion: 1, externalSideEffect: false },
  });
});

test("fails a queue-wide founder brief closed when any stored ticket is malformed", async ({ request }) => {
  await acceptOwnerTerms(request);
  const before = await snapshotV2(request);
  const response = await request.post("/api/admin/command-center/drafts", {
    headers: { ...ownerHeaders, "Idempotency-Key": "ccv2-founder-malformed-queue" },
    data: { agentType: "founderBrief" },
  });
  expect(response.status()).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    error: expect.stringMatching(/malformed ticket/i),
  });
  const after = await snapshotV2(request);
  expect(after.drafts.map((draft) => draft.id).sort()).toEqual(
    before.drafts.map((draft) => draft.id).sort(),
  );
});

test("binds founder briefs to a complete canonical source manifest and rejects stale acceptance", async () => {
  const founderBaseURL = String(test.info().config.metadata.commandCenterV2FounderBaseURL);
  const founderRequest = await playwrightRequest.newContext({ baseURL: founderBaseURL });
  try {
    await acceptOwnerTerms(founderRequest);
    const generateFounder = async (key: string) => {
      const response = await founderRequest.post("/api/admin/command-center/drafts", {
        headers: { ...ownerHeaders, "Idempotency-Key": key },
        data: { agentType: "founderBrief" },
      });
      expect(response.status()).toBe(201);
      const body = await response.json() as { draft: CommandCenterDraft };
      return body.draft;
    };
    const rejectStale = async (draft: CommandCenterDraft) => {
      const response = await founderRequest.patch(`/api/admin/command-center/drafts/${draft.id}`, {
        headers: ownerHeaders,
        data: {
          expectedVersion: draft.version,
          decision: "accepted",
          reason: "This acceptance must fail because the founder source queue changed.",
        },
      });
      expect(response.status()).toBe(409);
    };

    const changedSourceDraft = await generateFounder("ccv2-founder-manifest-0001");
    const manifest = changedSourceDraft.sourceManifest;
    expect(manifest).toMatchObject({
      version: 1,
      query: {
        statuses: ["new", "triaged", "waiting_for_admin", "approved", "in_progress"],
        order: "risk_desc_due_asc_id_asc",
      },
      queueCount: COMMAND_CENTER_V2_VALID_TICKET_COUNT - 1,
      queueComplete: true,
      promptSelection: { limit: 50, count: 50, truncated: true },
    });
    expect(manifest?.queueFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest?.queueSources).toHaveLength(COMMAND_CENTER_V2_VALID_TICKET_COUNT - 1);
    expect(manifest?.promptSelection.sources).toHaveLength(50);
    expect(manifest?.queueSources[0]).toMatchObject({
      ticketId: COMMAND_CENTER_V2_PROTECTED_TICKET_ID,
      ticketVersion: 1,
    });

    const changedSourceId = manifest?.queueSources[0]?.ticketId;
    if (!changedSourceId) throw new Error("The founder manifest did not include its first source ticket.");
    const changedSource = await founderRequest.patch(`/api/admin/command-center/tickets/${changedSourceId}`, {
      headers: ownerHeaders,
      data: { expectedVersion: 1, status: "in_progress" },
    });
    expect(changedSource.ok()).toBe(true);
    await rejectStale(changedSourceDraft);

    const newOpenDraft = await generateFounder("ccv2-founder-manifest-0002");
    const newTicket = await founderRequest.post("/api/admin/command-center/tickets", {
      headers: { ...ownerHeaders, "Idempotency-Key": "ccv2-founder-new-open-ticket" },
      data: {
        category: "support",
        riskLevel: "medium",
        subject: "New open ticket after founder generation",
        summary: "A new queue member must invalidate the previously generated founder brief.",
        confirmedFacts: [],
        unverifiedClaims: [],
        tags: ["founder-staleness"],
      },
    });
    expect(newTicket.status()).toBe(201);
    await rejectStale(newOpenDraft);

    const closedOnlyDraft = await generateFounder("ccv2-founder-manifest-0003");
    const closedOnlyChange = await founderRequest.patch("/api/admin/command-center/tickets/ccv2-ticket-0500", {
      headers: ownerHeaders,
      data: {
        expectedVersion: 1,
        note: "This closed-only note does not change founder open-queue membership or content.",
      },
    });
    expect(closedOnlyChange.ok()).toBe(true);
    const accepted = await founderRequest.patch(`/api/admin/command-center/drafts/${closedOnlyDraft.id}`, {
      headers: ownerHeaders,
      data: {
        expectedVersion: closedOnlyDraft.version,
        decision: "accepted",
        reason: "The open queue source manifest remains current after a closed-only note.",
      },
    });
    expect(accepted.ok()).toBe(true);
    await expect(accepted.json()).resolves.toMatchObject({
      draft: { status: "accepted", externalSideEffect: false },
      executed: false,
      sent: false,
    });
  } finally {
    await founderRequest.dispose();
  }
});

test("keeps a legacy founder draft rejectable but blocks acceptance without a manifest", async ({ request }) => {
  await acceptOwnerTerms(request);
  const acceptLegacy = await request.patch(`/api/admin/command-center/drafts/${COMMAND_CENTER_V2_LEGACY_FOUNDER_DRAFT_ID}`, {
    headers: ownerHeaders,
    data: {
      expectedVersion: 1,
      decision: "accepted",
      reason: "A legacy founder draft cannot prove current queue sources.",
    },
  });
  expect(acceptLegacy.status()).toBe(409);
  await expect(acceptLegacy.json()).resolves.toMatchObject({ error: expect.stringMatching(/regenerate|source manifest/i) });

  const rejectLegacy = await request.patch(`/api/admin/command-center/drafts/${COMMAND_CENTER_V2_LEGACY_FOUNDER_DRAFT_ID}`, {
    headers: ownerHeaders,
    data: {
      expectedVersion: 1,
      decision: "rejected",
      reason: "Retire the legacy draft without treating it as current evidence.",
    },
  });
  expect(rejectLegacy.ok()).toBe(true);
  await expect(rejectLegacy.json()).resolves.toMatchObject({
    draft: { status: "rejected", externalSideEffect: false },
    executed: false,
    sent: false,
  });
});

test("clears ticket-bound note, reply, and approval form state when selection changes", async ({ page }) => {
  await acceptOwnerTerms(page.request);
  const ticketA = uiTicket({
    id: "ccv2-ui-ticket-a",
    ticketNumber: "TKT-UIA0001",
    subject: "UI isolation ticket A",
  });
  const ticketB = uiTicket({
    id: "ccv2-ui-ticket-b",
    ticketNumber: "TKT-UIB0001",
    subject: "UI isolation ticket B",
  });
  await page.route("**/api/admin/command-center", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/admin/command-center") return route.continue();
    return route.fulfill({
      json: {
        controls: {
          version: 1,
          systemEnabled: true,
          simulationMode: true,
          killSwitchActive: false,
          agentFlags: {
            support: false,
            legal: false,
            billing: false,
            privacy: false,
            content: false,
            productOperations: false,
            knowledge: false,
            founderBrief: false,
          },
          actionFlags: {
            externalEffects: false,
            sendResponse: false,
            refund: false,
            deleteData: false,
            restrictAccount: false,
            removeContent: false,
            publishStatus: false,
          },
        },
        tickets: [ticketA, ticketB],
        approvals: [],
        drafts: [],
        auditEvents: [],
        capabilities: { draftAgentsAvailable: true },
        summary: { openTickets: 2, highRiskTickets: 0, pendingApprovals: 0, overdueTickets: 0, pendingDrafts: 0 },
      },
    });
  });
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
  await page.goto("/admin/command-center");

  await page.getByRole("button", { name: /UI isolation ticket A/ }).click();
  await page.getByLabel("Add an internal note").fill("Ticket A internal note must not leak.");
  await page.getByLabel("Publish a reply to the learner").fill("Ticket A public reply must not leak.");
  await page.getByRole("button", { name: "Request approval" }).click();
  const approvalDialog = page.getByRole("dialog", { name: "Request owner approval" });
  await approvalDialog.getByLabel(/Proposed action/).fill("Ticket A proposed action must not leak.");
  await approvalDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /UI isolation ticket B/ }).click();
  await expect(page.getByLabel("Add an internal note")).toHaveValue("");
  await expect(page.getByLabel("Publish a reply to the learner")).toHaveValue("");
  await page.getByRole("button", { name: "Request approval" }).click();
  await expect(approvalDialog.getByLabel(/Proposed action/)).toHaveValue("");
});
