/**
 * Prompt construction for Tier B/C course illustrations (module + lesson art).
 *
 * Design contract (matches the course-banner visual system):
 * - Text-free. In-image words are the top source of AI-artifact defects, so
 *   illustrations carry zero rendered text. Authoritative wording always lives
 *   in the lesson text and the image alt text beside it.
 * - One concept per image: a fine line-engraved anchor on warm oatmeal paper,
 *   surrounded by solid coral/teal poster shapes — the same engraved-plate
 *   grammar as the course hero, so a course reads as one authored set.
 * - Content is centered with balanced quiet margins, so the art survives every
 *   crop from header to thumbnail.
 * - Never photorealistic people. Hands/people appear only as simplified
 *   silhouettes when the subject demands a human anchor.
 */

export const COURSE_ILLUSTRATION_STYLE_VERSION = 2;

export interface ModuleIllustrationPromptInput {
  courseTopic: string;
  moduleTitle: string;
  moduleDescription?: string;
  moduleObjective?: string;
  keyConcepts?: string[];
}

export interface LessonIllustrationPromptInput {
  courseTopic: string;
  moduleTitle: string;
  lessonTitle: string;
  lessonConcept?: string;
  learningObjective?: string;
  keyTakeaways?: string[];
}

function normalized(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizedList(values: Array<string | undefined>) {
  return values.map(normalized).filter(Boolean).slice(0, 4);
}

export function moduleIllustrationFingerprintMaterial(input: ModuleIllustrationPromptInput) {
  return [
    COURSE_ILLUSTRATION_STYLE_VERSION,
    "module",
    normalized(input.courseTopic).toLowerCase(),
    normalized(input.moduleTitle).toLowerCase(),
    normalized(input.moduleObjective).toLowerCase(),
  ].join("|");
}

export function lessonIllustrationFingerprintMaterial(input: LessonIllustrationPromptInput) {
  return [
    COURSE_ILLUSTRATION_STYLE_VERSION,
    "lesson",
    normalized(input.courseTopic).toLowerCase(),
    normalized(input.moduleTitle).toLowerCase(),
    normalized(input.lessonTitle).toLowerCase(),
    normalized(input.learningObjective).toLowerCase(),
  ].join("|");
}

const SHARED_GRAMMAR = [
  "Visual grammar: a vintage technical engraving letterpress-printed on warm paper, in the same visual system as the course hero. One engraved anchor drawn in navy ink — fine hairline strokes, delicate hatching, simplified to its essential forms — surrounded by one or two solid screen-printed shapes in coral and teal plus restrained dotted paths. Flat solid inks on the graphic shapes, fine engraved lines on the anchor. Calm, intelligent, and crafted rather than decorative.",
  "Material: visibly tactile, heavyweight uncoated warm oatmeal paper (#E7DDCE) stock, rendered straight-on like a premium manual plate. Fine natural fibers, softened ink, slight pigment variation. No glossy 3D rendering, plastic, glass, neon glow, lens effects, painterly brushwork, or photorealism.",
  "Palette: warm oatmeal paper ground; navy (#0D1B3D) engraving ink; coral (#FF8A65) and teal (#14B8A6) solid accent inks with strong contrast. Solid ink fields only; no gradients.",
  "Absolute text ban: do not render words, letters, numbers, mathematical notation, symbols, logos, labels, captions, watermarks, signs, screens, or marked paper. Every surface must be blank.",
  "Do not use faces, detailed hands, people, classrooms, or multi-object still lifes. A simplified human silhouette may anchor the composition only when the subject is a physical skill, rendered in the same engraved linework.",
];

export function buildModuleIllustrationPrompt(input: ModuleIllustrationPromptInput) {
  const concepts = normalizedList([input.moduleDescription, input.moduleObjective, ...(input.keyConcepts ?? [])]);
  return [
    "Create a text-free square editorial illustration for one module inside a Filosage course, in the same visual system as the course hero.",
    `Course topic: ${normalized(input.courseTopic)}.`,
    `This module: ${normalized(input.moduleTitle)}.`,
    ...concepts.map((concept) => `Module meaning: ${concept}.`),
    "Translate this module's single core idea into exactly one recognizable subject anchor rendered as a fine line engraving. The anchor must be unmistakably related to the module while remaining subordinate to the composition.",
    "Composition: square 1:1, one decisive focal form centered in the frame with balanced quiet margins on all sides, so the art stays centered and legible from a 320-pixel module header down to a 96-pixel thumbnail.",
    "Thumbnail test: no more than five major shapes; the relationship must read at 96 pixels wide.",
    ...SHARED_GRAMMAR,
  ].filter(Boolean).join("\n");
}

export function buildLessonIllustrationPrompt(input: LessonIllustrationPromptInput) {
  const concepts = normalizedList([input.lessonConcept, input.learningObjective, ...(input.keyTakeaways ?? [])]);
  return [
    "Create a text-free square editorial illustration for one lesson inside a Filosage course, in the same visual system as the course hero and module art.",
    `Course topic: ${normalized(input.courseTopic)}.`,
    `Module: ${normalized(input.moduleTitle)}. Lesson: ${normalized(input.lessonTitle)}.`,
    ...concepts.map((concept) => `Lesson meaning: ${concept}.`),
    "Translate this lesson's single takeaway into exactly one recognizable subject anchor rendered as a fine line engraving. One concept per image: illustrate the takeaway, not the whole lesson.",
    "Composition: square 1:1, one decisive focal form centered in the frame with balanced quiet margins on all sides, so the art stays centered and legible from a 320-pixel lesson header down to a 96-pixel thumbnail.",
    "Thumbnail test: no more than five major shapes; the relationship must read at 96 pixels wide.",
    ...SHARED_GRAMMAR,
  ].filter(Boolean).join("\n");
}
