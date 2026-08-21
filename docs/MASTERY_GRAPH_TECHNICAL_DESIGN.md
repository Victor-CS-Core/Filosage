# Filosage Mastery Graph — Phase 0 Technical Design

Status: design only; implementation begins after the Phase 0 demand gate  
Owner: product and engineering

## Purpose

The Mastery Graph represents what a learner is trying to accomplish, what the outcome requires, what they currently understand, what they misunderstand, and what they have demonstrated over time.

It is the product's proposed defensible data asset. It must remain explainable, versioned, privacy-conscious, and useful without claiming scientific validity that has not been established.

## Design principles

1. Store evidence, not a single opaque “mastery score.”
2. Distinguish recognition, recall, guided application, independent transfer, and capstone evidence.
3. Preserve the content, rubric, scheduler, prompt, and model versions behind a judgment.
4. Make every recommendation explainable to the learner.
5. Treat confidence as evidence about calibration, not competence by itself.
6. Never infer sensitive traits.
7. Do not expose private evidence to employers or teams without explicit learner control.
8. Keep anonymous device progress compatible with later account sync.

## Core entities

### LearningOutcome

- `id`
- `ownerId`
- `title`
- `context`
- `targetArtifact`
- `deadline`
- `weeklyMinutes`
- `status`: draft, active, paused, completed, archived
- `createdAt`
- `updatedAt`

### Objective

- `id`
- `outcomeId`
- `statement`
- `observableVerb`
- `importance`
- `sequenceHint`
- `sourceIds`
- `version`

### Concept

- `id`
- `canonicalLabel`
- `description`
- `domain`
- `sourceIds`
- `version`

### ObjectiveConcept

- `objectiveId`
- `conceptId`
- `role`: prerequisite, core, supporting, extension
- `requiredEvidenceTypes`
- `minimumRubricCriteria`

### Misconception

- `id`
- `conceptId`
- `statement`
- `diagnosticSignals`
- `correctionStrategy`
- `sourceIds`
- `version`

### Evidence

- `id`
- `actorId`
- `outcomeId`
- `objectiveId`
- `conceptId`
- `evidenceType`: self_report, recognition, recall, guided_practice, transfer, capstone
- `taskId`
- `attempt`
- `result`
- `rubricResults`
- `confidence`
- `contentVersion`
- `rubricVersion`
- `policyVersion`
- `promptVersion`
- `modelVersion`
- `occurredAt`

### MasteryState

This is a derived cache, not the source of truth.

- `actorId`
- `objectiveId`
- `conceptId`
- `status`: unknown, introduced, fragile, usable, demonstrated, decaying
- `strongestEvidenceType`
- `lastEvidenceAt`
- `nextReviewAt`
- `explanation`
- `policyVersion`
- `updatedAt`

### Source

- `id`
- `type`: url, document, owner_reference
- `title`
- `publisher`
- `url`
- `accessedAt`
- `contentFingerprint`
- `storageAssetId`
- `reviewStatus`
- `rightsNote`

### ContentVersion

- `id`
- `courseId`
- `lessonId`
- `schemaVersion`
- `sourceIds`
- `qualityGateVersion`
- `promptVersion`
- `modelVersion`
- `publishedAt`
- `supersedes`

## Relationships

```text
LearningOutcome
  -> Objective
      -> ObjectiveConcept
          -> Concept
              -> Misconception

Actor + Objective + Concept
  -> Evidence[]
      -> derived MasteryState
          -> next lesson, review, re-teach, or capstone recommendation

Evidence
  -> Task
  -> ContentVersion
  -> RubricVersion
  -> Source[]
```

## Decision policy v1

The first policy should be deterministic and conservative:

- Self-report can alter diagnostic depth but cannot mark a concept demonstrated.
- Recognition can mark a concept introduced.
- Successful free recall can mark it fragile or usable.
- Guided practice can strengthen but not independently demonstrate transfer.
- Independent transfer against explicit criteria can mark it demonstrated.
- A later failed recall can move demonstrated to decaying, never erase historical evidence.
- One wrong answer triggers more evidence, not a permanent negative judgment.
- Capstone criteria are stored separately; passing one criterion does not imply the whole outcome passed.

## Explainability contract

Every adaptation response must be able to provide:

- Recommendation: what to do next.
- Reason: which evidence caused the recommendation.
- Missing evidence: what has not been demonstrated.
- Recovery path: how the learner can change the recommendation.
- Version: which policy produced it.

Example:

> Review causal assumptions next. You recalled the definition correctly but missed the transfer task that required identifying a confounder. Complete one new scenario to demonstrate the criterion.

## Storage proposal

Continue using Azure PostgreSQL for Phase 1.

Suggested collections:

- `learningOutcomes`
- `learningOutcomes/{outcomeId}/objectives`
- `concepts`
- `misconceptions`
- `evidence`
- `masteryStates`
- `sources`
- `contentVersions`

Required indexes should follow actual query shapes:

- Evidence by actor, outcome, and occurrence time.
- Evidence by actor, concept, and occurrence time.
- Mastery state by actor, outcome, status, and next review.
- Content version by course and lesson.

Do not store full private submissions in analytics. Evidence records may reference a protected learner artifact stored in the appropriate private collection or object store.

## Migration

Existing `CourseProgress` and `LessonProgress` remain the compatibility layer.

Phase 1 migration:

1. Add optional outcome and objective IDs to new courses.
2. Write new evidence alongside existing progress updates.
3. Derive MasteryState asynchronously or transactionally after evidence.
4. Compare new state with existing status without changing learner-visible behavior.
5. Backfill only stable, interpretable evidence fields.
6. Switch recommendations behind a feature flag after validation.

Do not manufacture historical transfer or capstone evidence from lesson completion.

## Evaluation requirements

- Deterministic policy unit tests.
- Fixture histories covering conflicting evidence.
- Scheduler version tests.
- Anonymous-to-account merge tests.
- Authorization tests for every private evidence path.
- Export and deletion coverage.
- Performance test for the learner dashboard query.
- Fairness review before expanding into employment-facing evidence.

## Open decisions for Phase 1

- Whether objectives and concepts are globally canonical or course-scoped first.
- How much source text may be retained.
- Artifact storage and retention.
- Rubric reliability checks.
- Whether delayed checks generate separate tasks or reuse parameterized task families.
- Minimum evidence needed to label a criterion demonstrated.

