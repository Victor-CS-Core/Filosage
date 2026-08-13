# Graph Report - filosage  (2026-08-13)

## Corpus Check
- 463 files · ~455,301 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2324 nodes · 6584 edges · 131 communities (109 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 75 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Support Operations
- Admin and Analytics
- Adaptive Mastery Loop
- Course Management
- Lesson Learning Experience
- Billing and Subscriptions
- Lesson Learning Experience 6
- Course Quality Pipeline
- Lesson Learning Experience 8
- Command Center Operations
- Command Center Operations 10
- Adaptive Mastery Loop 11
- Course Quality Pipeline 12
- dom
- Course Quality Pipeline 14
- Course Quality Pipeline 15
- Azure Release Platform
- Billing and Subscriptions 17
- Azure Release Platform 18
- Billing and Subscriptions 19
- Command Center Operations 20
- Billing and Subscriptions 21
- Lesson Learning Experience 22
- Quality Tooling
- Lesson Learning Experience 24
- Azure Release Platform 25
- Privacy and Consent
- Adaptive Mastery Loop 27
- Lesson Learning Experience 28
- Billing and Subscriptions 29
- Azure Release Platform 30
- Brand and Visual System
- Privacy and Consent 32
- Lesson Learning Experience 33
- Azure Release Platform 34
- Command Center Operations 35
- Adaptive Mastery Loop 36
- Billing and Subscriptions 37
- Lesson Learning Experience 38
- Course Management 39
- Identity and Accounts
- Support Operations 41
- Brand and Visual System 42
- Lesson Learning Experience 43
- Azure Release Platform 44
- Brand and Visual System 45
- Outcome Evidence System
- Identity and Accounts 47
- Billing and Subscriptions 48
- Lesson Learning Experience 49
- Outcome Evidence System 50
- Course Quality Pipeline 51
- Lesson Learning Experience 52
- Outcome Evidence System 53
- Command Center Operations 54
- Lesson Learning Experience 55
- Lesson Learning Experience 56
- Lesson Learning Experience 57
- Legacy Firebase Storage
- Lesson Learning Experience 59
- Lesson Learning Experience 60
- Privacy and Consent 61
- content language
- Support Operations 63
- Legacy Firebase Storage 64
- Adaptive Mastery Loop 65
- Application Security
- Support Operations 67
- Billing and Subscriptions 68
- Lesson Learning Experience 69
- Billing and Subscriptions 70
- telemetry route
- Command Center Operations 72
- Billing and Subscriptions 73
- Outcome Evidence System 74
- Quality Tooling 75
- Azure Release Platform 76
- Application Security 77
- package
- Marketing Experience
- Lesson Learning Experience 80
- Course Quality Pipeline 81
- Lesson Learning Experience 82
- Lesson Learning Experience 83
- Lesson Learning Experience 84
- Billing and Subscriptions 85
- Lesson Learning Experience 86
- Course Quality Pipeline 87
- Adaptive Mastery Loop 88
- Command Center Operations 89
- Quality Tooling 90
- Support Operations 91
- Course Management 92
- Command Center Operations 93
- Course Management 94
- Quality Tooling 95
- Navigation and Search
- release scripts spec
- Filosage Dashboard Desktop Screenshot
- Application Security 99
- check release env mjs
- Support Operations 101
- Filosage Photography Guidance
- Azure Release Platform 103
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
- Command Center Operations 116
- Brand and Visual System 117
- Quality Tooling 118
- Azure Release Platform 120
- Arrow Right Interface Icon
- Filosage Light Theme Icon Asset
- Subtle Dot Grid Pattern
- Teal Blue Coral Gradient Mesh
- Filosage Press Kit Cover

## God Nodes (most connected - your core abstractions)
1. `authorizationResponse()` - 100 edges
2. `apiRequestErrorResponse()` - 81 edges
3. `runStoredDocumentTransaction()` - 70 edges
4. `readJsonBody()` - 69 edges
5. `getStoredDocument()` - 53 edges
6. `requireAcceptedAccount()` - 48 edges
7. `POST()` - 47 edges
8. `useAuth()` - 47 edges
9. `Course` - 44 edges
10. `POST()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Clarity, Practice, and Transfer Message` --implements--> `Gateway-and-Path Visual Language`  [INFERRED]
  public/brand/banners/about-page-banner.svg → docs/brand/README.md
- `Useful Knowledge Editorial Message` --implements--> `Gateway-and-Path Visual Language`  [INFERRED]
  public/brand/banners/blog-header.svg → docs/brand/README.md
- `Evidence-Based Learning Records` --semantically_similar_to--> `Evidence-First Mastery Graph`  [INFERRED] [semantically similar]
  .agents/skills/teach/LEARNING-RECORD-FORMAT.md → docs/MASTERY_GRAPH_TECHNICAL_DESIGN.md
- `Wide Light Learning Path Motif` --implements--> `Gateway-and-Path Visual Language`  [INFERRED]
  public/brand/backgrounds/hero-light.svg → docs/brand/README.md
- `Filosage Dark-Theme Brand Mark` --implements--> `Filosage Design System`  [EXTRACTED]
  art_src/brand/filosage-dark-theme-original.png → DESIGN.md

## Import Cycles
- 3-file cycle: `src/lib/course-pipeline/observability.ts -> src/lib/firebase-server.ts -> src/lib/publication-review.ts -> src/lib/course-pipeline/observability.ts`
- 3-file cycle: `src/lib/ai-usage.ts -> src/lib/firebase-server.ts -> src/lib/publication-review.ts -> src/lib/ai-usage.ts`
- 3-file cycle: `src/lib/content-safety.ts -> src/lib/firebase-server.ts -> src/lib/publication-review.ts -> src/lib/content-safety.ts`
- 4-file cycle: `src/lib/account-server.ts -> src/lib/firebase-server.ts -> src/lib/publication-review.ts -> src/lib/ai-usage.ts -> src/lib/account-server.ts`
- 4-file cycle: `src/lib/ai-usage.ts -> src/lib/firebase-server.ts -> src/lib/publication-review.ts -> src/lib/content-safety.ts -> src/lib/ai-usage.ts`
- 5-file cycle: `src/lib/account-server.ts -> src/lib/firebase-server.ts -> src/lib/publication-review.ts -> src/lib/content-safety.ts -> src/lib/ai-usage.ts -> src/lib/account-server.ts`

## Hyperedges (group relationships)
- **Immutable QA-to-Production Azure Release Pipeline** — github_workflows_azure_qa_isolated_qa, github_workflows_azure_staging_qa_approved_staging, github_workflows_azure_promote_staging_traffic_promotion, docs_production_operations_blue_green_operations [EXTRACTED 1.00]
- **Outcome-to-Evidence Learning Loop** — product_filosage_product_contract, docs_phase_1_implementation_outcome_validation_loop, docs_mastery_graph_technical_design_evidence_first_mastery_graph, docs_product_and_business_roadmap_outcome_focused_strategy [EXTRACTED 1.00]
- **Safe Draft-Only Command Center Automation** — docs_agent_command_center_agents_domain_agents, docs_agent_command_center_approval_model_non_executing_approval, docs_agent_command_center_architecture_command_center_architecture, docs_agent_command_center_hybrid_semi_autonomous_implementation_plan_durable_safe_automation [EXTRACTED 1.00]
- **Owner Canary Release Evidence Chain** — docs_course_pipeline_v2_evaluation_results_deterministic_calibration_outcome, docs_course_pipeline_v2_reviews_2026_08_11_pass_5_owner_canary_go_decision, docs_course_pipeline_v2_release_evidence_owner_only_canary, docs_course_pipeline_v2_rollout_and_rollback_artifact_scoped_rollout [INFERRED 0.95]
- **Snapshot-Bound Authoring Pipeline** — docs_course_pipeline_v2_quality_contract_typed_diagnostics, docs_course_pipeline_v2_repair_protocol_allowlisted_snapshot_repair, docs_course_pipeline_v2_release_evidence_immutable_public_release, docs_course_pipeline_v2_current_system_map_snapshot_bound_pipeline [EXTRACTED 1.00]
- **Responsive Brand Path System** — public_brand_backgrounds_hero_dark_mobile_vertical_learning_path, public_brand_backgrounds_hero_dark_wide_learning_path, public_brand_backgrounds_hero_light_mobile_vertical_learning_path, public_brand_backgrounds_hero_light_wide_learning_path, docs_brand_readme_gateway_path_visual_language [INFERRED 0.95]
- **Filosage Learning Feature Illustration Set** — public_brand_illustrations_abstract_learning, public_brand_illustrations_ai_explanations, public_brand_illustrations_concept_mastery, public_brand_illustrations_desktop_product_frame, public_brand_illustrations_learning_paths, public_brand_illustrations_personalized_practice, public_brand_illustrations_progress_tracking, public_brand_illustrations_topic_exploration [INFERRED 0.95]
- **Filosage Logo Asset System** — public_brand_logo_browser_icon, public_brand_logo_filosage_icon, public_brand_logo_filosage_stripe_icon, public_brand_logo_filosage_stripe_logo, public_brand_logo_filosage_theme_dark, public_brand_logo_filosage_theme_light, public_brand_logo_filosage_dark_placement, public_brand_logo_filosage_horizontal, public_brand_logo_filosage_light_placement, public_brand_logo_filosage_social_avatar, src_app_icon [INFERRED 0.95]
- **Filosage Social and Marketing Asset Suite** — public_brand_banners_call_to_action_banner, public_brand_banners_main_website_banner, public_brand_banners_open_graph, public_brand_banners_social_sharing_fallback, public_brand_social_open_graph, public_brand_social_social_sharing_fallback, public_brand_social_github_social_preview, public_brand_social_launch_announcement, public_brand_social_linkedin_company_banner, public_brand_social_newsletter_header, public_brand_social_press_kit_cover, public_brand_social_product_announcement, public_brand_social_x_profile_header [INFERRED 0.95]

## Communities (131 total, 22 thin omitted)

### Community 0 - "Support Operations"
Cohesion: 0.05
Nodes (41): nextConfig, GET(), generateMetadata(), RootLayout(), safeRequestOrigin(), viewport, dynamic, robots() (+33 more)

### Community 1 - "Admin and Analytics"
Cohesion: 0.06
Nodes (45): AdminPage(), AdminTab, compactNumber(), currency(), featureLabels, readinessStateLabels, routeLabels, shortDate() (+37 more)

### Community 2 - "Adaptive Mastery Loop"
Cohesion: 0.07
Nodes (41): EvidenceReportPage(), STATE_LABELS, CourseDisclosure(), CourseDisclosureProps, getIdToken(), OutcomePlanner(), OutcomePlannerProps, TokenUser (+33 more)

### Community 3 - "Course Management"
Cohesion: 0.07
Nodes (44): DashboardCustomizer(), DashboardCustomizerProps, metricLabels, moveItem(), presetDetails, sectionLabels, CADENCE_LABELS, LearningScheduleSettings() (+36 more)

### Community 4 - "Lesson Learning Experience"
Cohesion: 0.09
Nodes (47): buildGuardedLessonSave(), LessonSavePipelineGuard, base64Url(), collectionGroupFrom(), commitWrites(), CourseBannerRegenerationError, courseQuery(), createCourse() (+39 more)

### Community 5 - "Billing and Subscriptions"
Cohesion: 0.12
Nodes (38): accountDeletionBlocksCheckout(), accountDeletionRequiresStripeReconciliation(), BillingEnvironment, BillingEventCursor, BillingPaymentState, checkoutConsentMetadataIsCurrent(), checkoutFulfillmentIsPaid(), CLOSED_LAUNCH_PAYMENT_METHOD_TYPES (+30 more)

### Community 6 - "Lesson Learning Experience 6"
Cohesion: 0.10
Nodes (32): ActivitySection, ActivitySectionId, LESSON_GENERATION_STAGES, LessonPane, LessonView(), Message, QuizResult, randomIndex() (+24 more)

### Community 7 - "Course Quality Pipeline"
Cohesion: 0.06
Nodes (38): Current Course System Map, Snapshot-Bound Course Pipeline, Course Pipeline Evaluation Plan, Deterministic Release Floor, Course Pipeline Evaluation Results, Deterministic Calibration Outcome, Course Intelligence Pipeline V2 Execution Plan, Versioned Course Quality Contract (+30 more)

### Community 8 - "Lesson Learning Experience 8"
Cohesion: 0.07
Nodes (38): Filosage Call to Action Banner, Filosage Main Website Banner, Turn Curiosity into Understanding, Filosage Open Graph Banner, Filosage Social Sharing Fallback Banner, Check Interface Icon, Coral Spark Interface Icon, Understanding Takes Shape Illustration (+30 more)

### Community 9 - "Command Center Operations"
Cohesion: 0.15
Nodes (37): commandCenterDraftsEnvironmentEnabled(), canTransitionCommandCenterTicket(), commandCenterApprovalIsExpired(), commandCenterDueAt(), commandCenterPriority(), sanitizeCommandCenterState(), addCommandCenterPublicReply(), assertDraftAgentEnabled() (+29 more)

### Community 10 - "Command Center Operations 10"
Cohesion: 0.21
Nodes (27): PATCH(), reviewSchema, approvalSchema, POST(), controlsSchema, PATCH(), PATCH(), POST() (+19 more)

### Community 11 - "Adaptive Mastery Loop 11"
Cohesion: 0.13
Nodes (31): Home(), streakFor(), AdaptiveReviewCandidate, AdaptiveSchedule, buildAdaptiveReviewQueue(), buildDailyMission(), buildWeeklyMilestone(), clampScore() (+23 more)

### Community 12 - "Course Quality Pipeline 12"
Cohesion: 0.09
Nodes (26): COURSE_PIPELINE_EVAL_DATASET_VERSION, coursePipelineEvaluationCases, ExpectedRoute, profiles, TopicCase, topics, COURSE_PIPELINE_VERSIONS, CourseArtifactProvenance (+18 more)

### Community 13 - "dom"
Cohesion: 0.06
Nodes (32): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+24 more)

### Community 14 - "Course Quality Pipeline 14"
Cohesion: 0.20
Nodes (28): manualReviewSchema, POST(), common, finishRepairStage(), POST(), repairRequestSchema, PATCH(), GET() (+20 more)

### Community 15 - "Course Quality Pipeline 15"
Cohesion: 0.11
Nodes (27): lessonInstructions(), POST(), languagePolicyInstruction(), COURSE_ARTIFACT_PROVENANCE_DEFAULTS, defaultLabApplicability(), canonicalLessonObjectiveId(), defaultVisualApplicability(), getCoursePublishReadiness() (+19 more)

### Community 16 - "Azure Release Platform"
Cohesion: 0.07
Nodes (30): claimValue(), decodedPrincipal(), EasyAuthClaim, easyAuthIdentityFromHeaders(), EasyAuthPrincipal, EasyAuthVerifiedIdentity, integerClaim(), verifiedEasyAuthUser() (+22 more)

### Community 17 - "Billing and Subscriptions 17"
Cohesion: 0.11
Nodes (24): run(), selectedCases(), usageSample(), actionClaimPatterns, CommandCenterDraftEvaluationCase, commandCenterDraftEvaluationCases, commandCenterDraftEvaluationJsonSchema, commandCenterDraftEvaluationModel (+16 more)

### Community 18 - "Azure Release Platform 18"
Cohesion: 0.14
Nodes (22): GET(), GET(), getExistingAccount(), isOwnerUser(), premiumEmailSet(), resolveAccount(), hasCurrentLegalAcceptance(), LOCAL_PLAYWRIGHT_LEARNERS (+14 more)

### Community 19 - "Billing and Subscriptions 19"
Cohesion: 0.14
Nodes (29): accountSubscriptionStatus(), acquisitionChannel(), dateValue(), dayKeys(), featureValue(), funnelDefinition, GET(), labelForUser() (+21 more)

### Community 20 - "Command Center Operations 20"
Cohesion: 0.08
Nodes (28): commandCenterDraftContentSchema, commandCenterDraftRequestSchema, commandCenterDraftReviewSchema, defaultCommandCenterControls, ticketTransitions, UserTicketInput, CommandCenterApproval, CommandCenterApprovalActionType (+20 more)

### Community 21 - "Billing and Subscriptions 21"
Cohesion: 0.17
Nodes (28): claimEvent(), currentSubscription(), currentSubscriptionPayment(), invoiceForCharge(), latestInvoiceId(), POST(), reconcileCharge(), reconcileInvoice() (+20 more)

### Community 22 - "Lesson Learning Experience 22"
Cohesion: 0.09
Nodes (23): LessonVisualRenderer(), base, candidateBase, ComparisonMatrixVisual, ConceptContrastVisual, curateLessonVisuals(), earnsWideCanvas(), editorialPriority() (+15 more)

### Community 23 - "Quality Tooling"
Cohesion: 0.07
Nodes (29): @axe-core/playwright, eslint, @eslint/js, eslint-plugin-react-hooks, globals, @next/eslint-plugin-next, oxlint, devDependencies (+21 more)

### Community 24 - "Lesson Learning Experience 24"
Cohesion: 0.18
Nodes (22): lessonTitle(), POST(), reportSchema, GET(), RouteParams, GET(), GET(), asCourseProgress() (+14 more)

### Community 25 - "Azure Release Platform 25"
Cohesion: 0.14
Nodes (25): decodeBase64(), GET(), RouteParams, buildCourseBannerPrompt(), COURSE_BANNER_STYLE_VERSION, CourseBannerPromptInput, normalized(), blobService() (+17 more)

### Community 26 - "Privacy and Consent"
Cohesion: 0.16
Nodes (25): PrivacyCenterPage(), serverConsentSnapshot(), AnalyticsConsent(), serverConsentSnapshot(), TrafficTracker(), acquisitionChannelFor(), acquisitionContext(), ANALYTICS_CONSENT_CHANGED_EVENT (+17 more)

### Community 27 - "Adaptive Mastery Loop 27"
Cohesion: 0.22
Nodes (21): BadgeFilter, ProfilePage(), dateKey(), ProgressPage(), EvidencePortfolio(), MasteryPath(), masteryState(), useLearnerState() (+13 more)

### Community 28 - "Lesson Learning Experience 28"
Cohesion: 0.09
Nodes (28): base, candidateBase, deriveMorseRecognition(), editDistance(), explorePurpose, InteractionItemEvidence, interactionQualityIssues(), label (+20 more)

### Community 29 - "Billing and Subscriptions 29"
Cohesion: 0.18
Nodes (23): planIcons, PricingPage(), renewalLabel(), MembershipPriceEnvironment, membershipPriceMappings(), priceMatchesOffer(), RecurringPriceSnapshot, StripePricePlanMapping (+15 more)

### Community 30 - "Azure Release Platform 30"
Cohesion: 0.07
Nodes (27): @azure/identity, @azure/storage-blob, @fontsource-variable/inter, lucide-react, next, openai, dependencies, @azure/identity (+19 more)

### Community 31 - "Brand and Visual System"
Cohesion: 0.08
Nodes (27): Filosage Rebrand Audit, Complete Filosage Brand Migration, Filosage Rebrand Inventory, Brand and Domain Surface Inventory, Filosage Brand System, Accessible Brand Usage, Gateway-and-Path Visual Language, Filosage Landing Desktop Screenshot (+19 more)

### Community 32 - "Privacy and Consent 32"
Cohesion: 0.14
Nodes (14): metadata, metadata, metadata, PrivacyPage(), metadata, TermsPage(), LegalDocument(), ACCEPTABLE_USE_VERSION (+6 more)

### Community 33 - "Lesson Learning Experience 33"
Cohesion: 0.17
Nodes (22): attemptSchema, GET(), hydrationSchema, loadRecognition(), numberValue(), LessonData, SourceKind, SourceRights (+14 more)

### Community 34 - "Azure Release Platform 34"
Cohesion: 0.09
Nodes (24): roots, accountUrl, apply, assetIds, bannerObjectIds, bundle, container, courseIds (+16 more)

### Community 35 - "Command Center Operations 35"
Cohesion: 0.12
Nodes (22): actionLabels, agentForTicket(), ApprovalDecision, ApprovalInspector(), availableDraftAgentTypes, categoryLabels, CommandCenterPage(), CommandCenterView (+14 more)

### Community 36 - "Adaptive Mastery Loop 36"
Cohesion: 0.14
Nodes (20): overrideSchema, POST(), DELETE(), RouteParams, requireRecentlyAuthenticatedOwner(), publishCourseWithReview(), updateCoursePipelineStage(), reconcileCourseCapacity() (+12 more)

### Community 37 - "Billing and Subscriptions 37"
Cohesion: 0.16
Nodes (21): POST(), feedbackDocumentId(), feedbackSchema, POST(), emailFingerprint(), GET(), POST(), pricingIntentSchema (+13 more)

### Community 38 - "Lesson Learning Experience 38"
Cohesion: 0.10
Nodes (24): defaults, GET(), noteDocumentId(), notePath(), objectStrings(), containsSerializedCriterionList(), lessonInteractionsSchema, baselineSubmissionSchema (+16 more)

### Community 39 - "Course Management 39"
Cohesion: 0.10
Nodes (20): CourseMap(), PublicationAssessmentState, readStoredPublicationAssessment(), storePublicationAssessment(), AppDrawer(), AppDrawerProps, DrawerContext, DrawerController (+12 more)

### Community 40 - "Identity and Accounts"
Cohesion: 0.18
Nodes (23): AuthContext, AuthContextValue, authErrorMessage(), AuthProvider(), localOwnerUser(), persistLegalAcceptance(), withTimeout(), parsePendingGoogleRedirectAcceptance() (+15 more)

### Community 41 - "Support Operations 41"
Cohesion: 0.11
Nodes (21): categoryLabels, emptyDraft, fieldErrorsFromResponse(), formatDate(), statusLabels, SupportCenter(), SupportCenterProps, SupportView (+13 more)

### Community 42 - "Brand and Visual System 42"
Cohesion: 0.17
Nodes (21): POST(), RouteParams, aiBudgetLimitsUsd(), AiPolicy, AiQuotaError, budgetPoolFor(), budgetShardFor(), getAiQuotaSummaries() (+13 more)

### Community 43 - "Lesson Learning Experience 43"
Cohesion: 0.18
Nodes (22): isLegacyCourseCandidate(), isLegacyLessonCandidate(), legacyCourseSchema, legacyLessonSchema, legacyLessonSummarySchema, legacyQuizSchema, parseCourseCandidate(), parseLessonCandidate() (+14 more)

### Community 44 - "Azure Release Platform 44"
Cohesion: 0.21
Nodes (23): ActiveTransaction, applyWrites(), beginTransaction(), commitWithoutExistingTransaction(), countStructuredQuery(), createDocument(), databasePool(), documentCoordinates() (+15 more)

### Community 45 - "Brand and Visual System 45"
Cohesion: 0.12
Nodes (21): assets, campaign(), campaigns, documentSvg(), fallbackSvgPath, featureIllustration(), heroBackground(), logoImage() (+13 more)

### Community 46 - "Outcome Evidence System"
Cohesion: 0.30
Nodes (19): POST(), POST(), POST(), PUT(), aiQuotaResponse(), AiReservation, extractOpenAiUsage(), finalizeAiUsage() (+11 more)

### Community 47 - "Identity and Accounts 47"
Cohesion: 0.16
Nodes (14): DELETE(), GET(), userActionSchema, GET(), acceptanceSchema, POST(), GET(), AuthorizationError (+6 more)

### Community 48 - "Billing and Subscriptions 48"
Cohesion: 0.17
Nodes (17): POST(), AiUsageSample, estimateAiUsageCostMicros(), FALLBACK_RATES, MODEL_RATES, ModelRates, ratesForModel(), summarizeAiUsage() (+9 more)

### Community 49 - "Lesson Learning Experience 49"
Cohesion: 0.20
Nodes (17): activityAttemptSchema, numberValue(), POST(), activityDocumentId(), ActivityReceiptClaims, base64Url(), decodeBase64Url(), signActivityReceipt() (+9 more)

### Community 50 - "Outcome Evidence System 50"
Cohesion: 0.17
Nodes (16): deliverScriptAlert(), writeEvidenceFile(), evidenceFile, createOperationalAlertEnvelope(), deliverOperationalAlert(), OperationalAlertContext, OperationalAlertDeliveryResult, OperationalAlertEnvelope (+8 more)

### Community 51 - "Course Quality Pipeline 51"
Cohesion: 0.19
Nodes (17): sanitizeGeneratedValue(), normalizeSuccessCriteria(), guidedPracticeDto(), lessonExperienceDto(), RESERVED_EXPERIENCE_TASKS, structuredText(), toLessonDto(), transferTaskDto() (+9 more)

### Community 52 - "Lesson Learning Experience 52"
Cohesion: 0.11
Nodes (18): completed, inputArgument, inputPath, lessonsByCourse, MigrationBundle, outputArgument, outputPath, paths (+10 more)

### Community 53 - "Outcome Evidence System 53"
Cohesion: 0.18
Nodes (15): courseStyles, CreateCoursePage(), emptySource(), examples, SourceDraft, steps, OutcomeUsefulness(), applyTheme() (+7 more)

### Community 54 - "Command Center Operations 54"
Cohesion: 0.11
Nodes (18): scripts, brand:assets, build, check:production, check:release, check:support-wiki, dev, eval:command-center (+10 more)

### Community 55 - "Lesson Learning Experience 55"
Cohesion: 0.16
Nodes (15): PublicationDecision, COURSE_QUALITY_GATE_VERSION, CourseSource, assessCourseForPublication(), lessonIssues(), PUBLICATION_ASSESSMENT_VERSION, PublicationAssessment, PublicationAssessmentIssue (+7 more)

### Community 56 - "Lesson Learning Experience 56"
Cohesion: 0.17
Nodes (13): buildInteractionAttemptMutation(), integerValue(), InteractionAttemptMetadata, COURSE_REVIEW_POLICY_VERSION, courseReviewPolicyForBrief(), effectiveCourseReviewPolicy(), HIGH_STAKES_PATTERNS, COURSE_QUALITY_RULES (+5 more)

### Community 57 - "Lesson Learning Experience 57"
Cohesion: 0.21
Nodes (13): LessonKind, LessonMode, ExperienceEvidence, INTERACTION_QUALITY_GATE_VERSION, LESSON_QUALITY_GATE_VERSION, lessonQualityIssues(), comparableHeading(), hasBlockMarkdownSyntax() (+5 more)

### Community 58 - "Legacy Firebase Storage"
Cohesion: 0.22
Nodes (17): applyWrite(), compare(), decodePath(), documentName(), filterValue(), listCollection(), load(), localFirestoreJson() (+9 more)

### Community 59 - "Lesson Learning Experience 59"
Cohesion: 0.14
Nodes (17): Canonical Learning Glossary, Evidence-Based Learning Records, Mission-Grounded Teaching, Trusted Knowledge and Wisdom Resources, Desirable Difficulty, Stateful Teaching Workspace, Evidence-Gated Product Experiment Registry, Founding Launch Catalog (+9 more)

### Community 60 - "Lesson Learning Experience 60"
Cohesion: 0.19
Nodes (15): buildLessonFlashcards(), concise(), contentSectionCards(), LessonStudyTools(), LessonStudyToolsProps, nextReviewDate(), plainLessonText(), reviewDateLabel() (+7 more)

### Community 61 - "Privacy and Consent 61"
Cohesion: 0.14
Nodes (10): ownerDocumentation, OwnerDocumentation, OwnerDocumentationLink, OwnerDocumentationSection, OwnerDocumentationTopic, PRIVACY_VERSION, TERMS_VERSION, authorization (+2 more)

### Community 62 - "content language"
Cohesion: 0.19
Nodes (16): ContentIntegrityIssue, ContentLanguagePolicy, CONTROL_ARTIFACTS, firstArtifactIndex(), hasMalformedCharacters(), inspectGeneratedContent(), instructionLanguageIssue(), isMalformedCharacter() (+8 more)

### Community 63 - "Support Operations 63"
Cohesion: 0.13
Nodes (13): args, articleDirectory, articleFiles, articles, changedFiles, errors, extractArray(), legalSource (+5 more)

### Community 64 - "Legacy Firebase Storage 64"
Cohesion: 0.17
Nodes (15): accessToken(), base64Url(), clientEmail, documentPath(), exported(), listCollection(), main(), MigrationBundle (+7 more)

### Community 65 - "Adaptive Mastery Loop 65"
Cohesion: 0.18
Nodes (12): accountDeletionDocumentPaths(), AccountDeletionInventory, AUTOMATED_ACCOUNT_DELETION_RETENTION, documentPaths(), IdentifiedAccountDocument, ACCOUNT_DELETION_RECENT_AUTH_SECONDS, AuthenticationClaims, authenticationClaimsFromIdToken() (+4 more)

### Community 66 - "Application Security"
Cohesion: 0.23
Nodes (14): assertLocallySafeContentBatch(), assertNoCooldown(), assertSafeContentBatch(), contentFingerprint(), localPolicyFlags(), MODERATION_MODEL, numberValue(), recordBlockedRequest() (+6 more)

### Community 67 - "Support Operations 67"
Cohesion: 0.17
Nodes (8): openResearchTab(), Theme, learningProgress, ownedCourses, prepareOwnerShell(), mockFreeLearnerAccount(), restoreLocalLearner(), root

### Community 68 - "Billing and Subscriptions 68"
Cohesion: 0.19
Nodes (15): Draft-Only Agent Admission Contract, Bounded Draft-Only Domain Agents, Non-Executing Human Approval Model, Command Center Transactional Architecture, Command Center Billing-Event Boundary, Durable Privacy-Safe Semi-Autonomous Operations Plan, Owner-Only Agent Command Center, Billing Activation Contract (+7 more)

### Community 69 - "Lesson Learning Experience 69"
Cohesion: 0.16
Nodes (9): AchievementBadge(), AchievementBadgeProps, icons, BADGE_DEFINITIONS, BadgeContext, BadgeDefinition, BadgeFamily, BadgeIcon (+1 more)

### Community 70 - "Billing and Subscriptions 70"
Cohesion: 0.27
Nodes (12): collectAccountData(), DELETE(), downloadName(), emailFingerprint(), GET(), listCompleteAccountRecordsByField(), listCompleteAccountSubcollection(), requireRecentlyAuthenticatedAccount() (+4 more)

### Community 71 - "telemetry route"
Cohesion: 0.25
Nodes (11): documentRouteKey(), numberValue(), POST(), telemetrySchema, ACQUISITION_CHANNELS, ANONYMOUS_PRODUCT_EVENT_NAMES, PRODUCT_EVENT_NAMES, PRODUCT_EVENT_ROUTES (+3 more)

### Community 72 - "Command Center Operations 72"
Cohesion: 0.25
Nodes (12): normalizeCommandCenterEvidenceReferences(), approvedSupportKnowledge(), assertAgentReady(), CommandCenterDraftGenerationError, compatibleCategories, contextForAgent(), generateCommandCenterDraft(), normalizeContent() (+4 more)

### Community 73 - "Billing and Subscriptions 73"
Cohesion: 0.31
Nodes (12): allocatedPercents(), billingPlan(), calculateMembershipAnalytics(), effectiveMembershipPlan(), effectivePlan(), manualPlan(), MembershipAnalyticsRecord, recordSubscriptionStatus() (+4 more)

### Community 74 - "Outcome Evidence System 74"
Cohesion: 0.21
Nodes (13): Filosage Dark-Theme Brand Mark, Filosage Light-Theme Brand Mark, Filosage Design System, Quietly Premium Learning Interface, Azure-Native Migration and Release Runbook, JSONB Compatibility Migration, Azure Blue-Green Production Operations, Azure PostgreSQL Backup Verification Workflow (+5 more)

### Community 75 - "Quality Tooling 75"
Cohesion: 0.21
Nodes (11): app, handle, port, server, testStoreDir, testTsconfigPath, installPlaywrightServerLifecycle(), isStrictDescendant() (+3 more)

### Community 76 - "Azure Release Platform 76"
Cohesion: 0.15
Nodes (10): bannerById, bundle, databaseUrl, databaseUrlValue, hostOverride, inputArgument, inputBlobArgument, paths (+2 more)

### Community 77 - "Application Security 77"
Cohesion: 0.23
Nodes (9): PATCH(), RouteParams, updateSchema, emailFingerprint(), POST(), waitlistSchema, allowedOrigins(), ApiRequestError (+1 more)

### Community 78 - "package"
Cohesion: 0.17
Nodes (11): name, overrides, brace-expansion, fast-uri, postcss, sharp, undici, ws (+3 more)

### Community 79 - "Marketing Experience"
Cohesion: 0.23
Nodes (7): FeatureGrid(), features, HowItWorks(), steps, LandingPage(), MarketingHero(), ProductMockup()

### Community 80 - "Lesson Learning Experience 80"
Cohesion: 0.29
Nodes (11): contentWords(), CourseOutline, courseQualityIssues(), duplicateValues(), flattenedLessons(), modeIssues(), normalized(), STOP_WORDS (+3 more)

### Community 81 - "Course Quality Pipeline 81"
Cohesion: 0.33
Nodes (10): cases, checksPassed(), EvaluationCase, help(), isProductionHost(), postJson(), run(), scoreCourse() (+2 more)

### Community 82 - "Lesson Learning Experience 82"
Cohesion: 0.24
Nodes (7): InteractiveLessonBlock(), playSignal(), recognitionEvidence(), RecognitionInteraction, RecognitionLab(), SignalLab(), signalUnits()

### Community 83 - "Lesson Learning Experience 83"
Cohesion: 0.25
Nodes (8): lessonGenerationGate, CourseStage, CoursePipelineEvent, CoursePipelineEventName, writeCoursePipelineEvent(), findCourseLesson(), NextLesson, Course

### Community 84 - "Lesson Learning Experience 84"
Cohesion: 0.36
Nodes (9): PracticeType, line(), localAiStub(), paragraph(), stubCapstoneVerdict(), stubCommandCenterDraft(), stubLesson(), stubUsage() (+1 more)

### Community 85 - "Billing and Subscriptions 85"
Cohesion: 0.29
Nodes (8): POST(), GET(), billingStatus(), isBillingInterval(), recordServerProductEvent(), billingConfiguration(), BillingAccountDeletionInProgressError, BillingCheckoutInProgressError

### Community 86 - "Lesson Learning Experience 86"
Cohesion: 0.24
Nodes (8): isReservedExperienceTask(), LessonExperience(), LessonExperienceState, RESERVED_EXPERIENCE_TASKS, responseLabels, StructuredText(), titles, LessonExperience

### Community 87 - "Course Quality Pipeline 87"
Cohesion: 0.22
Nodes (9): Course-Creation Skill Mapping, Teaching Design Input to Runtime Contract, Course Pipeline Security Threat Model, Untrusted Content Boundary, Phase 0 Customer Interview Guide, Application-Evidence Research Question, Behavioral Evidence Standard, Customer Interview Log Template (+1 more)

### Community 88 - "Adaptive Mastery Loop 88"
Cohesion: 0.31
Nodes (8): assertCourseAccess(), diagnosticSchema, evidenceSchema, GET(), planSchema, POST(), PUT(), EVIDENCE_TYPES

### Community 89 - "Command Center Operations 89"
Cohesion: 0.25
Nodes (8): GPT-5.6 Terra V5 Evaluation, Passing Draft Model Contract, Command Center Incident Response, Kill-Switch Containment, Command Center Operations, Dual Command Center Enablement Gates, Command Center Test Strategy, Seven-Case Live Model Gate

### Community 90 - "Quality Tooling 90"
Cohesion: 0.32
Nodes (4): ownedProjects, server, configuredPort(), playwrightServerSettings()

### Community 91 - "Support Operations 91"
Cohesion: 0.36
Nodes (7): GET(), idempotencyKey(), POST(), requestContextSchema, supportTicketSchema, commandCenterEnvironmentEnabled(), listUserCommandCenterTickets()

### Community 92 - "Course Management 92"
Cohesion: 0.43
Nodes (6): actorIsEligible(), cohortPercentage(), CoursePipelineFlagActor, CoursePipelineFlags, enabled(), resolveCoursePipelineFeatureFlags()

### Community 93 - "Command Center Operations 93"
Cohesion: 0.29
Nodes (7): Copyright Intake Policy, Unverified Copyright Claim Boundary, Privacy Workflow Boundary, Human-Controlled Privacy Fulfillment, Command Center Security Controls, Append-Only Audit Limitation, Review-Only Draft Boundary

### Community 94 - "Course Management 94"
Cohesion: 0.50
Nodes (3): CourseLayoutProps, generateMetadata(), readableTopic()

### Community 95 - "Quality Tooling 95"
Cohesion: 0.70
Nodes (4): delay(), processIsRunning(), stopOwnedServer(), stopOwnedServers()

### Community 96 - "Navigation and Search"
Cohesion: 0.40
Nodes (3): copyBans, root, sourceRoot

### Community 97 - "release scripts spec"
Cohesion: 0.40
Nodes (4): healthScript, releaseScript, root, validReleaseEnvironment

### Community 98 - "Filosage Dashboard Desktop Screenshot"
Cohesion: 0.50
Nodes (4): Filosage Dashboard Desktop Screenshot, Desktop Learning Workspace Layout, Filosage Dashboard Mobile Screenshot, Stacked Mobile Learning Workspace

### Community 99 - "Application Security 99"
Cohesion: 0.50
Nodes (3): expectedOriginInput, expectedVersion, healthUrl

### Community 100 - "check release env mjs"
Cohesion: 0.50
Nodes (3): activationMode, missing, required

### Community 101 - "Support Operations 101"
Cohesion: 0.67
Nodes (3): Learner-Facing Support Wiki Authoring Contract, Pull Request Support-Wiki Impact Contract, Support Wiki Validation Workflow

### Community 102 - "Filosage Photography Guidance"
Cohesion: 0.67
Nodes (3): Filosage Photography Guidance, Editorial Realistic Learning Photography, Responsive AVIF and WebP Image Delivery

## Knowledge Gaps
- **598 isolated node(s):** `eslintConfig`, `COURSE_PIPELINE_EVAL_DATASET_VERSION`, `ExpectedRoute`, `topics`, `profiles` (+593 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authorizationResponse()` connect `Command Center Operations 10` to `Course Quality Pipeline 14`, `Course Quality Pipeline 15`, `Azure Release Platform 18`, `Billing and Subscriptions 19`, `Lesson Learning Experience 24`, `Lesson Learning Experience 33`, `Adaptive Mastery Loop 36`, `Billing and Subscriptions 37`, `Lesson Learning Experience 38`, `Brand and Visual System 42`, `Outcome Evidence System`, `Identity and Accounts 47`, `Billing and Subscriptions 48`, `Lesson Learning Experience 49`, `Billing and Subscriptions 70`, `Application Security 77`, `Billing and Subscriptions 85`, `Adaptive Mastery Loop 88`, `Support Operations 91`, `Support Operations 105`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `Course` connect `Lesson Learning Experience 83` to `Admin and Analytics`, `Adaptive Mastery Loop`, `Lesson Learning Experience 6`, `Adaptive Mastery Loop 11`, `Course Quality Pipeline 14`, `Course Quality Pipeline 15`, `Lesson Learning Experience 24`, `Adaptive Mastery Loop 27`, `Lesson Learning Experience 33`, `Adaptive Mastery Loop 36`, `Course Management 39`, `Lesson Learning Experience 43`, `Outcome Evidence System`, `Lesson Learning Experience 49`, `Course Quality Pipeline 51`, `Lesson Learning Experience 55`, `Support Operations 67`, `Lesson Learning Experience 69`, `Lesson Learning Experience 80`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `serverEnvironment` connect `Azure Release Platform 18` to `Support Operations`, `Lesson Learning Experience`, `Billing and Subscriptions`, `Command Center Operations 10`, `Course Quality Pipeline 15`, `Billing and Subscriptions 19`, `Billing and Subscriptions 21`, `Azure Release Platform 25`, `Privacy and Consent 32`, `Lesson Learning Experience 33`, `Billing and Subscriptions 37`, `Brand and Visual System 42`, `Azure Release Platform 44`, `Lesson Learning Experience 49`, `Application Security`, `telemetry route`, `Application Security 77`, `Lesson Learning Experience 84`, `Course Management 92`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `COURSE_PIPELINE_EVAL_DATASET_VERSION`, `ExpectedRoute` to the rest of the system?**
  _598 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Support Operations` be split into smaller, more focused modules?**
  _Cohesion score 0.05403508771929825 - nodes in this community are weakly interconnected._
- **Should `Admin and Analytics` be split into smaller, more focused modules?**
  _Cohesion score 0.05516431924882629 - nodes in this community are weakly interconnected._
- **Should `Adaptive Mastery Loop` be split into smaller, more focused modules?**
  _Cohesion score 0.07329462989840348 - nodes in this community are weakly interconnected._