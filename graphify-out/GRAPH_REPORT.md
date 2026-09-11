# Graph Report - filosage  (2026-09-11)

## Partial Refresh Provenance
- Original full extraction: 2026-08-13, commit `088b21104634da24daa9427f73fc2c09ac907580`.
- Cleanup verified against `575525880ae9af4614cda93098b020871b81749b` on 2026-09-11; no new source extraction was performed.
- Removed 86 obsolete symbol records and 591 incident edges after confirming the source files or symbols no longer exist.
- Unaffected graph records and community assignments are preserved. The remaining members of community 58 all come from `src/lib/local-store.ts`, so its label is corrected to Local Document Store.
- Cache and manifest entries for the affected source files are invalidated so a future extraction cannot reuse them.

## Corpus Check
- Partial stale-record cleanup only; the August 13 source graph has not been fully refreshed. Unaffected nodes, edges and community assignments retain their original provenance.

## Summary
- 2238 nodes · 5993 edges · 130 communities (108 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 71 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Support Operations
- Admin and Analytics
- Command Center Operations 10
- Adaptive Mastery Loop 11
- Course Quality Pipeline 12
- Course Quality Pipeline 14
- Course Quality Pipeline 15
- Azure Release Platform
- Billing and Subscriptions 17
- Azure Release Platform 18
- Billing and Subscriptions 19
- Adaptive Mastery Loop
- Command Center Operations 20
- Billing and Subscriptions 21
- Lesson Learning Experience 22
- Lesson Learning Experience 24
- Azure Release Platform 25
- Privacy and Consent
- Adaptive Mastery Loop 27
- Lesson Learning Experience 28
- Billing and Subscriptions 29
- Course Management
- Lesson Learning Experience 33
- Command Center Operations 35
- Adaptive Mastery Loop 36
- Billing and Subscriptions 37
- Lesson Learning Experience 38
- Course Management 39
- Lesson Learning Experience
- Identity and Accounts
- Support Operations 41
- Brand and Visual System 42
- Azure Release Platform 44
- Outcome Evidence System
- Identity and Accounts 47
- Billing and Subscriptions 48
- Lesson Learning Experience 49
- Billing and Subscriptions
- Outcome Evidence System 50
- Lesson Learning Experience 52
- Outcome Evidence System 53
- Lesson Learning Experience 55
- Lesson Learning Experience 56
- Lesson Learning Experience 57
- Local Document Store
- Lesson Learning Experience 6
- Lesson Learning Experience 60
- Privacy and Consent 61
- content language
- Adaptive Mastery Loop 65
- Application Security
- Support Operations 67
- Lesson Learning Experience 69
- Billing and Subscriptions 70
- telemetry route
- Command Center Operations 72
- Billing and Subscriptions 73
- Application Security 77
- Lesson Learning Experience 80
- Course Quality Pipeline 81
- Lesson Learning Experience 82
- Lesson Learning Experience 83
- Lesson Learning Experience 84
- Billing and Subscriptions 85
- Lesson Learning Experience 86
- Command Center Operations
- Course Management 92
- Course Management 94
- Admin and Analytics 104
- Support Operations 105
- create layout
- Outcome Evidence System 107
- Course Management 108
- Billing and Subscriptions 109
- Privacy and Consent 110
- Learner Progress Profile
- Learner Progress Profile 112
- Adaptive Mastery Loop 113
- standard layout
- Support Operations 115
- Privacy and Consent 32
- Azure Release Platform 34
- Lesson Learning Experience 43
- Brand and Visual System 45
- Course Quality Pipeline 51
- Support Operations 63
- Quality Tooling 75
- Azure Release Platform 76
- Marketing Experience
- Adaptive Mastery Loop 88
- Quality Tooling 90
- Support Operations 91
- Quality Tooling 95
- Navigation and Search
- check release env mjs
- Azure Release Platform 103
- Quality Tooling 118
- Azure Release Platform 120
- dom
- Quality Tooling
- Azure Release Platform 30
- Command Center Operations 54
- package
- release scripts spec
- Application Security 99
- Billing and Subscriptions 68
- Support Operations 101
- Filosage Photography Guidance
- Command Center Operations 116
- Brand and Visual System 117
- Arrow Right Interface Icon
- Filosage Light Theme Icon Asset
- Subtle Dot Grid Pattern
- Teal Blue Coral Gradient Mesh
- Filosage Press Kit Cover
- Brand and Visual System
- Lesson Learning Experience 59
- Course Quality Pipeline
- Outcome Evidence System 74
- Lesson Learning Experience 8
- Course Quality Pipeline 87
- Command Center Operations 89
- Command Center Operations 93
- Filosage Dashboard Desktop Screenshot

## God Nodes (most connected - your core abstractions)
1. `authorizationResponse()` - 100 edges
2. `apiRequestErrorResponse()` - 81 edges
3. `readJsonBody()` - 69 edges
4. `requireAcceptedAccount()` - 48 edges
5. `useAuth()` - 47 edges
6. `Course` - 44 edges
7. `POST()` - 42 edges
8. `POST()` - 31 edges
9. `serverEnvironment` - 30 edges
10. `safeModelErrorDetails()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Gateway-and-Path Visual Language` --implements--> `Clarity, Practice, and Transfer Message`  [INFERRED]
  docs/brand/README.md → public/brand/banners/about-page-banner.svg
- `Gateway-and-Path Visual Language` --implements--> `Useful Knowledge Editorial Message`  [INFERRED]
  docs/brand/README.md → public/brand/banners/blog-header.svg
- `Gateway-and-Path Visual Language` --implements--> `Wide Light Learning Path Motif`  [INFERRED]
  docs/brand/README.md → public/brand/backgrounds/hero-light.svg
- `Evidence-Based Learning Records` --semantically_similar_to--> `Evidence-First Mastery Graph`  [INFERRED] [semantically similar]
  .agents/skills/teach/LEARNING-RECORD-FORMAT.md → docs/MASTERY_GRAPH_TECHNICAL_DESIGN.md
- `Filosage Design System` --implements--> `Filosage Dark-Theme Brand Mark`  [EXTRACTED]
  DESIGN.md → art_src/brand/filosage-dark-theme-original.png

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Immutable QA-to-Production Azure Release Pipeline** — github_workflows_azure_qa_isolated_qa, github_workflows_azure_staging_qa_approved_staging, github_workflows_azure_promote_staging_traffic_promotion, docs_production_operations_blue_green_operations [EXTRACTED 1.00]
- **Outcome-to-Evidence Learning Loop** — product_filosage_product_contract, docs_phase_1_implementation_outcome_validation_loop, docs_mastery_graph_technical_design_evidence_first_mastery_graph, docs_product_and_business_roadmap_outcome_focused_strategy [EXTRACTED 1.00]
- **Safe Draft-Only Command Center Automation** — docs_agent_command_center_agents_domain_agents, docs_agent_command_center_approval_model_non_executing_approval, docs_agent_command_center_architecture_command_center_architecture, docs_agent_command_center_hybrid_semi_autonomous_implementation_plan_durable_safe_automation [EXTRACTED 1.00]
- **Snapshot-Bound Authoring Pipeline** — docs_course_pipeline_v2_quality_contract_typed_diagnostics, docs_course_pipeline_v2_repair_protocol_allowlisted_snapshot_repair, docs_course_pipeline_v2_release_evidence_immutable_public_release, docs_course_pipeline_v2_current_system_map_snapshot_bound_pipeline [EXTRACTED 1.00]
- **Filosage Logo Asset System** — public_brand_logo_browser_icon, public_brand_logo_filosage_icon, public_brand_logo_filosage_stripe_icon, public_brand_logo_filosage_stripe_logo, public_brand_logo_filosage_theme_dark, public_brand_logo_filosage_theme_light, public_brand_logo_filosage_dark_placement, public_brand_logo_filosage_horizontal, public_brand_logo_filosage_light_placement, public_brand_logo_filosage_social_avatar, src_app_icon [INFERRED 0.95]
- **Filosage Social and Marketing Asset Suite** — public_brand_banners_call_to_action_banner, public_brand_banners_main_website_banner, public_brand_banners_open_graph, public_brand_banners_social_sharing_fallback, public_brand_social_open_graph, public_brand_social_social_sharing_fallback, public_brand_social_github_social_preview, public_brand_social_launch_announcement, public_brand_social_linkedin_company_banner, public_brand_social_newsletter_header, public_brand_social_press_kit_cover, public_brand_social_product_announcement, public_brand_social_x_profile_header [INFERRED 0.95]
- **Filosage Learning Feature Illustration Set** — public_brand_illustrations_abstract_learning, public_brand_illustrations_ai_explanations, public_brand_illustrations_concept_mastery, public_brand_illustrations_desktop_product_frame, public_brand_illustrations_learning_paths, public_brand_illustrations_personalized_practice, public_brand_illustrations_progress_tracking, public_brand_illustrations_topic_exploration [INFERRED 0.95]
- **Owner Canary Release Evidence Chain** — docs_course_pipeline_v2_evaluation_results_deterministic_calibration_outcome, docs_course_pipeline_v2_reviews_2026_08_11_pass_5_owner_canary_go_decision, docs_course_pipeline_v2_release_evidence_owner_only_canary, docs_course_pipeline_v2_rollout_and_rollback_artifact_scoped_rollout [INFERRED 0.95]
- **Responsive Brand Path System** — public_brand_backgrounds_hero_dark_mobile_vertical_learning_path, public_brand_backgrounds_hero_dark_wide_learning_path, public_brand_backgrounds_hero_light_mobile_vertical_learning_path, public_brand_backgrounds_hero_light_wide_learning_path, docs_brand_readme_gateway_path_visual_language [INFERRED 0.95]

## Communities (130 total, 22 thin omitted)

### Community 0 - "Support Operations"
Cohesion: 0.05
Nodes (41): SupportArticlePageProps, SupportArticle, SupportCategory, SupportCategoryId, Environment, GET(), generateMetadata(), RootLayout() (+33 more)

### Community 1 - "Admin and Analytics"
Cohesion: 0.06
Nodes (45): AdminTab, AppShellProps, AuthModalProps, CommandPaletteItem, CommandPaletteProps, Commitment, FilosageMarkProps, BrandLogoProps (+37 more)

### Community 10 - "Command Center Operations 10"
Cohesion: 0.21
Nodes (27): CommandCenterPermission, CommandCenterUnavailableError, PATCH(), POST(), PATCH(), PATCH(), POST(), GET() (+19 more)

### Community 11 - "Adaptive Mastery Loop 11"
Cohesion: 0.13
Nodes (31): AdaptiveReviewCandidate, AdaptiveSchedule, DailyMission, ForwardMission, WeeklyMilestone, CourseLessonProgress, Confidence, ConfidenceCalibration (+23 more)

### Community 12 - "Course Quality Pipeline 12"
Cohesion: 0.09
Nodes (26): ExpectedRoute, TopicCase, CourseArtifactProvenance, IssueSeverity, IssueSource, LabApplicability, Repairability, ValidationIssue (+18 more)

### Community 14 - "Course Quality Pipeline 14"
Cohesion: 0.23
Nodes (21): RepairOperation, RepairPlan, POST(), finishRepairStage(), POST(), PATCH(), GET(), courseUsesPipelineV2() (+13 more)

### Community 15 - "Course Quality Pipeline 15"
Cohesion: 0.11
Nodes (26): AiExecutionProfile, AiExecutionProfileId, AiReasoningEffort, AiTextVerbosity, ProfileSpec, lessonInstructions(), POST(), languagePolicyInstruction() (+18 more)

### Community 16 - "Azure Release Platform"
Cohesion: 0.07
Nodes (30): EasyAuthClaim, EasyAuthPrincipal, EasyAuthVerifiedIdentity, claimValue(), decodedPrincipal(), easyAuthIdentityFromHeaders(), integerClaim(), verifiedEasyAuthUser() (+22 more)

### Community 17 - "Billing and Subscriptions 17"
Cohesion: 0.11
Nodes (24): CommandCenterDraftEvaluationCase, EvaluatedCommandCenterDraft, EvaluationCheck, EvaluationExpectation, CommandCenterDraftPromptInput, run(), selectedCases(), usageSample() (+16 more)

### Community 18 - "Azure Release Platform 18"
Cohesion: 0.14
Nodes (22): VerifiedUser, GET(), GET(), getExistingAccount(), isOwnerUser(), premiumEmailSet(), resolveAccount(), hasCurrentLegalAcceptance() (+14 more)

### Community 19 - "Billing and Subscriptions 19"
Cohesion: 0.14
Nodes (29): ResolvedAccountState, ServerAccount, AdminFeatureUsage, AdminOverview, AdminUserSummary, OperationalReadinessControl, AiBudgetPool, AiFeature (+21 more)

### Community 2 - "Adaptive Mastery Loop"
Cohesion: 0.07
Nodes (41): CourseDisclosureProps, OutcomePlannerProps, TokenUser, BaselineAssessment, CapstoneAssessment, BaselineLevel, DiagnosticItem, EvidenceResult (+33 more)

### Community 20 - "Command Center Operations 20"
Cohesion: 0.08
Nodes (28): UserTicketInput, CommandCenterApproval, CommandCenterApprovalActionType, CommandCenterApprovalStatus, CommandCenterAuditEvent, CommandCenterControls, CommandCenterDraft, CommandCenterDraftAgentType (+20 more)

### Community 21 - "Billing and Subscriptions 21"
Cohesion: 0.17
Nodes (28): billingWebhookClaimDisposition, BillingConsentRequiredError, claimEvent(), currentSubscription(), currentSubscriptionPayment(), invoiceForCharge(), latestInvoiceId(), POST() (+20 more)

### Community 22 - "Lesson Learning Experience 22"
Cohesion: 0.09
Nodes (23): ComparisonMatrixVisual, ConceptContrastVisual, LessonVisualBase, LessonVisualContext, LessonVisualPlacement, PrerequisiteMapVisual, ProcessFlowVisual, WorkedExampleTraceVisual (+15 more)

### Community 24 - "Lesson Learning Experience 24"
Cohesion: 0.18
Nodes (22): RouteParams, PublishedReleaseUnavailableError, lessonTitle(), POST(), GET(), GET(), GET(), asCourseProgress() (+14 more)

### Community 25 - "Azure Release Platform 25"
Cohesion: 0.14
Nodes (24): RouteParams, CourseBannerPromptInput, CourseBannerInput, CourseBannerResult, CourseBanner, decodeBase64(), GET(), buildCourseBannerPrompt() (+16 more)

### Community 26 - "Privacy and Consent"
Cohesion: 0.16
Nodes (25): AnalyticsConsent, ProductEventOptions, AcquisitionContext, ProductEventRoute, PrivacyCenterPage(), serverConsentSnapshot(), AnalyticsConsent(), serverConsentSnapshot() (+17 more)

### Community 27 - "Adaptive Mastery Loop 27"
Cohesion: 0.22
Nodes (21): BadgeFilter, CourseProgress, ProfilePage(), dateKey(), ProgressPage(), EvidencePortfolio(), MasteryPath(), masteryState() (+13 more)

### Community 28 - "Lesson Learning Experience 28"
Cohesion: 0.09
Nodes (28): InteractionItemEvidence, MorsePair, SequenceInteraction, deriveMorseRecognition(), editDistance(), interactionQualityIssues(), morsePairs(), neutralSequenceLabel() (+20 more)

### Community 29 - "Billing and Subscriptions 29"
Cohesion: 0.18
Nodes (23): MembershipPriceEnvironment, RecurringPriceSnapshot, StripePricePlanMapping, BillingInterval, PaidLearnerPlan, PlanCapability, PricingPage(), renewalLabel() (+15 more)

### Community 3 - "Course Management"
Cohesion: 0.07
Nodes (43): DashboardCustomizerProps, LearningScheduleSettingsProps, CourseReferenceCleanup, DashboardMainSection, DashboardMetric, DashboardPreferences, DashboardPreset, DashboardSection (+35 more)

### Community 33 - "Lesson Learning Experience 33"
Cohesion: 0.17
Nodes (22): LessonData, SourceKind, SourceRights, InteractionReceiptClaims, LessonInteraction, LessonVisual, GET(), loadRecognition() (+14 more)

### Community 35 - "Command Center Operations 35"
Cohesion: 0.12
Nodes (22): ApprovalDecision, CommandCenterView, DraftDecision, TicketField, TicketFormErrors, agentForTicket(), ApprovalInspector(), CommandCenterPage() (+14 more)

### Community 36 - "Adaptive Mastery Loop 36"
Cohesion: 0.14
Nodes (18): RouteParams, ModelFallbackResult, RunWithModelFallbackOptions, PublicationReviewError, POST(), DELETE(), requireRecentlyAuthenticatedOwner(), reconcileCourseCapacity() (+10 more)

### Community 37 - "Billing and Subscriptions 37"
Cohesion: 0.16
Nodes (21): RateLimitBucket, POST(), feedbackDocumentId(), POST(), emailFingerprint(), GET(), POST(), publicIntent() (+13 more)

### Community 38 - "Lesson Learning Experience 38"
Cohesion: 0.10
Nodes (24): GeneratedLessonData, GET(), noteDocumentId(), notePath(), objectStrings(), containsSerializedCriterionList(), defaults, lessonInteractionsSchema (+16 more)

### Community 39 - "Course Management 39"
Cohesion: 0.10
Nodes (20): PublicationAssessmentState, AppDrawerProps, DrawerController, DrawerPlacement, DrawerSize, MobileDrawerPlacement, CourseBannerProps, SpeakButtonProps (+12 more)

### Community 4 - "Lesson Learning Experience"
Cohesion: 0.20
Nodes (4): LessonSavePipelineGuard, PublicationLessonReview, PublicationOwnerOverride, buildGuardedLessonSave()

### Community 40 - "Identity and Accounts"
Cohesion: 0.18
Nodes (23): AuthContextValue, pendingGoogleRedirectAcceptance, LearnerAccount, EasyAuthSessionResponse, FilosageUser, authErrorMessage(), AuthProvider(), localOwnerUser() (+15 more)

### Community 41 - "Support Operations 41"
Cohesion: 0.11
Nodes (21): SupportCenterProps, SupportView, TicketDraft, TicketErrors, TicketField, LearnerSupportCategory, LearnerSupportReply, LearnerSupportStatus (+13 more)

### Community 42 - "Brand and Visual System 42"
Cohesion: 0.19
Nodes (18): RouteParams, AiPolicy, AiQuotaError, AiQuotaSummary, POST(), aiBudgetLimitsUsd(), budgetPoolFor(), budgetShardFor() (+10 more)

### Community 44 - "Azure Release Platform 44"
Cohesion: 0.21
Nodes (23): ActiveTransaction, DocumentRow, StructuredQuery, applyWrites(), beginTransaction(), commitWithoutExistingTransaction(), countStructuredQuery(), createDocument() (+15 more)

### Community 46 - "Outcome Evidence System"
Cohesion: 0.30
Nodes (18): AiReservation, ContentSafetyError, CapstoneRevision, POST(), POST(), POST(), PUT(), aiQuotaResponse() (+10 more)

### Community 47 - "Identity and Accounts 47"
Cohesion: 0.17
Nodes (13): AuthorizationError, DELETE(), GET(), GET(), POST(), GET(), getVerifiedUser(), requireOwner() (+5 more)

### Community 48 - "Billing and Subscriptions 48"
Cohesion: 0.17
Nodes (17): AiUsageSample, ModelRates, OutlineLike, CourseCapacityError, CourseCapacityReservation, POST(), estimateAiUsageCostMicros(), ratesForModel() (+9 more)

### Community 49 - "Lesson Learning Experience 49"
Cohesion: 0.20
Nodes (17): ActivityReceiptClaims, numberValue(), POST(), activityDocumentId(), base64Url(), decodeBase64Url(), signActivityReceipt(), signingKey() (+9 more)

### Community 5 - "Billing and Subscriptions"
Cohesion: 0.12
Nodes (38): BillingEnvironment, BillingEventCursor, BillingPaymentState, StoredSubscriptionStatus, BillingPaymentSnapshot, CheckoutClaim, accountDeletionBlocksCheckout(), accountDeletionRequiresStripeReconciliation() (+30 more)

### Community 50 - "Outcome Evidence System 50"
Cohesion: 0.17
Nodes (16): OperationalAlertContext, OperationalAlertDeliveryResult, OperationalAlertEnvelope, OperationalAlertEvent, OperationalAlertSeverity, deliverScriptAlert(), writeEvidenceFile(), createOperationalAlertEnvelope() (+8 more)

### Community 52 - "Lesson Learning Experience 52"
Cohesion: 0.09
Nodes (15): MigrationBundle, MigrationBundle, MigrationBundle, FieldFilter, FieldFilter, lesson(), completed, inputArgument (+7 more)

### Community 53 - "Outcome Evidence System 53"
Cohesion: 0.18
Nodes (15): SourceDraft, Theme, CreateCoursePage(), emptySource(), OutcomeUsefulness(), applyTheme(), persistTheme(), storedTheme() (+7 more)

### Community 55 - "Lesson Learning Experience 55"
Cohesion: 0.16
Nodes (15): PublicationDecision, CourseSource, PublicationAssessment, PublicationAssessmentIssue, PublicationIssueCategory, CoursePublishReadiness, PublicationLessonFailure, assessCourseForPublication() (+7 more)

### Community 56 - "Lesson Learning Experience 56"
Cohesion: 0.17
Nodes (13): InteractionAttemptMetadata, buildInteractionAttemptMutation(), integerValue(), courseReviewPolicyForBrief(), effectiveCourseReviewPolicy(), assertCourseStageTransition(), canTransitionCourseStage(), compactValidLesson() (+5 more)

### Community 57 - "Lesson Learning Experience 57"
Cohesion: 0.21
Nodes (13): LessonKind, LessonMode, ExperienceEvidence, lessonQualityIssues(), comparableHeading(), hasBlockMarkdownSyntax(), hasCollapsedMarkdownTable(), hasMarkdownTableSyntax() (+5 more)

### Community 58 - "Local Document Store"
Cohesion: 0.18
Nodes (13): StoreShape, StructuredQuery, applyWrite(), compare(), documentName(), filterValue(), listCollection(), matchesFilter() (+5 more)

### Community 6 - "Lesson Learning Experience 6"
Cohesion: 0.10
Nodes (32): ActivitySection, ActivitySectionId, LessonPane, Message, QuizResult, LessonView(), randomIndex(), randomizeQuizAnswers() (+24 more)

### Community 60 - "Lesson Learning Experience 60"
Cohesion: 0.19
Nodes (15): LessonStudyToolsProps, ReviewRating, ReviewSession, StudyFlashcard, StudyTool, Quiz, buildLessonFlashcards(), concise() (+7 more)

### Community 61 - "Privacy and Consent 61"
Cohesion: 0.14
Nodes (10): OwnerDocumentation, OwnerDocumentationLink, OwnerDocumentationSection, OwnerDocumentationTopic, ownerDocumentation, PRIVACY_VERSION, TERMS_VERSION, authorization (+2 more)

### Community 62 - "content language"
Cohesion: 0.19
Nodes (16): ContentIntegrityIssue, ContentLanguagePolicy, ScriptName, firstArtifactIndex(), hasMalformedCharacters(), inspectGeneratedContent(), instructionLanguageIssue(), isMalformedCharacter() (+8 more)

### Community 65 - "Adaptive Mastery Loop 65"
Cohesion: 0.18
Nodes (12): AccountDeletionInventory, IdentifiedAccountDocument, AuthenticationClaims, accountDeletionDocumentPaths(), documentPaths(), authenticationClaimsFromIdToken(), decodeBase64Url(), acceptCurrentLegalTerms() (+4 more)

### Community 66 - "Application Security"
Cohesion: 0.23
Nodes (14): SafetyStage, assertLocallySafeContentBatch(), assertNoCooldown(), assertSafeContentBatch(), contentFingerprint(), localPolicyFlags(), numberValue(), recordBlockedRequest() (+6 more)

### Community 67 - "Support Operations 67"
Cohesion: 0.17
Nodes (8): Theme, openResearchTab(), prepareOwnerShell(), mockFreeLearnerAccount(), restoreLocalLearner(), learningProgress, ownedCourses, root

### Community 69 - "Lesson Learning Experience 69"
Cohesion: 0.16
Nodes (9): AchievementBadgeProps, BadgeContext, BadgeDefinition, BadgeFamily, BadgeIcon, EvaluatedBadge, AchievementBadge(), icons (+1 more)

### Community 70 - "Billing and Subscriptions 70"
Cohesion: 0.29
Nodes (11): CourseOwnerIdentity, collectAccountData(), DELETE(), downloadName(), emailFingerprint(), GET(), listCompleteAccountRecordsByField(), listCompleteAccountSubcollection() (+3 more)

### Community 71 - "telemetry route"
Cohesion: 0.25
Nodes (11): ServerRecordedProductEventName, documentRouteKey(), numberValue(), POST(), telemetrySchema, ACQUISITION_CHANNELS, ANONYMOUS_PRODUCT_EVENT_NAMES, PRODUCT_EVENT_NAMES (+3 more)

### Community 72 - "Command Center Operations 72"
Cohesion: 0.25
Nodes (12): CommandCenterDraftGenerationError, normalizeCommandCenterEvidenceReferences(), approvedSupportKnowledge(), assertAgentReady(), contextForAgent(), generateCommandCenterDraft(), normalizeContent(), ticketBlock() (+4 more)

### Community 73 - "Billing and Subscriptions 73"
Cohesion: 0.31
Nodes (12): MembershipAnalyticsRecord, SubscriptionStatus, allocatedPercents(), billingPlan(), calculateMembershipAnalytics(), effectiveMembershipPlan(), effectivePlan(), manualPlan() (+4 more)

### Community 77 - "Application Security 77"
Cohesion: 0.23
Nodes (9): RouteParams, ApiRequestError, PATCH(), emailFingerprint(), POST(), allowedOrigins(), assertTrustedMutation(), updateSchema (+1 more)

### Community 80 - "Lesson Learning Experience 80"
Cohesion: 0.29
Nodes (11): CourseOutline, CourseModule, LessonSummary, contentWords(), courseQualityIssues(), duplicateValues(), flattenedLessons(), modeIssues() (+3 more)

### Community 81 - "Course Quality Pipeline 81"
Cohesion: 0.33
Nodes (10): EvaluationCase, checksPassed(), help(), isProductionHost(), postJson(), run(), scoreCourse(), scoreLesson() (+2 more)

### Community 82 - "Lesson Learning Experience 82"
Cohesion: 0.24
Nodes (7): RecognitionInteraction, InteractiveLessonBlock(), playSignal(), recognitionEvidence(), RecognitionLab(), SignalLab(), signalUnits()

### Community 83 - "Lesson Learning Experience 83"
Cohesion: 0.25
Nodes (8): lessonGenerationGate, CourseStage, CoursePipelineEvent, CoursePipelineEventName, NextLesson, Course, writeCoursePipelineEvent(), findCourseLesson()

### Community 84 - "Lesson Learning Experience 84"
Cohesion: 0.36
Nodes (9): PracticeType, line(), localAiStub(), paragraph(), stubCapstoneVerdict(), stubCommandCenterDraft(), stubLesson(), stubUsage() (+1 more)

### Community 85 - "Billing and Subscriptions 85"
Cohesion: 0.29
Nodes (8): BillingAccountDeletionInProgressError, BillingCheckoutInProgressError, POST(), GET(), billingStatus(), isBillingInterval(), recordServerProductEvent(), billingConfiguration()

### Community 86 - "Lesson Learning Experience 86"
Cohesion: 0.24
Nodes (8): LessonExperienceState, LessonExperience, isReservedExperienceTask(), LessonExperience(), StructuredText(), RESERVED_EXPERIENCE_TASKS, responseLabels, titles

### Community 9 - "Command Center Operations"
Cohesion: 0.14
Nodes (36): CommandCenterConflictError, CommandCenterDisabledError, CommandCenterNotFoundError, commandCenterDraftsEnvironmentEnabled(), canTransitionCommandCenterTicket(), commandCenterApprovalIsExpired(), commandCenterDueAt(), commandCenterPriority() (+28 more)

### Community 92 - "Course Management 92"
Cohesion: 0.43
Nodes (6): CoursePipelineFlagActor, CoursePipelineFlags, actorIsEligible(), cohortPercentage(), enabled(), resolveCoursePipelineFeatureFlags()

### Community 94 - "Course Management 94"
Cohesion: 0.50
Nodes (3): CourseLayoutProps, generateMetadata(), readableTopic()

### Community 32 - "Privacy and Consent 32"
Cohesion: 0.14
Nodes (14): PrivacyPage(), TermsPage(), LegalDocument(), publicLegalDisclosure(), publicValue(), metadata, metadata, metadata (+6 more)

### Community 34 - "Azure Release Platform 34"
Cohesion: 0.08
Nodes (23): expectedDocumentData(), roots, accountUrl, apply, assetIds, bannerObjectIds, bundle, container (+15 more)

### Community 43 - "Lesson Learning Experience 43"
Cohesion: 0.18
Nodes (22): isLegacyCourseCandidate(), isLegacyLessonCandidate(), parseCourseCandidate(), parseLessonCandidate(), isLegacyRenderableInteractionType(), isRegisteredLabType(), issueFromRule(), inspectApplicabilityPlans() (+14 more)

### Community 45 - "Brand and Visual System 45"
Cohesion: 0.12
Nodes (21): campaign(), documentSvg(), featureIllustration(), heroBackground(), logoImage(), nodeNetwork(), save(), savePngFromSvg() (+13 more)

### Community 51 - "Course Quality Pipeline 51"
Cohesion: 0.19
Nodes (17): sanitizeGeneratedValue(), normalizeSuccessCriteria(), guidedPracticeDto(), lessonExperienceDto(), structuredText(), toLessonDto(), transferTaskDto(), lessonVisualsEnabled() (+9 more)

### Community 63 - "Support Operations 63"
Cohesion: 0.13
Nodes (13): extractArray(), args, articleDirectory, articleFiles, articles, changedFiles, errors, legalSource (+5 more)

### Community 75 - "Quality Tooling 75"
Cohesion: 0.21
Nodes (11): installPlaywrightServerLifecycle(), isStrictDescendant(), resetPlaywrightOwnedDirectory(), app, handle, port, server, testStoreDir (+3 more)

### Community 76 - "Azure Release Platform 76"
Cohesion: 0.15
Nodes (10): bannerById, bundle, databaseUrl, databaseUrlValue, hostOverride, inputArgument, inputBlobArgument, paths (+2 more)

### Community 79 - "Marketing Experience"
Cohesion: 0.23
Nodes (7): FeatureGrid(), HowItWorks(), LandingPage(), MarketingHero(), ProductMockup(), features, steps

### Community 88 - "Adaptive Mastery Loop 88"
Cohesion: 0.31
Nodes (8): assertCourseAccess(), GET(), POST(), PUT(), diagnosticSchema, evidenceSchema, planSchema, EVIDENCE_TYPES

### Community 90 - "Quality Tooling 90"
Cohesion: 0.32
Nodes (4): configuredPort(), playwrightServerSettings(), ownedProjects, server

### Community 91 - "Support Operations 91"
Cohesion: 0.36
Nodes (7): GET(), idempotencyKey(), POST(), commandCenterEnvironmentEnabled(), listUserCommandCenterTickets(), requestContextSchema, supportTicketSchema

### Community 95 - "Quality Tooling 95"
Cohesion: 0.70
Nodes (4): delay(), processIsRunning(), stopOwnedServer(), stopOwnedServers()

### Community 96 - "Navigation and Search"
Cohesion: 0.40
Nodes (3): copyBans, root, sourceRoot

### Community 100 - "check release env mjs"
Cohesion: 0.50
Nodes (3): activationMode, missing, required

### Community 13 - "dom"
Cohesion: 0.06
Nodes (32): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+24 more)

### Community 23 - "Quality Tooling"
Cohesion: 0.07
Nodes (29): devDependencies, @axe-core/playwright, eslint, @eslint/js, eslint-plugin-react-hooks, globals, @next/eslint-plugin-next, oxlint (+21 more)

### Community 30 - "Azure Release Platform 30"
Cohesion: 0.07
Nodes (27): dependencies, @azure/identity, @azure/storage-blob, @fontsource-variable/inter, lucide-react, next, openai, pg (+19 more)

### Community 54 - "Command Center Operations 54"
Cohesion: 0.11
Nodes (18): scripts, brand:assets, build, check:production, check:release, check:support-wiki, dev, eval:command-center (+10 more)

### Community 78 - "package"
Cohesion: 0.17
Nodes (11): name, overrides, brace-expansion, fast-uri, postcss, sharp, undici, ws (+3 more)

### Community 97 - "release scripts spec"
Cohesion: 0.40
Nodes (4): healthScript, releaseScript, root, validReleaseEnvironment

### Community 99 - "Application Security 99"
Cohesion: 0.50
Nodes (3): expectedOriginInput, expectedVersion, healthUrl

### Community 68 - "Billing and Subscriptions 68"
Cohesion: 0.19
Nodes (15): Stripe Sandbox Lifecycle Evidence, Draft-Only Agent Admission Contract, Bounded Draft-Only Domain Agents, Command Center Transactional Architecture, Command Center Billing-Event Boundary, Durable Privacy-Safe Semi-Autonomous Operations Plan, Owner-Only Agent Command Center, Billing Activation Contract (+7 more)

### Community 101 - "Support Operations 101"
Cohesion: 0.67
Nodes (3): Support Wiki Validation Workflow, Learner-Facing Support Wiki Authoring Contract, Pull Request Support-Wiki Impact Contract

### Community 102 - "Filosage Photography Guidance"
Cohesion: 0.67
Nodes (3): Editorial Realistic Learning Photography, Responsive AVIF and WebP Image Delivery, Filosage Photography Guidance

### Community 31 - "Brand and Visual System"
Cohesion: 0.08
Nodes (27): Complete Filosage Brand Migration, Brand and Domain Surface Inventory, Accessible Brand Usage, Gateway-and-Path Visual Language, Split Hero Learning Loop, Stacked Mobile Hero Learning Loop, Vertical Dark Learning Path Motif, Wide Dark Learning Path Motif (+19 more)

### Community 59 - "Lesson Learning Experience 59"
Cohesion: 0.14
Nodes (17): Canonical Learning Glossary, Evidence-Based Learning Records, Mission-Grounded Teaching, Trusted Knowledge and Wisdom Resources, Shared Professional Reasoning Concept Spine, Stateful Teaching Workspace, Evidence-Gated Product Experiment Registry, Founding Launch Catalog (+9 more)

### Community 7 - "Course Quality Pipeline"
Cohesion: 0.06
Nodes (38): Snapshot-Bound Course Pipeline, Deterministic Release Floor, Deterministic Calibration Outcome, Versioned Course Quality Contract, Recognition V2 Capability, Privacy-Safe Pipeline Events, Concise Substantive Lesson Boundary, Typed Quality Diagnostics (+30 more)

### Community 74 - "Outcome Evidence System 74"
Cohesion: 0.21
Nodes (13): Azure PostgreSQL Backup Verification Workflow, Azure Staging Traffic Promotion Workflow, Isolated Azure QA Deployment Workflow, QA-Approved Production Staging Workflow, Filosage Design System, Azure-Native Migration and Release Runbook, Azure Blue-Green Production Operations, Filosage Outcome-First Product Contract (+5 more)

### Community 8 - "Lesson Learning Experience 8"
Cohesion: 0.07
Nodes (38): Turn Curiosity into Understanding, Explain Practice Apply and Track Progress, Filosage Call to Action Banner, Filosage Main Website Banner, Filosage Open Graph Banner, Filosage Social Sharing Fallback Banner, Check Interface Icon, Coral Spark Interface Icon (+30 more)

### Community 87 - "Course Quality Pipeline 87"
Cohesion: 0.22
Nodes (9): Teaching Design Input to Runtime Contract, Untrusted Content Boundary, Application-Evidence Research Question, Behavioral Evidence Standard, Problem Strength Score, Course-Creation Skill Mapping, Course Pipeline Security Threat Model, Phase 0 Customer Interview Guide (+1 more)

### Community 89 - "Command Center Operations 89"
Cohesion: 0.25
Nodes (8): Passing Draft Model Contract, Kill-Switch Containment, Dual Command Center Enablement Gates, Seven-Case Live Model Gate, GPT-5.6 Terra V5 Evaluation, Command Center Incident Response, Command Center Operations, Command Center Test Strategy

### Community 93 - "Command Center Operations 93"
Cohesion: 0.29
Nodes (7): Unverified Copyright Claim Boundary, Human-Controlled Privacy Fulfillment, Append-Only Audit Limitation, Review-Only Draft Boundary, Copyright Intake Policy, Privacy Workflow Boundary, Command Center Security Controls

### Community 98 - "Filosage Dashboard Desktop Screenshot"
Cohesion: 0.50
Nodes (4): Desktop Learning Workspace Layout, Stacked Mobile Learning Workspace, Filosage Dashboard Desktop Screenshot, Filosage Dashboard Mobile Screenshot

## Knowledge Gaps
- **596 isolated node(s):** `SupportArticlePageProps`, `SupportArticle`, `Environment`, `AdminTab`, `AuthModalProps` (+591 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authorizationResponse()` connect `Command Center Operations 10` to `Course Quality Pipeline 14`, `Course Quality Pipeline 15`, `Azure Release Platform 18`, `Billing and Subscriptions 19`, `Lesson Learning Experience 24`, `Lesson Learning Experience 33`, `Adaptive Mastery Loop 36`, `Billing and Subscriptions 37`, `Lesson Learning Experience 38`, `Brand and Visual System 42`, `Outcome Evidence System`, `Identity and Accounts 47`, `Billing and Subscriptions 48`, `Lesson Learning Experience 49`, `Billing and Subscriptions 70`, `Application Security 77`, `Billing and Subscriptions 85`, `Adaptive Mastery Loop 88`, `Support Operations 91`, `Support Operations 105`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `Course` connect `Lesson Learning Experience 83` to `Admin and Analytics`, `Adaptive Mastery Loop`, `Lesson Learning Experience 6`, `Adaptive Mastery Loop 11`, `Course Quality Pipeline 14`, `Course Quality Pipeline 15`, `Lesson Learning Experience 24`, `Adaptive Mastery Loop 27`, `Lesson Learning Experience 33`, `Adaptive Mastery Loop 36`, `Course Management 39`, `Lesson Learning Experience 43`, `Outcome Evidence System`, `Lesson Learning Experience 49`, `Course Quality Pipeline 51`, `Lesson Learning Experience 55`, `Support Operations 67`, `Lesson Learning Experience 69`, `Lesson Learning Experience 80`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `serverEnvironment` connect `Azure Release Platform 18` to `Support Operations`, `Lesson Learning Experience 33`, `Application Security`, `Privacy and Consent 32`, `Billing and Subscriptions 37`, `Billing and Subscriptions`, `telemetry route`, `Brand and Visual System 42`, `Command Center Operations 10`, `Azure Release Platform 44`, `Application Security 77`, `Course Quality Pipeline 15`, `Lesson Learning Experience 49`, `Billing and Subscriptions 19`, `Lesson Learning Experience 84`, `Billing and Subscriptions 21`, `Azure Release Platform 25`, `Course Management 92`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `SupportArticlePageProps`, `SupportArticle`, `Environment` to the rest of the system?**
  _596 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Support Operations` be split into smaller, more focused modules?**
  _Cohesion score 0.05403508771929825 - nodes in this community are weakly interconnected._
- **Should `Admin and Analytics` be split into smaller, more focused modules?**
  _Cohesion score 0.05516431924882629 - nodes in this community are weakly interconnected._
- **Should `Adaptive Mastery Loop 11` be split into smaller, more focused modules?**
  _Cohesion score 0.1265597147950089 - nodes in this community are weakly interconnected._