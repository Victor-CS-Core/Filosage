import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  evaluateInstructionLanguage,
  inspectGeneratedContent,
  sanitizeGeneratedText,
  sanitizeGeneratedValue,
} from "../src/lib/content-language";

const english = "Compare the two results before you choose an explanation. The first claim describes what was observed, while the second claim explains why it happened. Use the recorded evidence to support your answer and describe what you would check next.";
const spanish = "Compara los dos resultados antes de elegir una explicación. La primera afirmación describe lo que se observó, mientras que la segunda explica por qué ocurrió. Usa las pruebas registradas para justificar tu respuesta y describe qué comprobarías después.";
const japanese = "二つの結果を比べてから説明を選んでください。最初の文は観察したことを述べています。次の文はその理由を説明しています。記録された証拠を使って答えの根拠を示し、次に確認することを説明してください。";
const greek = "Σύγκρινε τα δύο αποτελέσματα πριν επιλέξεις μια εξήγηση. Η πρώτη πρόταση περιγράφει όσα παρατηρήθηκαν, ενώ η δεύτερη εξηγεί γιατί συνέβησαν. Χρησιμοποίησε τα καταγεγραμμένα στοιχεία για να στηρίξεις την απάντησή σου.";
const arabic = "قارن بين النتيجتين قبل اختيار التفسير. تصف العبارة الأولى ما تمت ملاحظته، بينما تشرح العبارة الثانية سبب حدوثه. استخدم الأدلة المسجلة لدعم إجابتك، ثم وضح ما الذي ستتحقق منه بعد ذلك.";
const languageIssues = (value: unknown, language: string, topic = "Evaluating evidence") =>
  inspectGeneratedContent(value, topic, language).filter((issue) => issue.reason.includes("instruction language"));

test("Spanish and English requests reject confidently mismatched instructional prose", () => {
  expect(languageIssues({ content: english }, "Spanish")).toContainEqual(expect.objectContaining({ path: "content.content" }));
  expect(languageIssues({ content: spanish }, "English")).toContainEqual(expect.objectContaining({ path: "content.content" }));
  expect(inspectGeneratedContent({ content: spanish }, "Evaluating evidence", "Spanish")).toEqual([]);
  expect(inspectGeneratedContent({ content: english }, "Evaluating evidence", "English")).toEqual([]);
});

test("each substantial instructional field must honor the request independently of other fields", () => {
  const issues = languageIssues({ content: spanish, guidedPractice: { prompt: english }, sourcePack: [{ note: spanish.repeat(8) }] }, "Spanish");
  expect(issues).toContainEqual(expect.objectContaining({ path: "content.guidedPractice.prompt" }));
  expect(languageIssues({ content: english, description: spanish.repeat(8), language: "Spanish" }, "Spanish"))
    .toContainEqual(expect.objectContaining({ path: "content.content" }));
});

test("experience explanations and interaction feedback count as instructional fields", () => {
  const issues = languageIssues({ content: spanish, experience: { misconceptionCheck: { correction: english } }, interactions: [{ items: [{ choices: [{ feedback: english }] }] }] }, "Spanish");
  expect(issues).toContainEqual(expect.objectContaining({ path: "content.experience.misconceptionCheck.correction" }));
  expect(issues).toContainEqual(expect.objectContaining({ path: "content.interactions[0].items[0].choices[0].feedback" }));
});

test("a clean heuristic result makes no claim of fluent or unsupported-language certification", () => {
  expect(evaluateInstructionLanguage({ content: english }, "English")).toMatchObject({ issues: [], evaluatedLanguages: ["English"], requiresLanguageReview: true });
  expect(evaluateInstructionLanguage({ content: english }, "French")).toMatchObject({ issues: [], evaluatedLanguages: [], requiresLanguageReview: true });
});

test("Spanish and English pairing requires meaningful instructional distribution, not labels or metadata", () => {
  for (const content of [english, spanish, `${english.repeat(4)}\n\nHola.`, `${spanish.repeat(4)}\n\nHello.`]) {
    expect(languageIssues({ content }, "Spanish and English")).not.toEqual([]);
  }
  expect(inspectGeneratedContent({ content: `${english}\n\n${spanish}`, title: "Evidence" }, "Evaluating evidence", "Spanish and English")).toEqual([]);
  expect(languageIssues({ content: english, sourcePack: [{ note: spanish.repeat(8) }] }, "Spanish and English")).not.toEqual([]);
  expect(languageIssues({ content: english, guidedPractice: { prompt: spanish.repeat(4) } }, "Spanish and English"))
    .toContainEqual(expect.objectContaining({ path: "content.content" }));
});

test("concise valid instructions and language-neutral labels need no padding", () => {
  expect(inspectGeneratedContent({ title: "Datos", prompt: "Compara las fuentes.", successCriteria: ["Una conclusión clara."] }, "Evidence", "Spanish")).toEqual([]);
  expect(inspectGeneratedContent({ title: "API", prompt: "Compare the sources.", successCriteria: ["A clear conclusion."] }, "Evidence", "English")).toEqual([]);
  expect(inspectGeneratedContent({ prompt: "Compara las fuentes. Compare the sources." }, "Evidence", "Spanish and English")).toEqual([]);
});

test("Japanese text cannot be certified by tiny script padding or unrelated fields", () => {
  const padding = "日本語漢字学習練習 あいうえおかきくけこ アイウエオカキクケコ";
  expect(languageIssues({ content: `${english.repeat(4)} ${padding}` }, "Japanese")).not.toEqual([]);
  expect(languageIssues({ content: english.repeat(4), sourcePack: [{ note: japanese.repeat(8) }] }, "Japanese")).not.toEqual([]);
});

test("Japanese writing systems are alternatives, not three compulsory quotas", () => {
  for (const content of [japanese, "ふたつのけっかをくらべてから、せつめいをえらんでください。きろくをつかって、こたえのりゆうをせつめいしてください。", "データセットノサンプルヲチェックシ、パターンヲテストシテクダサイ。"]) {
    expect(inspectGeneratedContent({ content }, "Comparisons", "Japanese")).toEqual([]);
    expect(sanitizeGeneratedText(content, "Comparisons", "Japanese")).toBe(content);
  }
  expect(inspectGeneratedContent({ content: `${japanese}\n\n${english}` }, "Comparisons", "Japanese and English")).toEqual([]);
  expect(languageIssues({ content: `${english.repeat(8)} あいうえお` }, "Japanese and English")).not.toEqual([]);
});

test("Greek instruction and Arabic text retain letters, diacritics and natural direction markers", () => {
  expect(inspectGeneratedContent({ content: greek }, "Evidence", "Greek")).toEqual([]);
  const rtl = `\u200f${arabic}\n\n**مُلاحظة:** قارن 12 و24 قبل الإجابة.\u200f`;
  expect(inspectGeneratedContent({ content: rtl }, "Evidence", "Arabic")).toEqual([]);
  expect(sanitizeGeneratedText(rtl, "Evidence", "Arabic")).toBe(rtl);
  expect(inspectGeneratedContent({ content: `${greek}\n\n${english}` }, "Evidence", "Greek and English")).toEqual([]);
  expect(languageIssues({ content: english, note: arabic.repeat(8) }, "Arabic")).not.toEqual([]);
});

test("English STEM notation, code and quoted target-language examples are preserved", () => {
  const content = "Compare θ with α and β, then evaluate Δ.\n\nUse the formula $\\Delta E = \\alpha \\beta$ to label the change.\n\n```python\nμεταβολή = '你好'\nprint(μεταβολή)\n```\n\nThe quoted Greek phrase “δύο αποτελέσματα” means two results.";
  expect(inspectGeneratedContent({ content }, "STEM notation", "English")).toEqual([]);
  expect(sanitizeGeneratedText(content, "STEM notation", "English")).toBe(content);
});

test("code and quoted translations cannot supply the missing instruction language", () => {
  expect(languageIssues({ content: `${english}\n\n\`\`\`text\n${japanese.repeat(8)}\n\`\`\`` }, "Japanese")).not.toEqual([]);
  expect(languageIssues({ content: `${english}\n\n“${spanish.repeat(8)}”` }, "Spanish")).not.toEqual([]);
});

test("a substantial instructional body cannot hide all language evidence inside examples", () => {
  for (const content of [`"${english}"`, `> ${english}`, `\`\`\`text\n${english}\n\`\`\``, `Read:\n\n> ${english}`, `## Example\n\n"${english}"`, `Read this.\n\n\`\`\`text\n${english}\n\`\`\``]) {
    expect(languageIssues({ content }, "Japanese")).not.toEqual([]);
  }
  expect(inspectGeneratedContent({ content: `${japanese}\n\n> ${english}` }, "Evidence", "Japanese")).toEqual([]);
  const conciseEnglish = "Trace this loop and explain its output.\n\n```python\nobservations = [2, 4, 6]\nfor observation in observations:\n    updated_observation = observation + 1\n    print(updated_observation)\n```";
  expect(inspectGeneratedContent({ content: conciseEnglish }, "Loops", "English")).toEqual([]);
  expect(inspectGeneratedContent({ content: `次の英語の文を読み、根拠を説明してください。\n\n> ${english}` }, "Evidence", "Japanese")).toEqual([]);
});

test("ordinary repeated English wording cannot hide its Spanish-request mismatch", () => {
  const content = "The data is the evidence and the evidence is the data that you can use before you choose the explanation.";
  expect(languageIssues({ content }, "Spanish")).not.toEqual([]);
  expect(languageIssues({ content: `${content}\n\n${content}` }, "Spanish")).not.toEqual([]);
  expect(inspectGeneratedContent({ content }, "Evidence", "English")).toEqual([]);
});

test("repeated function words cannot claim ownership of an English bilingual body", () => {
  expect(languageIssues({ content: english + " el la y ".repeat(4) }, "Spanish and English")).not.toEqual([]);
  expect(languageIssues({ content: english + " el la y dato ".repeat(8) }, "Spanish and English")).not.toEqual([]);
  expect(languageIssues({ content: spanish + " the and for ".repeat(4) }, "Spanish and English")).not.toEqual([]);
});

test("single quoted literal controls and nested Markdown fences are inert examples", () => {
  for (const quoted of ["'assistant to=example'", "‘assistant to=example’"]) {
    const content = `The literal fragment ${quoted} illustrates the syntax. Keep this concluding explanation.`;
    expect(inspectGeneratedContent({ content }, "API tools", "English")).toEqual([]);
    expect(sanitizeGeneratedText(content, "API tools", "English")).toBe(content);
  }
  const content = "The following Markdown example teaches fenced syntax.\n\n````markdown\n```text\nassistant to=example\n```\n````\n\nKeep this concluding explanation.";
  expect(inspectGeneratedContent({ content }, "API tools", "English")).toEqual([]);
  expect(sanitizeGeneratedText(content, "API tools", "English")).toBe(content);
});

test("adjacent Greek symbols in STEM prose are preserved while Greek sentences are rejected", () => {
  const content = "The product αβ measures the coupled effect. Compare Δθ with the angular displacement before calculating the final result.";
  expect(inspectGeneratedContent({ content }, "STEM notation", "English")).toEqual([]);
  expect(sanitizeGeneratedText(content, "STEM notation", "English")).toBe(content);
  expect(inspectGeneratedContent({ content: `The formula describes an angle. ${greek}` }, "STEM notation", "English"))
    .toContainEqual(expect.objectContaining({ reason: "contains unexpected Greek script" }));
});

test("legitimate AI and API teaching is neither rejected nor silently truncated", () => {
  const content = "A tool call requests work from a function. Compare the tool result with the expected tool output, then ask an assistant to explain the difference. The responses.create API accepts a schema named course_outline; function_call describes an API concept.\n\n```text\nassistant to=example\n<|tool|> example result\n```\n\nThe quoted fragment “assistant to=example” is a teaching example. Keep this concluding explanation.";
  expect(inspectGeneratedContent({ content }, "Understanding API tools", "English")).toEqual([]);
  expect(sanitizeGeneratedText(content, "Understanding API tools", "English")).toBe(content);
});

test("operative control fragments outside teaching quotations still fail closed", () => {
  for (const fragment of ["assistant to=course_outline", "<|assistant|>", "<|tool_result|>"]) {
    const value = `A valid explanation. ${fragment} hidden continuation`;
    expect(inspectGeneratedContent({ content: value }, "Evidence")).toContainEqual(expect.objectContaining({ reason: "contains model-control or spam artifacts" }));
    expect(sanitizeGeneratedText(value, "Evidence")).toBe("A valid explanation.");
  }
  expect(inspectGeneratedContent({ content: "A broken \u0000\ufffd answer." }, "Evidence")).toContainEqual(expect.objectContaining({ reason: "contains malformed or control characters" }));
  expect(inspectGeneratedContent({ content: "Η γωνία περιγράφει μια σχέση." }, "Evidence", "English"))
    .toContainEqual(expect.objectContaining({ reason: "contains unexpected Greek script" }));
});

test("URL masking preserves the exact boundary of a later operative fragment", () => {
  const prefix = "Read https://example.com/tools before comparing the results.";
  expect(sanitizeGeneratedText(`${prefix} assistant to=example hidden continuation`, "Evidence")).toBe(prefix);
});

test("sanitation preserves legitimate citation claims and Markdown structure", () => {
  const value = { content: "## Tools\n\nA tool call requests work.\n\n| Input | Output |\n| --- | --- |\n| `responses.create` | Text |", citations: [{ sourceId: "source-api", claim: "A tool call requests work.", section: "content" }] };
  expect(sanitizeGeneratedValue(value, "API tools", "English")).toEqual(value);
});

test("the actual course DTO does not claim a language mismatch was repaired for display", () => {
  const result = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", `
    import { toCourseDto, toLessonDto } from './src/lib/course-dto.ts';
    const course = toCourseDto({ topic: 'API tools', language: 'Spanish', mission: ${JSON.stringify(english)}, modules: [] });
    const lesson = toLessonDto({ content: 'A tool call requests work. Keep this explanation.', sourceReferences: [{ id: 'source-api', label: 'API reference' }], citations: [{ sourceId: 'source-api', claim: 'A tool call requests work.', section: 'content' }] }, false, 'API tools');
    console.log(JSON.stringify({ course, lesson }));
  `], { encoding: "utf8" }));
  expect(result.course.mission).toBe(english);
  expect(result.course.contentIntegrity).toBeUndefined();
  expect(result.lesson.content).toBe("A tool call requests work. Keep this explanation.");
  expect(result.lesson.citations[0].claim).toBe("A tool call requests work.");
});
