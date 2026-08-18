export const COURSE_BANNER_STYLE_VERSION = 5;

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
    "Translate the complete course meaning into exactly one recognizable subject anchor and one relationship motif. The subject anchor should be an iconic, simplified silhouette or form unmistakably related to the topic, never a literal scene or a collection of topic objects. The relationship motif may express orbit, threshold, feedback, flow, balance, sequence, framing, scale, or transformation through spatial composition only.",
    "Visual grammar: precise museum-exhibition geometry made from large circles, partial discs, arcs, fine axes, restrained dotted paths, and one or two architectural rectangles. Forms may overlap or crop beyond the frame. The result should feel authored, intelligent, calm, and cinematic rather than decorative.",
    "Material: visibly tactile, heavyweight uncoated paper or book-board stock, photographed or rendered straight-on like a premium museum-catalog cover. Show fine natural fibers, softened screen-printed ink, slight pigment variation, and restrained edge wear while keeping the geometry precise. No glossy 3D rendering, plastic, glass, neon glow, lens effects, distressed grunge, painterly brushwork, or tiny mechanisms.",
    "Palette: choose one material ground from deep midnight navy, dark petrol teal, warm oatmeal paper, or muted brick. Use teal, warm off-white, and coral as two or three screen-printed inks with strong contrast. Muted blue-gray may support fine construction lines. Use solid ink fields only; do not add gradients.",
    "Composition: landscape 3:2 with a decisive focal system spanning the central and right two-thirds. Preserve quieter crop-safe space along the lower-left and outer edges so the artwork remains legible as a wide hero, a 2:1 card, a compact drawer thumbnail, or a partially covered deck card.",
    "Thumbnail test: use no more than seven major shapes and keep the primary relationship recognizable at 160 pixels wide. Favor scale, spacing, silhouette, and the tactile paper stock over detail. The result should look like a physical course-cover card, not a flat software illustration.",
    "Absolute text ban: do not render words, letters, numbers, mathematical notation, currency symbols, logos, labels, captions, watermarks, signatures, book spines, signs, screens, or marked paper. Every surface must be blank.",
    "Do not use detailed charts, calendars, dashboards, arrows, badges, coins, locks, faces, hands, people, classrooms, landscapes, devices, books, or multi-object still lifes. This is semantic course-cover art, not a labeled technical diagram. Keep the single recognizable anchor subordinate to the relationship between unmarked geometric forms.",
  ].filter(Boolean).join("\n");
}
