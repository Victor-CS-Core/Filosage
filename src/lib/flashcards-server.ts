import "server-only";

import type { ServerAccount } from "@/lib/account-server";
import { AiQuotaError, aiUsageProductGuard } from "@/lib/ai-usage";
import {
  deleteStoredDocuments,
  getStoredDocument,
  listAllStoredDocuments,
  listCollectionGroupDocumentsByField,
  putStoredDocuments,
  runStoredDocumentTransaction,
} from "@/lib/document-store";
import { flashcardFeatureConfiguration } from "@/lib/flashcard-feature";
import {
  FLASHCARD_CARD_LIMIT,
  FLASHCARD_DECK_LIMIT,
  FLASHCARD_LEGACY_SCHEMA_VERSION,
  FLASHCARD_SCHEMA_VERSION,
  GENERATED_FLASHCARD_LIMIT,
  customDeckInputSchema,
  deckUpdateInputSchema,
  flashcardDeckSchema,
  flashcardReviewStateSchema,
  flashcardSchema,
  generatedDeckOutputSchema,
  nextFlashcardDueAt,
  type Flashcard,
  type FlashcardDeck,
  type FlashcardDeckDetail,
  type FlashcardRating,
  type FlashcardSourceRef,
  type GeneratedDeckOutput,
} from "@/lib/flashcards";
import { planAllows } from "@/lib/membership-plans";

const DECK_COLLECTION = "flashcardDecks";
const CARD_COLLECTION = "flashcards";
const REVIEW_COLLECTION = "flashcardReviewState";

export class FlashcardServiceError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 429 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function flashcardErrorResponse(error: unknown) {
  if (!(error instanceof FlashcardServiceError)) return null;
  return Response.json(
    { error: error.message, code: error.code },
    { status: error.status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function assertDecksEnabled() {
  if (!flashcardFeatureConfiguration().decksEnabled) {
    throw new FlashcardServiceError(503, "FLASHCARDS_DISABLED", "Flashcard decks are not enabled in this environment.");
  }
}

export function assertGenerationEnabled() {
  assertDecksEnabled();
  if (!flashcardFeatureConfiguration().generationEnabled) {
    throw new FlashcardServiceError(503, "FLASHCARD_GENERATION_DISABLED", "Flashcard generation is not enabled in this environment.");
  }
}

function canCreateCustomDeck(account: Pick<ServerAccount, "plan" | "isOwner">) {
  return account.isOwner || planAllows(account.plan, "create_custom_flashcard_deck");
}

function deckPath(uid: string, deckId: string) {
  return `users/${uid}/${DECK_COLLECTION}/${deckId}`;
}

function cardPath(uid: string, cardId: string) {
  return `users/${uid}/${CARD_COLLECTION}/${cardId}`;
}

function reviewPath(uid: string, cardId: string) {
  return `users/${uid}/${REVIEW_COLLECTION}/${cardId}`;
}

function parsedDeck(value: unknown) {
  const parsed = flashcardDeckSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parsedCard(value: unknown) {
  const parsed = flashcardSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deterministicCardId(
  version: typeof FLASHCARD_LEGACY_SCHEMA_VERSION | typeof FLASHCARD_SCHEMA_VERSION,
  deckId: string,
  position: number,
  prompt: string,
  answer: string,
) {
  const identity = version === FLASHCARD_LEGACY_SCHEMA_VERSION
    ? `${deckId}:${position}:${prompt}:${answer}`
    : JSON.stringify([deckId, position, prompt, answer]);
  return (await sha256(identity)).slice(0, 40);
}

async function stableMutationId(uid: string, purpose: string, idempotencyKey: string) {
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new FlashcardServiceError(409, "IDEMPOTENCY_KEY_REQUIRED", "Retry-safe deck creation requires an idempotency key.");
  }
  return (await sha256(`${uid}:${purpose}:${idempotencyKey}`)).slice(0, 40);
}

export async function listFlashcardDecks(account: Pick<ServerAccount, "uid">) {
  assertDecksEnabled();
  const documents = await listAllStoredDocuments(`users/${account.uid}/${DECK_COLLECTION}`, FLASHCARD_DECK_LIMIT + 1);
  if (documents.length > FLASHCARD_DECK_LIMIT) {
    throw new FlashcardServiceError(409, "DECK_LIMIT", "This account has reached the private deck storage limit.");
  }
  return documents
    .map(parsedDeck)
    .filter((deck): deck is FlashcardDeck => Boolean(deck && deck.ownerUid === account.uid && deck.status !== "deleted"))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function assertFlashcardDeckCapacity(account: Pick<ServerAccount, "uid">) {
  const decks = await listFlashcardDecks(account);
  if (decks.length >= FLASHCARD_DECK_LIMIT) {
    throw new FlashcardServiceError(409, "DECK_LIMIT", "This account has reached the private deck storage limit.");
  }
}

export async function getFlashcardDeckDetail(account: Pick<ServerAccount, "uid">, deckId: string): Promise<FlashcardDeckDetail> {
  assertDecksEnabled();
  const deck = parsedDeck(await getStoredDocument(deckPath(account.uid, deckId)));
  if (!deck || deck.ownerUid !== account.uid || deck.status === "deleted") {
    throw new FlashcardServiceError(404, "DECK_NOT_FOUND", "Flashcard deck not found.");
  }
  const cardDocuments = await listCollectionGroupDocumentsByField(CARD_COLLECTION, "deckId", deck.id, FLASHCARD_CARD_LIMIT + 1);
  if (cardDocuments.length > FLASHCARD_CARD_LIMIT) {
    throw new FlashcardServiceError(409, "CARD_LIMIT", "This deck exceeds the supported private card limit.");
  }
  const cards = cardDocuments
    .map(parsedCard)
    .filter((card): card is Flashcard => Boolean(card))
    .filter((card) => card.deckId === deck.id && !card.deletedAt)
    .sort((left, right) => left.position - right.position);
  return { deck: { ...deck, cardCount: cards.length }, cards };
}

export async function createCustomFlashcardDeck(
  account: Pick<ServerAccount, "uid" | "plan" | "isOwner">,
  raw: unknown,
  idempotencyKey: string,
) {
  assertDecksEnabled();
  if (!canCreateCustomDeck(account)) {
    throw new FlashcardServiceError(403, "CUSTOM_DECK_PLAN_REQUIRED", "Custom flashcard decks are included with Filosage Plus and Pro.");
  }
  const input = customDeckInputSchema.safeParse(raw);
  if (!input.success) throw new FlashcardServiceError(400, "INVALID_DECK", input.error.issues[0]?.message ?? "Invalid deck.");
  const deckId = await stableMutationId(account.uid, "custom-deck", idempotencyKey);
  const existing = parsedDeck(await getStoredDocument(deckPath(account.uid, deckId)));
  if (existing) return getFlashcardDeckDetail(account, deckId);
  await assertFlashcardDeckCapacity(account);
  const now = new Date().toISOString();
  const cards: Flashcard[] = await Promise.all(input.data.cards.map(async (card, position) => ({
    id: card.id ?? await deterministicCardId(FLASHCARD_SCHEMA_VERSION, deckId, position, card.prompt, card.answer),
    version: FLASHCARD_SCHEMA_VERSION,
    deckId,
    courseId: null,
    position,
    prompt: card.prompt,
    answer: card.answer,
    type: card.type,
    origin: "manual" as const,
    objectiveIds: [],
    sourceRefs: [],
    sourceFingerprint: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })));
  const deck: FlashcardDeck = {
    id: deckId,
    version: FLASHCARD_SCHEMA_VERSION,
    ownerUid: account.uid,
    revision: 1,
    title: input.data.title,
    description: input.data.description,
    kind: "custom",
    status: "active",
    courseId: null,
    courseTopic: null,
    moduleIndex: null,
    lessonIds: [],
    scope: "custom",
    generationSettings: null,
    sourceFingerprint: null,
    cardCount: cards.length,
    dueCount: cards.length,
    createdAt: now,
    updatedAt: now,
    lastReviewedAt: null,
    archivedAt: null,
    deletedAt: null,
  };
  await putStoredDocuments([
    { path: deckPath(account.uid, deckId), data: deck },
    ...cards.map((card) => ({ path: cardPath(account.uid, card.id), data: card })),
  ]);
  return { deck, cards };
}

export interface GeneratedFlashcardDraftInput {
  account: Pick<ServerAccount, "uid">;
  deckId: string;
  courseId: string;
  courseTopic: string;
  moduleIndex: number | null;
  lessonIds: string[];
  scope: "lesson" | "module" | "course";
  depth: "focused" | "balanced" | "comprehensive";
  emphasis: "balanced" | "key-ideas" | "application";
  includeAttemptedChecks: boolean;
  sourceFingerprint: string;
  output: GeneratedDeckOutput;
  sources: Map<string, FlashcardSourceRef>;
}

export interface PreparedGeneratedFlashcardDraft {
  detail: FlashcardDeckDetail;
  paths: string[];
  writes: Array<{ path: string; data: Record<string, unknown> }>;
  productGuard: string;
}

export interface RecoveredGeneratedFlashcardDraftIdentity {
  deckId: string;
  courseId: string;
  scope: "lesson" | "module" | "course";
  lessonId?: string;
  moduleIndex: number | null;
  legacyModuleIndex: number | null;
  depth: "focused" | "balanced" | "comprehensive";
  emphasis: "balanced" | "key-ideas" | "application";
  includeAttemptedChecks: boolean;
}

export async function prepareGeneratedFlashcardDraft(input: GeneratedFlashcardDraftInput): Promise<PreparedGeneratedFlashcardDraft> {
  const targetDeckPath = deckPath(input.account.uid, input.deckId);
  if (await getStoredDocument(targetDeckPath)) {
    throw new FlashcardServiceError(409, "DECK_CONFLICT", "The generated deck identity is already in use.");
  }
  await assertFlashcardDeckCapacity(input.account);
  const output = generatedDeckOutputSchema.parse(input.output);
  const now = new Date().toISOString();
  const cards: Flashcard[] = await Promise.all(output.cards.map(async (card, position) => flashcardSchema.parse({
    id: await deterministicCardId(FLASHCARD_SCHEMA_VERSION, input.deckId, position, card.prompt, card.answer),
    version: FLASHCARD_SCHEMA_VERSION,
    deckId: input.deckId,
    courseId: input.courseId,
    position,
    prompt: card.prompt,
    answer: card.answer,
    type: card.type,
    origin: "generated" as const,
    objectiveIds: card.objectiveIds,
    sourceRefs: card.sourceRefIds.flatMap((ref) => {
      const source = input.sources.get(ref);
      return source ? [source] : [];
    }),
    sourceFingerprint: input.sourceFingerprint,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })));
  const deck: FlashcardDeck = flashcardDeckSchema.parse({
    id: input.deckId,
    version: FLASHCARD_SCHEMA_VERSION,
    ownerUid: input.account.uid,
    revision: 1,
    title: output.title,
    description: output.description,
    kind: "generated",
    status: "draft",
    courseId: input.courseId,
    courseTopic: input.courseTopic,
    moduleIndex: input.moduleIndex,
    lessonIds: input.lessonIds,
    scope: input.scope,
    generationSettings: {
      depth: input.depth,
      emphasis: input.emphasis,
      includeAttemptedChecks: input.includeAttemptedChecks,
    },
    sourceFingerprint: input.sourceFingerprint,
    cardCount: cards.length,
    dueCount: cards.length,
    createdAt: now,
    updatedAt: now,
    lastReviewedAt: null,
    archivedAt: null,
    deletedAt: null,
  });
  const writes = [
    { path: targetDeckPath, data: deck as unknown as Record<string, unknown> },
    ...cards.map((card) => ({ path: cardPath(input.account.uid, card.id), data: card })),
  ];
  return {
    detail: { deck, cards },
    paths: writes.map((write) => write.path),
    writes,
    productGuard: aiUsageProductGuard(null),
  };
}

export function generatedFlashcardDraftMutation(
  documents: Record<string, Record<string, unknown> | null>,
  draft: PreparedGeneratedFlashcardDraft,
) {
  if (aiUsageProductGuard(documents[draft.paths[0]] ?? null) !== draft.productGuard
    || draft.paths.slice(1).some((path) => documents[path])) {
    throw new FlashcardServiceError(409, "DECK_CONFLICT", "The generated deck changed before it could be saved.");
  }
  return { writes: draft.writes, result: draft.detail };
}

export async function preparedGeneratedFlashcardDraftFromDetail(
  account: Pick<ServerAccount, "uid">,
  value: unknown,
  productGuard: string,
  expected: RecoveredGeneratedFlashcardDraftIdentity,
): Promise<PreparedGeneratedFlashcardDraft> {
  const invalid = (): never => {
    throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The saved generated deck cannot be safely recovered.");
  };
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["deck", "cards"].includes(key))
    || productGuard !== aiUsageProductGuard(null)) invalid();
  const raw = value as { deck?: unknown; cards?: unknown };
  const deck = parsedDeck(raw.deck);
  const cards = Array.isArray(raw.cards) ? raw.cards.map(parsedCard) : [];
  if (!deck || cards.some((card) => !card)) return invalid();
  const recoveredCards = cards as Flashcard[];
  const lessonIds = new Set(deck.lessonIds);
  const settings = deck.generationSettings;
  const scopeMatches = deck.scope === expected.scope
    && (expected.scope === "lesson"
      ? Boolean(expected.lessonId) && deck.lessonIds.length === 1 && deck.lessonIds[0] === expected.lessonId
      : expected.scope === "module"
        ? expected.moduleIndex !== null && deck.moduleIndex === expected.moduleIndex
          && deck.lessonIds.every((lessonId) => lessonId.startsWith(`${expected.moduleIndex}-`))
        : true);
  const moduleIndexMatches = expected.scope === "module"
    ? deck.moduleIndex === expected.moduleIndex
    : deck.version === FLASHCARD_LEGACY_SCHEMA_VERSION
      ? deck.moduleIndex === null || deck.moduleIndex === expected.legacyModuleIndex
      : deck.moduleIndex === null;
  const expectedCardIds = await Promise.all(recoveredCards.map((card, position) => (
    deterministicCardId(deck.version, expected.deckId, position, card.prompt, card.answer)
  )));
  if (deck.id !== expected.deckId || deck.ownerUid !== account.uid
    || deck.revision !== 1 || deck.kind !== "generated" || deck.status !== "draft"
    || deck.courseId !== expected.courseId || typeof deck.courseTopic !== "string"
    || !scopeMatches || !moduleIndexMatches
    || deck.lessonIds.length < 1 || deck.lessonIds.length > 40 || lessonIds.size !== deck.lessonIds.length
    || deck.lessonIds.some((lessonId) => !/^\d+-\d+$/.test(lessonId))
    || !settings || settings.depth !== expected.depth || settings.emphasis !== expected.emphasis
    || settings.includeAttemptedChecks !== expected.includeAttemptedChecks
    || typeof deck.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(deck.sourceFingerprint)
    || recoveredCards.length < 2 || recoveredCards.length > GENERATED_FLASHCARD_LIMIT
    || deck.cardCount !== recoveredCards.length || deck.dueCount !== recoveredCards.length
    || deck.createdAt !== deck.updatedAt || deck.lastReviewedAt !== null || deck.archivedAt !== null || deck.deletedAt !== null
    || recoveredCards.some((card, position) => card.id !== expectedCardIds[position]
      || card.version !== deck.version || card.deckId !== deck.id || card.courseId !== expected.courseId
      || card.position !== position || card.origin !== "generated" || card.deletedAt !== null
      || card.sourceFingerprint !== deck.sourceFingerprint || card.createdAt !== deck.createdAt || card.updatedAt !== deck.updatedAt
      || card.sourceRefs.length < 1 || card.sourceRefs.some((source) => !lessonIds.has(source.lessonId)))
    || new Set(recoveredCards.map((card) => card.id)).size !== recoveredCards.length
    || aiUsageProductGuard({ deck, cards: recoveredCards }) !== aiUsageProductGuard(value)) invalid();
  const writes = [
    { path: deckPath(account.uid, deck.id), data: deck as unknown as Record<string, unknown> },
    ...recoveredCards.map((card) => ({ path: cardPath(account.uid, card.id), data: card })),
  ];
  return {
    detail: { deck, cards: recoveredCards },
    paths: writes.map((write) => write.path),
    writes,
    productGuard,
  };
}

export async function createGeneratedFlashcardDraft(input: GeneratedFlashcardDraftInput) {
  const existing = parsedDeck(await getStoredDocument(deckPath(input.account.uid, input.deckId)));
  if (existing) return getFlashcardDeckDetail(input.account, input.deckId);
  const draft = await prepareGeneratedFlashcardDraft(input);
  await putStoredDocuments(draft.writes);
  return draft.detail;
}

export async function updateFlashcardDeck(
  account: Pick<ServerAccount, "uid" | "plan" | "isOwner">,
  deckId: string,
  raw: unknown,
) {
  assertDecksEnabled();
  const input = deckUpdateInputSchema.safeParse(raw);
  if (!input.success) throw new FlashcardServiceError(400, "INVALID_DECK", input.error.issues[0]?.message ?? "Invalid deck update.");
  const current = await getFlashcardDeckDetail(account, deckId);
  const currentIds = new Set(current.cards.map((card) => card.id));
  const additions = input.data.cards.filter((card) => !card.id || !currentIds.has(card.id));
  if (current.deck.kind !== "custom" && additions.length && !canCreateCustomDeck(account)) {
    throw new FlashcardServiceError(403, "CUSTOM_CARD_PLAN_REQUIRED", "Adding manual cards is included with Filosage Plus and Pro.");
  }
  const now = new Date().toISOString();
  const nextCards: Flashcard[] = await Promise.all(input.data.cards.map(async (card, position) => {
    const previous = card.id ? current.cards.find((candidate) => candidate.id === card.id) : undefined;
    const id = previous?.id ?? (await sha256(`${deckId}:${crypto.randomUUID()}:${card.prompt}`)).slice(0, 40);
    const changed = previous && (previous.prompt !== card.prompt || previous.answer !== card.answer || previous.type !== card.type);
    return {
      id,
      version: previous?.version ?? FLASHCARD_SCHEMA_VERSION,
      deckId,
      courseId: previous?.courseId ?? current.deck.courseId,
      position,
      prompt: card.prompt,
      answer: card.answer,
      type: card.type,
      origin: previous
        ? previous.origin === "generated" && changed ? "generated-edited" : previous.origin
        : "manual",
      objectiveIds: previous?.objectiveIds ?? [],
      sourceRefs: previous?.sourceRefs ?? [],
      sourceFingerprint: previous?.sourceFingerprint ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    } satisfies Flashcard;
  }));
  const nextIds = new Set(nextCards.map((card) => card.id));
  const removed = current.cards.filter((card) => !nextIds.has(card.id));
  const paths = [deckPath(account.uid, deckId), ...new Set([...current.cards, ...nextCards].map((card) => cardPath(account.uid, card.id)))];
  await runStoredDocumentTransaction(paths, (documents) => {
    const deck = parsedDeck(documents[deckPath(account.uid, deckId)]);
    if (!deck || deck.ownerUid !== account.uid) throw new FlashcardServiceError(404, "DECK_NOT_FOUND", "Flashcard deck not found.");
    if (deck.revision !== input.data.revision) throw new FlashcardServiceError(409, "DECK_CONFLICT", "This deck changed on another device. Reload before saving.");
    const nextDeck: FlashcardDeck = {
      ...deck,
      title: input.data.title,
      description: input.data.description,
      status: input.data.status,
      revision: deck.revision + 1,
      cardCount: nextCards.length,
      dueCount: Math.min(nextCards.length, deck.dueCount + additions.length),
      archivedAt: input.data.status === "archived" ? now : null,
      updatedAt: now,
    };
    return {
      writes: [
        { path: deckPath(account.uid, deckId), data: nextDeck },
        ...nextCards.map((card) => ({ path: cardPath(account.uid, card.id), data: card })),
      ],
      deletes: removed.flatMap((card) => [cardPath(account.uid, card.id), reviewPath(account.uid, card.id)]),
      result: undefined,
    };
  });
  return getFlashcardDeckDetail(account, deckId);
}

export async function deleteFlashcardDeck(account: Pick<ServerAccount, "uid">, deckId: string) {
  assertDecksEnabled();
  const detail = await getFlashcardDeckDetail(account, deckId);
  await deleteStoredDocuments([
    deckPath(account.uid, deckId),
    ...detail.cards.flatMap((card) => [cardPath(account.uid, card.id), reviewPath(account.uid, card.id)]),
  ]);
}

export async function rateFlashcard(
  account: Pick<ServerAccount, "uid">,
  deckId: string,
  cardId: string,
  rating: FlashcardRating,
) {
  assertDecksEnabled();
  const paths = [deckPath(account.uid, deckId), cardPath(account.uid, cardId), reviewPath(account.uid, cardId)];
  const now = new Date();
  return runStoredDocumentTransaction(paths, (documents) => {
    const deck = parsedDeck(documents[paths[0]]);
    const card = parsedCard(documents[paths[1]]);
    const previousResult = flashcardReviewStateSchema.safeParse(documents[paths[2]]);
    const previous = previousResult.success ? previousResult.data : null;
    if (!deck || deck.ownerUid !== account.uid || deck.status === "deleted") throw new FlashcardServiceError(404, "DECK_NOT_FOUND", "Flashcard deck not found.");
    if (!card || card.deckId !== deckId || card.deletedAt) throw new FlashcardServiceError(404, "CARD_NOT_FOUND", "Flashcard not found.");
    const dueAt = nextFlashcardDueAt(rating, previous, now);
    const reviewedAt = now.toISOString();
    const state = {
      version: FLASHCARD_SCHEMA_VERSION,
      deckId,
      cardId,
      courseId: deck.courseId,
      dueAt,
      repetitions: (previous?.repetitions ?? 0) + (rating === "got-it" ? 1 : 0),
      lapses: (previous?.lapses ?? 0) + (rating === "again" ? 1 : 0),
      lastRating: rating,
      lastReviewedAt: reviewedAt,
      updatedAt: reviewedAt,
    };
    return {
      writes: [
        { path: paths[2], data: state },
        {
          path: paths[0],
          data: {
            ...deck,
            dueCount: Math.max(0, deck.dueCount - (previous && Date.parse(previous.dueAt) > now.getTime() ? 0 : 1)),
            lastReviewedAt: reviewedAt,
            updatedAt: reviewedAt,
          },
        },
      ],
      result: state,
    };
  });
}

export function flashcardStorageCollections() {
  return { decks: DECK_COLLECTION, cards: CARD_COLLECTION, review: REVIEW_COLLECTION } as const;
}
