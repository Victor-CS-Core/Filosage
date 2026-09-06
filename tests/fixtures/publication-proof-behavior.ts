import assert from "node:assert/strict";
import { test as nodeTest, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { getStoredDocument, putStoredDocument, publishCourseWithReview } from "../../src/lib/document-store.ts";
import { buildPublicationValidationProof } from "../../src/lib/publication-review.ts";
import { createGenerationSafetyProof, publicationProofToken, publicationProofApprovalFingerprint, PUBLICATION_PROOF_POLICY_VERSION } from "../../src/lib/publication-proofs.ts";
import type { Course } from "../../src/lib/course-types.ts";
import { publicationDecisionFromReport } from "../../src/lib/course-pipeline/validation.ts";

import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
function test(name: string, work: () => Promise<void>) {
  nodeTest(name, async () => runWithAccountGeneration(await captureAccountGeneration("local-owner"), work));
}

const directory = mkdtempSync(join(tmpdir(), "publication-proof-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
after(() => rmSync(directory, { recursive: true, force: true }));
import { buildGeneratedCoursePublication } from "../../src/lib/publication-review.ts";
import { certifyResearchSourcesV5, SOURCE_RESEARCH_POLICY_VERSION } from "../../src/lib/source-research.ts";

async function researchBoundCandidate() {
  const value = candidate();
  const now = Date.now();
  const url = "https://www.nist.gov/publications/evidence-review";
  const certified = certifyResearchSourcesV5({ sources: [{
    label: "NIST evidence guidance", url, author: null, publisher: "NIST", publicationDate: null,
    publicationStatus: "released", statusCheck: "released-no-withdrawal-found", evidenceType: "official-guidance",
    evidenceClaims: [{ claim: "Observations distinguish recorded evidence from proposed explanations.", locator: null }],
    reputationRationale: "NIST is the responsible official publisher.", limitations: "This guidance has a bounded scope.",
  }] }, { id: "research-response", output: [
    { type: "web_search_call", id: "search-proof", status: "completed", action: { type: "search", query: "evidence" } },
    { type: "message", content: [{ type: "output_text", text: "Evidence guidance", annotations: [{ type: "url_citation", url, title: "NIST" }] }] },
  ] }, new Date(now - 1000).toISOString());
  assert.equal(certified.sources.length, 1);
  const sourcePack = certified.sources.map((source) => ({ ...source, qualityTier: "vetted" as const,
    evidenceValidationResponseId: "validation-response", evidenceValidationCallIds: ["validation-call"] }));
  const artifact = { ownerUid: "author", requestFingerprint: "a".repeat(64), policyVersion: SOURCE_RESEARCH_POLICY_VERSION,
    responseId: "research-response", sourcePack, evidenceResearchComplete: true,
    evidenceCreatedAt: new Date(now - 1000).toISOString(), evidenceExpiresAt: new Date(now + 60_000).toISOString() };
  const artifactPath = "courseResearchArtifacts/publication-research";
  Object.assign(value.course, { authorId: "author", sourcePack, sourceResearchArtifactId: "publication-research",
    sourceResearchRequestFingerprint: artifact.requestFingerprint, sourceResearchResponseId: artifact.responseId,
    sourceResearchPolicyVersion: SOURCE_RESEARCH_POLICY_VERSION });
  await putStoredDocument(artifactPath, artifact);
  const proof = await buildPublicationValidationProof(value.course, value.lessons, value.ids, { uid: "owner" });
  assert.equal(proof.research?.status, "verified");
  value.course.publicationProof = proof;
  value.course.manualReviewResolution = { status: "approved", snapshotHash: proof.snapshotHash,
    contractVersion: proof.validationReport.contractVersion, proofPolicyVersion: PUBLICATION_PROOF_POLICY_VERSION,
    proofFingerprint: publicationProofApprovalFingerprint(proof), proofToken: publicationProofToken(proof),
    reviewId: "research-review", reason: "Reviewed the evidence in the exact draft.", reviewedAt: new Date().toISOString() } as Course["manualReviewResolution"];
  await putStoredDocument(`courses/${value.course.id}`, value.course);
  for (const lesson of value.lessons) await putStoredDocument(`courses/${value.course.id}/lessons/${lesson.id}`, lesson);
  return { ...value, proof, artifact, artifactPath };
}

test("source evidence expiring after validation cannot be committed as current proof", async () => {
  const value = await researchBoundCandidate();
  const { commitCourseValidationStage } = await import("../../src/lib/document-store.ts");
  const { publicationContentFingerprint } = await import("../../src/lib/publication-content.ts");
  await putStoredDocument(value.artifactPath, { ...value.artifact, evidenceExpiresAt: new Date(Date.now() - 1).toISOString() });
  await assert.rejects(commitCourseValidationStage(String(value.course.id), value.ids, {
    course: publicationContentFingerprint(value.course),
    lessons: Object.fromEntries(value.lessons.map((lesson) => [lesson.id, publicationContentFingerprint(lesson)])),
  }, "manual_review", { decision: "manual_review", snapshotHash: value.proof.snapshotHash, publicationProof: value.proof }), /source evidence changed or expired/);
});

test("expired research produces a registered typed non-overridable publication diagnostic", async () => {
  const value = await researchBoundCandidate();
  await putStoredDocument(value.artifactPath, { ...value.artifact, evidenceExpiresAt: new Date(Date.now() - 1).toISOString() });
  const proof = await buildPublicationValidationProof(value.course, value.lessons, value.ids, { uid: "owner" });
  const { validationReportSchema } = await import("../../src/lib/course-pipeline/schemas.ts");
  const { COURSE_QUALITY_RULE_CODES } = await import("../../src/lib/course-pipeline/rules.ts");
  assert.equal(validationReportSchema.safeParse(proof.validationReport).success, true);
  const issue = proof.validationReport.issues.find((item) => item.code === "CQ_SOURCE_006");
  assert.ok(issue);
  assert.ok(COURSE_QUALITY_RULE_CODES.includes(issue.code as typeof COURSE_QUALITY_RULE_CODES[number]));
  assert.ok(issue.suggestedAction);
  assert.equal(publicationDecisionFromReport(proof.validationReport).decision, "blocked");
});

test("publication transaction rereads research after the successful course review", async () => {
  const value = await researchBoundCandidate();
  const review = await buildGeneratedCoursePublication(value.course, value.lessons, value.ids, { uid: "owner", isOwner: true });
  await putStoredDocument(value.artifactPath, { ...value.artifact, responseId: "substituted-response" });
  await assert.rejects(publishCourseWithReview(String(value.course.id), value.ids, review), /source evidence changed or expired/);
  assert.notEqual((await getStoredDocument(`courses/${value.course.id}`))?.isPublic, true);
});

function conciseValidLesson() {
  return {
    id: "0-0",
    schemaVersion: 4,
    learningObjective: "Classify a claim as observation or inference.",
    connection: "This distinction supports an evidence-based decision.",
    keyTakeaways: [
      "Observations report what was measured.",
      "Inferences explain an observation.",
      "Confidence depends on the available evidence.",
    ],
    content: `## Distinguish the claim\n\n${"A direct observation reports what can be checked. An inference proposes an explanation and must be labeled as such. ".repeat(9)}`,
    guidedPractice: {
      prompt: "Classify the two claims.",
      steps: ["Mark the directly observed result.", "Mark the proposed explanation."],
      modelAnswer: "The measured count is an observation. The proposed cause is an inference.",
    },
    transferTask: {
      prompt: "Classify a new product claim.",
      successCriteria: ["Names the observation", "Names the inference"],
      modelResponse: "The recorded usage is an observation, while the explanation for its change is an inference.",
    },
    quizzes: [0, 1].map((index) => ({
      question: `Which statement is directly observed in case ${index + 1}?`,
      options: ["Recorded count", "Proposed cause", "Future forecast", "Unstated preference"],
      correctIndex: 0,
      explanation: "Only the recorded count is directly observed.",
      optionFeedback: ["Correct, this is observed.", "This is an inference.", "This is a forecast.", "This is not stated."],
    })),
  };
}

function validOutline() {
  const lesson = (title: string, lessonMode: "concept" | "worked-example" | "comparison" | "synthesis") => ({
    title,
    concept: `${title} concept`,
    estimatedMinutes: 15,
    objective: `Classify evidence in ${title.toLowerCase()}.`,
    lessonMode,
    buildsOn: [],
    misconception: `A common error about ${title.toLowerCase()}.`,
    practiceType: "classify" as const,
    masteryCriteria: `Correctly classify evidence in ${title.toLowerCase()}.`,
    activityPreview: `Classify a ${title.toLowerCase()} example.`,
    artifactContribution: `Add the ${title.toLowerCase()} decision.`,
  });
  return {
    topic: "Evidence-based product decisions",
    mission: "Make one defensible product decision.",
    level: "Foundations" as const,
    estimatedMinutes: 90,
    outcome: "Defend a product decision with evidence.",
    prerequisites: [],
    category: "Product management",
    audience: "Product practitioners",
    artifact: { title: "Decision memo", description: "A concise evidence-based decision memo", format: "Memo" },
    scenario: { title: "Roadmap choice", context: "A team must choose one investment.", stakes: "The choice uses limited capacity." },
    modules: [
      {
        title: "Evidence",
        description: "Separate observation from explanation.",
        objective: "Classify claims by evidence type.",
        challenge: { title: "Evidence check", prompt: "Classify the claims.", successCriteria: ["Correct labels", "Clear rationale"] },
        milestone: { title: "Evidence table", deliverable: "Decision memo evidence table", evidence: "Reviewed claim labels" },
        lessons: [lesson("Observe", "concept"), lesson("Explain", "worked-example")],
      },
      {
        title: "Decision",
        description: "Use evidence in a bounded choice.",
        objective: "Defend a decision with evidence.",
        challenge: { title: "Decision check", prompt: "Choose and defend an option.", successCriteria: ["Uses evidence", "States uncertainty"] },
        milestone: { title: "Recommendation", deliverable: "Decision memo recommendation", evidence: "Evidence-linked rationale" },
        lessons: [lesson("Compare", "comparison"), lesson("Synthesize", "synthesis")],
      },
    ],
    capstone: {
      title: "Decision memo",
      brief: "Write the final evidence-based decision memo.",
      deliverable: "A decision memo with evidence and uncertainty",
      successCriteria: ["Classifies claims", "Uses evidence", "States uncertainty"],
    },
  };
}


function candidate() {
  const outline = validOutline();
  const course = { ...outline, id: "proof-course", authorId: "local-owner", aiAssisted: true } as Course & Record<string, unknown>;
  const ids = ["0-0", "0-1", "1-0", "1-1"];
  const experiences = [
    { type: "concept", predictionPrompt: "Predict which claim is observed.", mentalModel: { title: "Claim types", parts: [{ label: "Observation", role: "Checkable result" }, { label: "Inference", role: "Possible explanation" }] }, misconceptionCheck: { claim: "Confidence is evidence.", correction: "Evidence requires an observation." } },
    { type: "worked-example", scenario: "Classify two claims.", steps: ["Observe", "Classify", "Check"].map((title) => ({ title, reasoning: "Compare the claim with the recorded count.", output: "An observation and a labeled inference." })), fadingPrompt: "Classify the next claim yourself." },
    { type: "comparison", options: ["Observation", "Inference"], criteria: ["Checkability", "Explanation", "Confidence"].map((criterion) => ({ criterion, first: "Recorded evidence", second: "Proposed cause" })), boundaryCase: { prompt: "What if the count is unavailable?", resolution: "Keep the claim uncertain." } },
    { type: "synthesis", challenge: "Defend the decision using evidence.", connections: [{ concept: "Observation", contribution: "Names support" }, { concept: "Inference", contribution: "Names uncertainty" }], capstoneContribution: "A defensible decision memo.", reflectionPrompt: "Which claim needs more evidence?" },
  ];
  const lessons = ids.map((id, index) => ({ ...conciseValidLesson(), id, experience: experiences[index], aiAssisted: true, generatedAt: "2026-09-06T00:00:00.000Z" }));
  return { course, ids, lessons };
}

test("generated provenance cannot approve a candidate with no current publication proof", async () => {
  const { course, ids, lessons } = candidate();
  await assert.rejects(buildGeneratedCoursePublication(course, lessons, ids, { uid: "owner", isOwner: true }), /proof|review/i);
});

async function reviewedCandidate() {
  const { course, lessons, ids } = candidate();
  const proof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
  assert.equal(publicationDecisionFromReport(proof.validationReport).decision, "manual_review", JSON.stringify(proof.validationReport.issues));
  course.publicationProof = proof;
  (course as Record<string, unknown>).manualReviewResolution = {
    status: "approved", snapshotHash: proof.snapshotHash, contractVersion: proof.validationReport.contractVersion,
    proofPolicyVersion: PUBLICATION_PROOF_POLICY_VERSION, proofFingerprint: publicationProofApprovalFingerprint(proof), proofToken: publicationProofToken(proof), reviewId: "review-1",
  };
  return { course, lessons, ids, proof };
}

test("an exact explicit safety and semantic/runtime review resolves historical missing moderation without fabricating it", async () => {
  const { course, lessons, ids, proof } = await reviewedCandidate();
  assert.equal(proof.safety.basis, "publication-local-scan");
  assert(proof.validationReport.issues.some((issue) => issue.code === "CQ_SAFETY_001"));
  const review = await buildGeneratedCoursePublication(course, lessons, ids, { uid: "owner", isOwner: true });
  assert.equal(review.status, "approved");
  assert.equal(review.manualReviewResolutionId, "review-1");
  assert.equal(review.artifactSnapshotHash, proof.snapshotHash);
});

test("valid generation moderation records are reused and never represented as unresolved", async () => {
  const { course, lessons, ids } = candidate();
  course.generationSafetyProof = await createGenerationSafetyProof(course, "course");
  for (const lesson of lessons) Object.assign(lesson, { generationSafetyProof: await createGenerationSafetyProof(lesson, `lesson:${lesson.id}`) });
  const proof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
  assert.equal(proof.validationReport.issues.some((issue) => issue.code.startsWith("CQ_SAFETY")), false);
});

for (const mutation of ["edited", "blocked", "policy", "scope"]) {
  test(`a ${mutation} generation proof cannot be waived by owner review`, async () => {
    const { course, lessons, ids } = candidate();
    const safety = await createGenerationSafetyProof(course, "course");
    course.generationSafetyProof = { ...safety,
      ...(mutation === "blocked" ? { status: "blocked" } : {}),
      ...(mutation === "policy" ? { policyVersion: "obsolete" } : {}),
      ...(mutation === "scope" ? { scope: "lesson:0-0" } : {}),
    };
    if (mutation === "edited") course.topic = "Changed course topic";
    const proof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
    course.publicationProof = proof;
    (course as Record<string, unknown>).manualReviewResolution = { status: "approved", snapshotHash: proof.snapshotHash,
      contractVersion: proof.validationReport.contractVersion, proofPolicyVersion: PUBLICATION_PROOF_POLICY_VERSION, proofFingerprint: publicationProofApprovalFingerprint(proof), proofToken: publicationProofToken(proof), reviewId: "override" };
    assert(proof.validationReport.issues.some((issue) => issue.code === "CQ_SAFETY_002"));
    await assert.rejects(buildGeneratedCoursePublication(course, lessons, ids, { uid: "owner", isOwner: true }));
  });
}

async function storedCandidate() {
  const value = await reviewedCandidate();
  await putStoredDocument(`courses/${value.course.id}`, value.course);
  for (const lesson of value.lessons) await putStoredDocument(`courses/${value.course.id}/lessons/${lesson.id}`, lesson);
  const review = await buildGeneratedCoursePublication(value.course, value.lessons, value.ids, { uid: "owner", isOwner: true });
  return { ...value, review };
}

test("publication rejects a revoked manual approval between review and transaction", async () => {
  const { course, ids, review } = await storedCandidate();
  await putStoredDocument(`courses/${course.id}`, { ...course, manualReviewResolution: { status: "rejected", reviewId: "review-2" } });
  await assert.rejects(publishCourseWithReview(String(course.id), ids, review), /review|proof/i);
  assert.notEqual((await getStoredDocument(`courses/${course.id}`))?.isPublic, true);
});

test("publication rejects a proof altered between review and transaction", async () => {
  const { course, ids, review, proof } = await storedCandidate();
  await putStoredDocument(`courses/${course.id}`, { ...course, publicationProof: { ...proof, policyVersion: "obsolete" } });
  await assert.rejects(publishCourseWithReview(String(course.id), ids, review), /proof/i);
  assert.notEqual((await getStoredDocument(`courses/${course.id}`))?.isPublic, true);
});

test("exact proof publishes once, immutable learner content survives draft edits, and unpublish supersedes replay", async () => {
  const { course, lessons, ids, review } = await storedCandidate();
  const mutation = { ...review, publicationMutationKey: "publication-retry-key" };
  await publishCourseWithReview(String(course.id), ids, mutation);
  const first = await getStoredDocument(`courses/${course.id}`);
  assert.equal(first?.isPublic, true);
  assert.equal(typeof first?.publishedReleaseId, "string");
  await publishCourseWithReview(String(course.id), ids, mutation);
  assert.deepEqual(await getStoredDocument(`courses/${course.id}`), first);
  const { getLessonRuntimeArtifact } = await import("../../src/lib/course-pipeline/artifact-access.ts");
  await putStoredDocument(`courses/${course.id}/lessons/0-0`, { ...lessons[0], content: "A later draft edit" });
  assert.equal((await getLessonRuntimeArtifact(String(course.id), "0-0"))?.content, lessons[0].content);
  const { updateCourseVisibility } = await import("../../src/lib/document-store.ts");
  await updateCourseVisibility(String(course.id), false);
  await assert.rejects(publishCourseWithReview(String(course.id), ids, mutation), /IDEMPOTENCY_RESULT_SUPERSEDED/);
});

for (const mutation of ["missing", "policy", "hash", "scope", "content", "report"]) {
  test(`publication rejects ${mutation} aggregate proof`, async () => {
    const { course, lessons, ids, proof } = await reviewedCandidate();
    if (mutation === "missing") delete course.publicationProof;
    if (mutation === "policy") proof.policyVersion = "obsolete";
    if (mutation === "hash") proof.snapshotHash = "a".repeat(64);
    if (mutation === "scope") proof.lessonIds = ["0-0"];
    if (mutation === "content") lessons[0].content += " Edited lesson.";
    if (mutation === "report") proof.validationReport.issues = [];
    await assert.rejects(buildGeneratedCoursePublication(course, lessons, ids, { uid: "owner", isOwner: true }), /proof|review/i);
  });
}

test("a valid review cannot waive a malformed lesson or unsafe source", async () => {
  for (const unsafe of [false, true]) {
    const { course, lessons, ids } = candidate();
    if (unsafe) course.sourcePack = [{ id: "source-unsafe", label: "Unsafe source", url: "https://127.0.0.1/private", kind: "official", rights: "link-only", reviewStatus: "verified" }];
    else lessons[0].content = "";
    const proof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
    course.publicationProof = proof;
    (course as Record<string, unknown>).manualReviewResolution = { status: "approved", snapshotHash: proof.snapshotHash, contractVersion: proof.validationReport.contractVersion, proofPolicyVersion: PUBLICATION_PROOF_POLICY_VERSION, proofFingerprint: publicationProofApprovalFingerprint(proof), proofToken: publicationProofToken(proof), reviewId: "unsafe-approval" };
    await assert.rejects(buildGeneratedCoursePublication(course, lessons, ids, { uid: "owner", isOwner: true }));
  }
});

test("high-stakes, semantic, runtime and missing moderation issues remain explicit", async () => {
  const { course, lessons, ids } = candidate();
  course.topic = "Medical decision reasoning";
  const proof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
  course.publicationProof = proof;
  assert(proof.validationReport.issues.some((issue) => issue.message.includes("medical")));
  assert(proof.validationReport.issues.some((issue) => issue.source === "semantic"));
  assert(proof.validationReport.issues.some((issue) => issue.source === "accessibility"));
  await assert.rejects(buildGeneratedCoursePublication(course, lessons, ids, { uid: "owner", isOwner: true }));
});

test("an incomplete transaction scope cannot publish only a subset of the outline", async () => {
  const { course, review } = await storedCandidate();
  await assert.rejects(publishCourseWithReview(String(course.id), ["0-0"], review), /every outlined lesson/);
});

test("changing moderation evidence invalidates the earlier manual review even when lesson text is unchanged", async () => {
  const { course, lessons, ids } = await reviewedCandidate();
  course.generationSafetyProof = await createGenerationSafetyProof(course, "course");
  course.publicationProof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
  await assert.rejects(buildGeneratedCoursePublication(course, lessons, ids, { uid: "owner", isOwner: true }), /review/i);
});

test("republication after a new manual decision commits a separately bound immutable proof", async () => {
  const { course, lessons, ids, review, proof } = await storedCandidate();
  await publishCourseWithReview(String(course.id), ids, { ...review, publicationMutationKey: "release-first-key" });
  const first = await getStoredDocument(`courses/${course.id}`);
  const { updateCourseVisibility } = await import("../../src/lib/document-store.ts");
  await updateCourseVisibility(String(course.id), false);
  await putStoredDocument(`courses/${course.id}`, { ...course, manualReviewResolution: {
    ...(course.manualReviewResolution as object), reviewId: "new-review-id",
  } });
  const secondCourse = await getStoredDocument(`courses/${course.id}`) as Course & Record<string, unknown>;
  const secondReview = await buildGeneratedCoursePublication(secondCourse, lessons, ids, { uid: "owner", isOwner: true });
  await publishCourseWithReview(String(course.id), ids, { ...secondReview, publicationMutationKey: "release-second-key" });
  const second = await getStoredDocument(`courses/${course.id}`);
  assert.notEqual(second?.publishedReleaseId, first?.publishedReleaseId);
  const release = await getStoredDocument(`courseReleases/${second?.publishedReleaseId}`);
  assert(release);
  assert.equal((release.manualReviewResolution as { reviewId: string }).reviewId, "new-review-id");
  assert.equal((release.publicationProof as { snapshotHash: string }).snapshotHash, proof.snapshotHash);
});

test("existing validation and manual-review storage path produces a usable legacy publication proof", async () => {
  const { course, lessons, ids } = candidate();
  const { commitCourseValidationStage, saveCourseManualReviewResolution } = await import("../../src/lib/document-store.ts");
  const { publicationContentFingerprint } = await import("../../src/lib/publication-content.ts");
  await putStoredDocument(`courses/${course.id}`, course);
  for (const lesson of lessons) await putStoredDocument(`courses/${course.id}/lessons/${lesson.id}`, lesson);
  const proof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
  const fingerprints = { course: publicationContentFingerprint(course), lessons: Object.fromEntries(lessons.map((lesson) => [lesson.id, publicationContentFingerprint(lesson)])) };
  await commitCourseValidationStage(String(course.id), ids, fingerprints, "manual_review", {
    decision: "manual_review", snapshotHash: proof.snapshotHash, publicationProof: proof,
  });
  await saveCourseManualReviewResolution(String(course.id), ids, {
    courseFingerprint: fingerprints.course, lessonFingerprints: fingerprints.lessons, proofToken: publicationProofToken(proof),
  }, {
    status: "approved", snapshotHash: proof.snapshotHash, contractVersion: proof.validationReport.contractVersion,
    reason: "Reviewed safety, content, runtime, assets, and source claims for this complete snapshot.", reviewedAt: new Date().toISOString(),
    reviewId: "actual-review-path", reviewerUid: "owner", idempotencyKey: "actual-review-key", verifiedSourceIds: [], mutationId: "actual-review-mutation",
  });
  const stored = await getStoredDocument(`courses/${course.id}`) as Course & Record<string, unknown>;
  assert.equal(stored.pipelineStage, "ready_to_publish");
  const review = await buildGeneratedCoursePublication(stored, lessons, ids, { uid: "owner", isOwner: true });
  await publishCourseWithReview(String(course.id), ids, review);
  assert.equal((await getStoredDocument(`courses/${course.id}`))?.isPublic, true);
});

test("paused V2 artifacts cannot enter the common review or commit through the legacy path", async () => {
  const { course, lessons, ids, review } = await storedCandidate();
  course.courseSchemaVersion = 5;
  await assert.rejects(buildGeneratedCoursePublication(course, lessons, ids, { uid: "owner", isOwner: true }), /paused/);
  await putStoredDocument(`courses/${course.id}`, course);
  await assert.rejects(publishCourseWithReview(String(course.id), ids, review), /paused/);
});

test("quarantine applied after review remains a non-overridable transaction blocker", async () => {
  const { course, ids, review } = await storedCandidate();
  await putStoredDocument(`courses/${course.id}`, { ...course, moderationStatus: "quarantined" });
  await assert.rejects(publishCourseWithReview(String(course.id), ids, review), /quarantined/);
});

test("validation cannot commit a proof if moderation evidence changed during its safety scan", async () => {
  const { course, lessons, ids, proof } = await reviewedCandidate();
  const { commitCourseValidationStage } = await import("../../src/lib/document-store.ts");
  const { publicationContentFingerprint } = await import("../../src/lib/publication-content.ts");
  const fingerprints = { course: publicationContentFingerprint(course), lessons: Object.fromEntries(lessons.map((lesson) => [lesson.id, publicationContentFingerprint(lesson)])) };
  await putStoredDocument(`courses/${course.id}`, { ...course, generationSafetyProof: { status: "blocked" } });
  for (const lesson of lessons) await putStoredDocument(`courses/${course.id}/lessons/${lesson.id}`, lesson);
  await assert.rejects(commitCourseValidationStage(String(course.id), ids, fingerprints, "manual_review", {
    decision: "manual_review", snapshotHash: proof.snapshotHash, publicationProof: proof,
  }), /STALE_VALIDATION_SNAPSHOT/);
});

test("revalidation routes changed proof evidence back to manual review in one request", async () => {
  const { course, lessons, ids } = await reviewedCandidate();
  const { commitCourseValidationStage } = await import("../../src/lib/document-store.ts");
  const { publicationContentFingerprint } = await import("../../src/lib/publication-content.ts");
  course.pipelineStage = "ready_to_publish";
  course.generationSafetyProof = await createGenerationSafetyProof(course, "course");
  await putStoredDocument(`courses/${course.id}`, course);
  for (const lesson of lessons) await putStoredDocument(`courses/${course.id}/lessons/${lesson.id}`, lesson);
  const proof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
  await commitCourseValidationStage(String(course.id), ids, {
    course: publicationContentFingerprint(course), lessons: Object.fromEntries(lessons.map((lesson) => [lesson.id, publicationContentFingerprint(lesson)])),
  }, "manual_review", { decision: "manual_review", snapshotHash: proof.snapshotHash, publicationProof: proof });
  assert.equal((await getStoredDocument(`courses/${course.id}`))?.pipelineStage, "manual_review");
});

test("the atomic writer rejects a blocking proof even when passed an approved owner-override review", async () => {
  const { course, lessons, ids, review } = await storedCandidate();
  lessons[0].content = "";
  const proof = await buildPublicationValidationProof(course, lessons, ids, { uid: "owner" });
  await putStoredDocument(`courses/${course.id}`, { ...course, publicationProof: proof });
  await putStoredDocument(`courses/${course.id}/lessons/0-0`, lessons[0]);
  await assert.rejects(publishCourseWithReview(String(course.id), ids, {
    ...review, status: "owner_override", publicationProof: proof, artifactSnapshotHash: proof.snapshotHash,
  }), /non-overridable blocker/);
  assert.notEqual((await getStoredDocument(`courses/${course.id}`))?.isPublic, true);
});

async function proofTokenCase() {
  const { createHash } = await import("node:crypto");
  const { publicationContentFingerprint } = await import("../../src/lib/publication-content.ts");
  const value = candidate();
  value.course.id = `proof-token-${crypto.randomUUID()}`;
  value.course.generationSafetyProof = await createGenerationSafetyProof(value.course, "course");
  for (const lesson of value.lessons) Object.assign(lesson, { generationSafetyProof: await createGenerationSafetyProof(lesson, `lesson:${lesson.id}`) });
  const proof = await buildPublicationValidationProof(value.course, value.lessons, value.ids, { uid: "local-owner" });
  const token = createHash("sha256").update(publicationProofApprovalFingerprint(proof)).digest("hex");
  const expected = {
    courseFingerprint: publicationContentFingerprint(value.course),
    lessonFingerprints: Object.fromEntries(value.lessons.map((lesson) => [lesson.id, publicationContentFingerprint(lesson)])),
    proofToken: token,
  };
  const resolution = {
    status: "approved" as const, snapshotHash: proof.snapshotHash, contractVersion: proof.validationReport.contractVersion,
    reason: "Reviewed the safety, semantic and runtime obligations for the displayed proof.", reviewedAt: new Date().toISOString(),
    reviewId: crypto.randomUUID(), reviewerUid: "local-owner", idempotencyKey: crypto.randomUUID(), verifiedSourceIds: [], mutationId: crypto.randomUUID(),
  };
  await putStoredDocument(`courses/${value.course.id}`, { ...value.course, pipelineStage: "manual_review", publicationProof: proof });
  for (const lesson of value.lessons) await putStoredDocument(`courses/${value.course.id}/lessons/${lesson.id}`, lesson);
  return { ...value, proof, token, expected, resolution };
}

async function removeModerationFromProof(value: Awaited<ReturnType<typeof proofTokenCase>>) {
  const { createHash } = await import("node:crypto");
  delete value.course.generationSafetyProof;
  for (const lesson of value.lessons) {
    delete (lesson as Record<string, unknown>).generationSafetyProof;
    await putStoredDocument(`courses/${value.course.id}/lessons/${lesson.id}`, lesson);
  }
  const proof = await buildPublicationValidationProof(value.course, value.lessons, value.ids, { uid: "local-owner" });
  assert.equal(proof.snapshotHash, value.proof.snapshotHash);
  assert(proof.validationReport.issues.some((issue) => issue.code === "CQ_SAFETY_001"));
  assert.notEqual(publicationProofApprovalFingerprint(proof), publicationProofApprovalFingerprint(value.proof));
  const current = await getStoredDocument(`courses/${value.course.id}`);
  if (current) delete current.generationSafetyProof;
  await putStoredDocument(`courses/${value.course.id}`, { ...current, ...value.course, pipelineStage: "manual_review", publicationProof: proof });
  return { proof, token: createHash("sha256").update(publicationProofApprovalFingerprint(proof)).digest("hex") };
}

async function proofTokenOwner() {
  const { TERMS_VERSION, PRIVACY_VERSION } = await import("../../src/lib/legal.ts");
  await putStoredDocument("users/local-owner", { accountStatus: "active", acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION });
  return { authorization: "Bearer playwright-local-owner", "x-reauthentication-token": "playwright-local-owner", origin: "http://localhost:3000" };
}

test("validation returns the bounded proof token for the exact displayed evidence", async () => {
  const value = await proofTokenCase();
  const headers = await proofTokenOwner();
  const { GET } = await import("../../src/app/api/courses/[courseId]/validation/route.ts");
  const response = await GET(new Request(`http://localhost:3000/api/courses/${value.course.id}/validation`, { headers }), { params: Promise.resolve({ courseId: String(value.course.id) }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.validationReport.snapshotHash, value.proof.snapshotHash);
  assert.match(body.proofToken, /^[a-f0-9]{64}$/);
  assert.equal(body.proofToken, value.token);
});

test("manual-review request rejects an earlier proof token after moderation evidence changed", async () => {
  const value = await proofTokenCase();
  await removeModerationFromProof(value);
  const headers = await proofTokenOwner();
  const { POST } = await import("../../src/app/api/admin/courses/[courseId]/manual-review/route.ts");
  const response = await POST(new Request(`http://localhost:3000/api/admin/courses/${value.course.id}/manual-review`, {
    method: "POST", headers: { ...headers, "content-type": "application/json", "idempotency-key": value.resolution.idempotencyKey },
    body: JSON.stringify({ decision: "approved", reason: value.resolution.reason, snapshotHash: value.proof.snapshotHash,
      contractVersion: value.proof.validationReport.contractVersion, proofToken: value.token, verifiedSourceIds: [], confirmation: "APPROVE MANUAL REVIEW" }),
  }), { params: Promise.resolve({ courseId: String(value.course.id) }) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "STALE_PUBLICATION_PROOF");
  assert.equal((await getStoredDocument(`courses/${value.course.id}`))?.manualReviewResolution, undefined);
});

test("manual decision rejects a proof token changed between request check and transaction", async () => {
  const value = await proofTokenCase();
  await removeModerationFromProof(value);
  const { saveCourseManualReviewResolution } = await import("../../src/lib/document-store.ts");
  await assert.rejects(saveCourseManualReviewResolution(String(value.course.id), value.ids, value.expected, value.resolution), /proof|changed|stale/i);
  assert.equal((await getStoredDocument(`courses/${value.course.id}`))?.manualReviewResolution, undefined);
});

for (const useCurrentToken of [false, true]) {
  test(`manual decision replay rejects changed proof evidence with the ${useCurrentToken ? "new" : "old"} proof token`, async () => {
    const value = await proofTokenCase();
    const { saveCourseManualReviewResolution } = await import("../../src/lib/document-store.ts");
    await saveCourseManualReviewResolution(String(value.course.id), value.ids, value.expected, value.resolution);
    const changed = await removeModerationFromProof(value);
    await assert.rejects(saveCourseManualReviewResolution(String(value.course.id), value.ids,
      { ...value.expected, proofToken: useCurrentToken ? changed.token : value.token }, value.resolution), /proof|retry/i);
    assert.equal((await getStoredDocument(`courses/${value.course.id}`))?.pipelineStage, "manual_review");
  });
}

test("an exact proof token manual decision replay preserves the original approval", async () => {
  const value = await proofTokenCase();
  const { saveCourseManualReviewResolution } = await import("../../src/lib/document-store.ts");
  const first = await saveCourseManualReviewResolution(String(value.course.id), value.ids, value.expected, value.resolution);
  const retry = await saveCourseManualReviewResolution(String(value.course.id), value.ids, value.expected, { ...value.resolution, reviewId: crypto.randomUUID() });
  assert.equal(first.recovered, false);
  assert.equal(retry.recovered, true);
  assert.equal(retry.resolution.reviewId, value.resolution.reviewId);
  assert.equal((retry.resolution as unknown as Record<string, unknown>).proofToken, value.token);
});

test("manual-review request accepts the exact proof token and returns its approval identity", async () => {
  const value = await proofTokenCase();
  const headers = await proofTokenOwner();
  const { POST } = await import("../../src/app/api/admin/courses/[courseId]/manual-review/route.ts");
  const response = await POST(new Request(`http://localhost:3000/api/admin/courses/${value.course.id}/manual-review`, {
    method: "POST", headers: { ...headers, "content-type": "application/json", "idempotency-key": value.resolution.idempotencyKey },
    body: JSON.stringify({ decision: "approved", reason: value.resolution.reason, snapshotHash: value.proof.snapshotHash,
      contractVersion: value.proof.validationReport.contractVersion, proofToken: value.token, verifiedSourceIds: [], confirmation: "APPROVE MANUAL REVIEW" }),
  }), { params: Promise.resolve({ courseId: String(value.course.id) }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.manualReviewResolution.proofToken, value.token);
  const stored = await getStoredDocument(`courses/${value.course.id}`);
  assert(stored);
  assert.equal((stored.manualReviewResolution as Record<string, unknown>).proofToken, value.token);
});

test("manual-review request cannot omit the displayed proof token", async () => {
  const value = await proofTokenCase();
  const headers = await proofTokenOwner();
  const { POST } = await import("../../src/app/api/admin/courses/[courseId]/manual-review/route.ts");
  const response = await POST(new Request(`http://localhost:3000/api/admin/courses/${value.course.id}/manual-review`, {
    method: "POST", headers: { ...headers, "content-type": "application/json", "idempotency-key": value.resolution.idempotencyKey },
    body: JSON.stringify({ decision: "approved", reason: value.resolution.reason, snapshotHash: value.proof.snapshotHash,
      contractVersion: value.proof.validationReport.contractVersion, verifiedSourceIds: [], confirmation: "APPROVE MANUAL REVIEW" }),
  }), { params: Promise.resolve({ courseId: String(value.course.id) }) });
  assert.equal(response.status, 400);
  assert.equal((await getStoredDocument(`courses/${value.course.id}`))?.manualReviewResolution, undefined);
});

test("proof token identity survives JSONB object-key ordering without dropping evidence", async () => {
  const value = await proofTokenCase();
  const { publicationProofIsCurrent } = await import("../../src/lib/publication-proofs.ts");
  const reordered = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(reordered);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item).reverse().map(([key, child]) => [key, reordered(child)]));
  };
  const storedProof = reordered(value.proof) as typeof value.proof;
  assert.equal(publicationProofToken(storedProof), value.token);
  assert.equal(publicationProofIsCurrent(reordered(value.course) as Record<string, unknown>,
    value.lessons.map((lesson) => reordered(lesson) as Record<string, unknown>), value.ids, value.proof.snapshotHash, storedProof), true);
});
