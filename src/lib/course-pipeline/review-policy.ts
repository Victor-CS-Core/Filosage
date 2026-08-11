export const COURSE_REVIEW_POLICY_VERSION = "course-review-policy-v1.1.0";

const HIGH_STAKES_PATTERNS = [
  { code: "medical", pattern: /\b(?:medical|medicine|clinical|patients?|diagnos(?:is|e|tic)|symptoms?|first[- ]aid|bleeding|stroke|heart attack|cardiac|choking|airway|insulin|anaphylaxis|allergic reaction|wound care|surgical|surgery|dose|dosage|medication|prescription|cpr|pregnan(?:cy|t)|suicide|self[- ]harm|mental health crisis|diabetes|nutrition therapy|seizure|poisoning|infection|burn care|fracture|(?:treat(?:ment|ing)(?:\s+(?:of|for))?\s+(?:patients?|symptoms?|disease|illness|injur(?:y|ies)|infection|cancer|diabetes|fractures?|wounds?))|primeros auxilios|hemorragia|accidente cerebrovascular|salud mental|medicamento|premiers? secours|hémorragie|accident vasculaire cérébral|santé mentale|médicament|primeiros socorros|sangramento|saúde mental)\b/i },
  { code: "legal", pattern: /\b(?:legal advice|lawsuit|contract law|immigration law|criminal law|liability law|statute|regulation|regulatory obligations?|asesoría legal|derecho migratorio|obligaciones regulatorias|conseil juridique|droit de l'immigration|obligations réglementaires)\b/i },
  { code: "financial", pattern: /\b(?:financial advice|investing|investment|tax|retirement|securities|mortgage|credit repair|asesoría financiera|inversión|impuestos|jubilación|conseil financier|investissement|impôts|retraite)\b/i },
  { code: "physical_safety", pattern: /\b(?:firearm|weapon|explosive|electrical (?:safety|wiring|repair)|hazardous chemical|emergency response|knife safety|confined space|fall protection|lockout[- ]tagout|gas leak|fire safety|seguridad eléctrica|cableado eléctrico|reparación eléctrica|fuga de gas|seguridad contra incendios|sécurité électrique|câblage électrique|réparation électrique|fuite de gaz|sécurité incendie|segurança elétrica|fiação elétrica|vazamento de gás|segurança contra incêndios)\b/i },
  { code: "freshness", pattern: /(?:\b(?:current|latest|as of today|up-to-date|actual|vigente|más reciente|actuel(?:le)?|à jour|récent(?:e)?|atual|mais recente)\b[^\n]{0,80}\b(?:regulation|law|guidance|standard|requirement|policy|regulación|ley|orientación|norma|requisito|política|réglementation|loi|orientation|norme|exigence|politique|regulamentação|lei|orientação|padrão|requisito|política)\b|\b(?:regulation|law|guidance|standard|requirement|policy|regulación|ley|orientación|norma|requisito|política|réglementation|loi|orientation|norme|exigence|politique|regulamentação|lei|orientação|padrão|requisito|política)\b[^\n]{0,80}\b(?:current|latest|up-to-date|actual|vigente|más reciente|actuel(?:le)?|à jour|récent(?:e)?|atual|mais recente)\b)/i },
] as const;

export function courseReviewPolicyForBrief(...values: Array<string | undefined>) {
  const text = values.filter(Boolean).join("\n");
  const reasonCodes = HIGH_STAKES_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.code);
  return {
    version: COURSE_REVIEW_POLICY_VERSION,
    required: reasonCodes.length > 0,
    reasonCodes,
  };
}

export function effectiveCourseReviewPolicy(course: {
  topic?: string;
  mission?: string;
  outcome?: string;
  freshnessRequired?: boolean;
  modules?: Array<{
    title?: string;
    description?: string;
    lessons?: Array<{ title?: string; concept?: string; objective?: string }>;
  }>;
  manualReviewPolicy?: { required?: boolean; reasonCodes?: string[] };
}) {
  const derived = courseReviewPolicyForBrief(
    course.topic,
    course.mission,
    course.outcome,
    course.modules?.flatMap((courseModule) => [
      courseModule.title,
      courseModule.description,
      ...(courseModule.lessons ?? []).flatMap((lesson) => [lesson.title, lesson.concept, lesson.objective]),
    ]).filter((value): value is string => Boolean(value)).join(" "),
    course.freshnessRequired ? "current regulation requirement" : undefined,
  );
  const reasonCodes = [...new Set([
    ...(course.manualReviewPolicy?.reasonCodes ?? []),
    ...derived.reasonCodes,
  ])];
  return {
    version: COURSE_REVIEW_POLICY_VERSION,
    required: course.manualReviewPolicy?.required === true || derived.required,
    reasonCodes,
  };
}
