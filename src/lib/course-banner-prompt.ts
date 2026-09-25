export const COURSE_BANNER_STYLE_VERSION = 6;

export interface CourseBannerPromptInput {
  topic: string;
  category?: string;
  outcome?: string;
  mission?: string;
}

function normalized(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function courseBannerFingerprintMaterial(
  input: CourseBannerPromptInput,
  variant: 0 | 1,
) {
  return [
    COURSE_BANNER_STYLE_VERSION,
    variant,
    normalized(input.topic).toLowerCase(),
    normalized(input.category).toLowerCase(),
    normalized(input.outcome).toLowerCase(),
    normalized(input.mission).toLowerCase(),
  ].join("|");
}

export function buildCourseBannerPrompt(input: CourseBannerPromptInput) {
  return [
    "Create a text-free panoramic editorial illustration for a Filosage course card in the Course Deck visual system.",
    `Course topic: ${normalized(input.topic)}.`,
    input.category ? `Broad discipline: ${normalized(input.category)}.` : "",
    input.outcome ? `Learner outcome: ${normalized(input.outcome)}` : "",
    input.mission ? `Applied mission: ${normalized(input.mission)}` : "",
    "Translate the complete course meaning into exactly one recognizable subject anchor and one relationship motif. Render the subject anchor as a fine line engraving in navy ink — precise hairline strokes, delicate hatching, exact construction geometry, simplified to its essential forms — like a vintage technical plate. The anchor must be an iconic form unmistakably related to the topic, never a literal scene or a collection of topic objects. The relationship motif may express orbit, threshold, feedback, flow, balance, sequence, framing, scale, or transformation through spatial composition and restrained dotted paths only.",
    "Visual grammar: a vintage technical engraving letterpress-printed on warm paper. One engraved navy anchor, surrounded by the bold graphic language of screen-printed poster art: one or two solid ink shapes (a disc, an arc, or a partial circle) in coral and teal, plus restrained dotted paths radiating like signals. Flat solid inks on the graphic shapes, fine engraved lines on the anchor. Forms may overlap or crop beyond the frame. The result should feel authored, intelligent, calm, and crafted rather than decorative.",
    "Material: visibly tactile, heavyweight uncoated warm oatmeal paper (#E7DDCE) stock, rendered straight-on like a page from a beautifully printed manual. Show fine natural fibers, softened ink, and slight pigment variation while keeping the engraving precise. No glossy 3D rendering, plastic, glass, neon glow, lens effects, distressed grunge, painterly brushwork, or photorealism.",
    "Palette: warm oatmeal paper ground. Navy (#0D1B3D) ink for the engraved anchor and construction lines; coral (#FF8A65) and teal (#14B8A6) as solid screen-printed accent inks with strong contrast. Solid ink fields only; do not add gradients.",
    "Composition: landscape 3:2 with the focal system centered in the frame and balanced quiet margins on all sides. The content must read as centered — never pushed to one side — so the artwork stays centered and legible as a wide hero, a 2:1 card, a compact drawer thumbnail, or a partially covered deck card.",
    "Thumbnail test: use no more than seven major shapes and keep the primary relationship recognizable at 160 pixels wide. Favor scale, spacing, and the tactile paper stock over fine detail. The result should look like a physical course-cover card, not a flat software illustration.",
    "Absolute text ban: do not render words, letters, numbers, mathematical notation, currency symbols, logos, labels, captions, watermarks, signatures, book spines, signs, screens, or marked paper. Every surface must be blank.",
    "Do not use detailed charts, calendars, dashboards, arrows, badges, coins, locks, faces, hands, people, classrooms, landscapes, books, or multi-object still lifes. This is semantic course-cover art, not a labeled technical diagram. Keep the single engraved anchor subordinate to the relationship between unmarked geometric forms.",
  ].filter(Boolean).join("\n");
}
