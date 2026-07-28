export const COURSE_BANNER_STYLE_VERSION = 2;

export interface CourseBannerPromptInput {
  topic: string;
  category?: string;
}

function normalized(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function buildCourseBannerPrompt(input: CourseBannerPromptInput) {
  return [
    "Create a simple, text-free panoramic editorial illustration for an Erudoza course cover.",
    `Topic to suggest visually: ${normalized(input.topic)}.`,
    input.category ? `Broad discipline: ${normalized(input.category)}.` : "",
    "Use one clear abstract metaphor, not a literal scene or a collection of objects. Build the entire motif from one thin continuous line and two to four simple circles or geometric shapes. Keep it recognizable at thumbnail size.",
    "Style: refined editorial line illustration, calm, intelligent, minimal, and quietly premium. Use consistent thin strokes, rounded joins, and at most one softly filled shape. No photorealism, glossy 3D rendering, textures, tiny details, or complicated mechanisms.",
    "Palette: deep navy background with off-white or muted blue-gray linework, clear blue for one focal point, and no more than one small coral accent. Use solid color fields only.",
    "Composition: landscape 3:2 with a single focal motif inside the central 60 percent and generous empty space around it. The motif must remain clear when cropped to a wide banner or a 2:1 course card.",
    "Absolute text ban: do not render words, letters, numbers, mathematical notation, currency symbols, logos, labels, captions, watermarks, signatures, book spines, signs, screens, or marked paper. Every surface must be blank.",
    "Do not use detailed charts, calendars, dashboards, technical diagrams, arrows, badges, coins, locks, faces, hands, crowds, classrooms, or multi-object still lifes. Do not add decorative clutter. If the topic usually relies on one of these objects, replace it with a simple abstract relationship between unmarked lines and shapes.",
  ].filter(Boolean).join("\n");
}
