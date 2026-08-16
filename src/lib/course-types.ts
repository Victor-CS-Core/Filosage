import type { LessonVisual } from "@/lib/lesson-visuals";
import type { LessonInteraction } from "@/lib/lesson-interactions";
import type { CourseStage } from "@/lib/course-pipeline/contract";
import type { LearningDesignContractV1, LessonDesignPlanV1 } from "@/lib/learning-design";

export type LessonMode =
  | "concept"
  | "worked-example"
  | "comparison"
  | "case-study"
  | "practice-lab"
  | "synthesis";

export type LessonKind =
  | "substantive"
  | "introduction"
  | "review"
  | "glossary"
  | "reference"
  | "capstone";

export type PracticeType =
  | "explain"
  | "classify"
  | "calculate"
  | "decide"
  | "create"
  | "debug";

export type SourceKind = "primary" | "official" | "licensed" | "author-provided";
export type SourceRights = "link-only" | "public-domain" | "licensed" | "author-owned";
export type SourceReviewStatus = "unreviewed" | "verified";
export type SourceOrigin = "creator" | "web-search";
export type SourceAuthorityClass = "government" | "intergovernmental" | "standards" | "scholarly";
export type SourceEvidenceType = "primary-study" | "systematic-review" | "official-guidance" | "standard" | "official-dataset";
export type CourseEvidenceMode = "fully-grounded" | "hybrid" | "model-knowledge";
export type LessonContentBasis = "verified-source" | "model-knowledge";

export interface CourseEvidenceProfile {
  mode: CourseEvidenceMode;
  researchOutcome: "complete" | "partial" | "unavailable";
  verifiedSourceCount: number;
  verifiedLessonCount: number;
  modelKnowledgeLessonCount: number;
  bibliographicReferenceCount: number;
  fallbackReasonCodes: string[];
  coverageWarnings: string[];
  generatedAt: string;
  provider: string;
  model: string;
  policyVersion: string;
}

export interface CourseFurtherReading {
  id: string;
  policyVersion: string;
  role: "further-reading";
  claimEvidence: false;
  contentVerified: boolean;
  materialType: "book" | "book-chapter" | "article" | "scripture" | "commentary" | "reference-work";
  title: string;
  containerTitle?: string;
  contributors: Array<{ name: string; role: "author" | "editor" | "translator" | "compiler" | "commentator" | "corporate-author" }>;
  edition?: string;
  publisher?: string;
  publicationYear?: number;
  language: string;
  identifiers: { isbn10?: string; isbn13?: string; oclc?: string; lccn?: string; doi?: string; olid?: string };
  catalogUrl?: string;
  verificationLabel: "catalog-metadata-verified";
}

export interface CourseSource {
  id: string;
  label: string;
  url?: string;
  kind: SourceKind;
  rights: SourceRights;
  author?: string;
  publisher?: string;
  publicationDate?: string;
  accessedAt?: string;
  note?: string;
  reviewStatus?: SourceReviewStatus;
  reviewedAt?: string;
  origin?: SourceOrigin;
  declaredKind?: SourceKind;
  authorityClass?: SourceAuthorityClass;
  authorityFamily?: string;
  evidenceType?: SourceEvidenceType;
  qualityTier?: "vetted";
  citationVerified?: boolean;
  researchPolicyVersion?: string;
  retrievedAt?: string;
  reputationRationale?: string;
  limitations?: string;
  publicationStatus?: "released";
  statusCheck?: "released-no-withdrawal-found";
  researchResponseId?: string;
  researchCallIds?: string[];
  evidenceClaims?: Array<{ id: string; claim: string; locator?: string }>;
  evidenceValidationResponseId?: string;
  evidenceValidationCallIds?: string[];
}

export type LessonCitationSection =
  | "learning_objective"
  | "connection"
  | "content"
  | "key_takeaway"
  | "experience"
  | "guided_practice"
  | "transfer_task"
  | "visual"
  | "interaction"
  | "quiz"
  | "quiz_explanation";

export interface LessonCitation {
  id: string;
  sourceId: string;
  evidenceClaimId?: string;
  claim: string;
  section: LessonCitationSection;
  locator?: string;
  objectiveIds?: string[];
  reviewStatus?: SourceReviewStatus;
  reviewedAt?: string;
  supportStatus?: "supported";
  supportEvaluatorVersion?: string;
  supportFingerprint?: string;
  supportedAt?: string;
}

export type LessonExperience =
  | { type: "concept"; predictionPrompt: string; mentalModel: { title: string; parts: Array<{ label: string; role: string }> }; misconceptionCheck: { claim: string; correction: string } }
  | { type: "worked-example"; scenario: string; steps: Array<{ title: string; reasoning: string; output: string }>; fadingPrompt: string }
  | { type: "comparison"; options: string[]; criteria: Array<{ criterion: string; first: string; second: string }>; boundaryCase: { prompt: string; resolution: string } }
  | { type: "case-study"; brief: string; evidence: Array<{ label: string; detail: string }>; interpretations: string[]; decisionPrompt: string }
  | { type: "practice-lab"; brief: string; materials: string[]; tasks: string[]; artifactPrompt: string; successCriteria: string[] }
  | { type: "synthesis"; challenge: string; connections: Array<{ concept: string; contribution: string }>; capstoneContribution: string; reflectionPrompt: string };

export interface LessonSummary {
  title: string;
  concept: string;
  lessonKind?: LessonKind;
  estimatedMinutes?: number;
  objective?: string;
  lessonMode?: LessonMode;
  buildsOn?: string[];
  misconception?: string;
  practiceType?: PracticeType;
  masteryCriteria?: string;
  activityPreview?: string;
  artifactContribution?: string;
  objectiveId?: string;
  sourceIds?: string[];
  contentBasis?: LessonContentBasis;
}

export interface CourseModule {
  title: string;
  description?: string;
  objective?: string;
  objectiveId?: string;
  challenge?: {
    title: string;
    prompt: string;
    successCriteria: string[];
    objectiveIds?: string[];
  };
  milestone?: {
    title: string;
    deliverable: string;
    evidence: string;
  };
  lessons: LessonSummary[];
}

export interface CourseBanner {
  assetId: string;
  version: 1;
  generatedAt?: string;
}

export interface Course {
  id?: string;
  courseId?: string;
  topic: string;
  mission?: string;
  modules: CourseModule[];
  objectives?: Array<{
    id: string;
    description: string;
    level: "course" | "module" | "lesson";
    required: boolean;
  }>;
  /** Server-side ownership field. Public API responses omit this value. */
  authorId?: string;
  authorName?: string;
  canManage?: boolean;
  isPublic?: boolean;
  level?: "Foundations" | "Intermediate" | "Advanced";
  estimatedMinutes?: number;
  outcome?: string;
  prerequisites?: string[];
  category?: string;
  audience?: string;
  language?: string;
  freshnessRequired?: boolean;
  pipelineCorrelationId?: string;
  pipelineStage?: CourseStage;
  pipelineStageUpdatedAt?: string;
  publishedReleaseId?: string;
  courseSchemaVersion?: number;
  qualityContractVersion?: string;
  generationPromptVersion?: string;
  repairPromptVersion?: string;
  semanticEvaluatorVersion?: string;
  semanticEvaluatorStatus?: "executed" | "not_executed";
  repairPromptStatus?: "executed" | "not_executed";
  generationProvider?: string;
  labRegistryVersion?: string;
  visualPolicyVersion?: string;
  sourcePolicyVersion?: string;
  learningDesignRequired?: boolean;
  learningDesignContractVersion?: string;
  /** Private authoring contract. Public DTOs expose only learningDesignSummary. */
  learningDesign?: LearningDesignContractV1;
  learningDesignSummary?: {
    contractVersion: string;
    desiredOutcome: string;
    proofOfSkill: string;
    successCriteria: string[];
    timeBudgetMinutes: number;
    lessonWins: Array<{ lessonId: string; objectiveId: string; singleWin: string; estimatedMinutes: number }>;
  };
  sourceGroundingEvaluatorVersion?: string;
  sourceGroundingEvaluatorStatus?: "executed" | "not_executed" | "not_applicable";
  sourceGroundingFingerprint?: string;
  sourceGroundingAssessments?: Array<{
    moduleIndex: number;
    lessonIndex: number;
    sourceId: string;
    evidenceClaimIds: string[];
    verdict: "supported" | "partial" | "unsupported";
    rationale: string;
  }>;
  manualReviewPolicy?: { version: string; required: boolean; reasonCodes: string[] };
  manualReviewResolution?: {
    status: "approved" | "rejected";
    snapshotHash: string;
    contractVersion: string;
    reason: string;
    reviewedAt: string;
    reviewId: string;
    verifiedSourceIds?: string[];
  };
  artifact?: { title: string; description: string; format: string };
  scenario?: { title: string; context: string; stakes: string };
  sourcePack?: CourseSource[];
  furtherReading?: CourseFurtherReading[];
  evidenceProfile?: CourseEvidenceProfile;
  banner?: CourseBanner;
  generatedLessonIds?: string[];
  moderationStatus?: "approved" | "quarantined";
  publicationReview?: {
    status: "approved" | "owner_override";
    reviewedAt?: string;
    moderationModel?: string;
    reviewVersion?: string;
    factualReviewStatus?: "unverified";
    safetyReviewBasis?: string;
  };
  updatedAt?: string;
  aiAssisted?: boolean;
  generationGrant?: {
    version: string;
    claimId: string;
    lessonIds: string[];
    redeemedAt: string;
    status: "active" | "revoked";
  };
  schemaVersion?: number;
  capstone?: {
    title: string;
    brief: string;
    deliverable: string;
    successCriteria: string[];
    objectiveIds?: string[];
  };
  milestone?: {
    title: string;
    deliverable: string;
    evidence: string;
  };
  contentIntegrity?: {
    repairedForDisplay: boolean;
  };
}

export interface Quiz {
  id?: string;
  variantFamilyId?: string;
  intendedUse?: "initial" | "review" | "both";
  difficulty?: "foundation" | "contrast" | "transfer";
  misconceptionId?: string;
  assessmentId?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  optionFeedback?: string[];
  objectiveIds?: string[];
}

export interface LessonData {
  content: string;
  quizzes: Quiz[];
  lessonKind?: LessonKind;
  contentBasis?: LessonContentBasis;
  aiAssisted?: boolean;
  learningObjective?: string;
  objectiveIds?: string[];
  lessonDesign?: LessonDesignPlanV1;
  connection?: string;
  keyTakeaways?: string[];
  experience?: LessonExperience;
  /**
   * Curated, structured visual explanations. Legacy diagram fields are
   * intentionally excluded: lessons now render only this safe visual grammar.
   */
  visuals?: LessonVisual[];
  /** Safe, optional practice widgets selected from the app's interaction grammar. */
  interactions?: LessonInteraction[];
  citations?: LessonCitation[];
  labPlan?: {
    applicability: "required" | "recommended" | "not_applicable";
    rationale: string;
    objectiveIds: string[];
    registryVersion: string;
  };
  visualPlan?: {
    applicability: "essential" | "helpful" | "decorative_only" | "not_useful";
    rationale: string;
    objectiveIds: string[];
    policyVersion: string;
    accessibleFallback?: {
      kind: "text" | "table";
      content: string;
    };
  };
  guidedPractice?: {
    prompt: string;
    steps: string[];
    modelAnswer: string;
  };
  transferTask?: {
    prompt: string;
    successCriteria: string[];
    modelResponse: string;
    criterionIds?: string[];
  };
  provenance?: {
    contentVersion: string;
    generatedAt?: string;
    generationModel?: string;
    promptVersion?: string;
    qualityGateVersion?: string;
    interactionQualityGateVersion?: string;
    sources: Array<{
      id?: string;
      label: string;
      url?: string;
      author?: string;
      publisher?: string;
      publicationDate?: string;
      accessedAt?: string;
      kind?: SourceKind;
      rights?: SourceRights;
      reviewStatus?: SourceReviewStatus;
      reviewedAt?: string;
      origin?: SourceOrigin;
      authorityClass?: SourceAuthorityClass;
      evidenceType?: SourceEvidenceType;
      qualityTier?: "vetted";
      citationVerified?: boolean;
      researchPolicyVersion?: string;
      retrievedAt?: string;
      publicationStatus?: "released";
      statusCheck?: "released-no-withdrawal-found";
    }>;
    citations: LessonCitation[];
    qualityContractVersion?: string;
    repairPromptVersion?: string;
    semanticEvaluatorVersion?: string;
    semanticEvaluatorStatus?: "executed" | "not_executed";
    repairPromptStatus?: "executed" | "not_executed";
    generationProvider?: string;
    labRegistryVersion?: string;
    visualPolicyVersion?: string;
    sourcePolicyVersion?: string;
    learningDesignContractVersion?: string;
    claimSupportEvaluatorVersion?: string;
    contentBasis?: LessonContentBasis;
    claimSupportEvaluatorStatus?: "executed" | "not_executed" | "not_applicable";
    claimSupportFingerprint?: string;
  };
}

export type LearnerPlan = "free" | "plus" | "pro";
export type AccessLevel = "anonymous" | "free" | "plus" | "pro" | "owner";
export type AccountStatus = "active" | "suspended";

export interface AiQuotaSummary {
  feature: "course_outline" | "course_banner" | "lesson_generation" | "tutor" | "flashcard_generation";
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string;
}

export interface LearnerAccount {
  access: AccessLevel;
  plan: LearnerPlan;
  isOwner: boolean;
  accountStatus: AccountStatus;
  suspensionReason?: string;
  displayName?: string;
  photoURL?: string;
  subscriptionStatus?: "none" | "trialing" | "active" | "past_due" | "canceled";
  billingInterval?: "monthly" | "annual";
  currentPeriodEnd?: string;
  acceptedTermsVersion?: string;
  acceptedPrivacyVersion?: string;
  legalAcceptanceRequired?: boolean;
  applicationAccountExists?: boolean;
  capabilities: {
    createCourse: boolean;
    generateLesson: boolean;
    flashcardDecksEnabled?: boolean;
    createCustomFlashcardDeck: boolean;
    publishCourse: boolean;
    advancedCapstoneAnalysis: boolean;
    exportEvidenceReport: boolean;
    shareEvidenceReport: boolean;
  };
  courseCredits: {
    balance: number | null;
    monthlyAllocation: number | null;
    balanceCap: number | null;
    nextAccrualAt: string | null;
    frozenUntil: string | null;
  };
  quotas: AiQuotaSummary[];
}
