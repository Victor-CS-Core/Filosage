function comparableHeading(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function normalizeLessonMarkdown(markdown: string, lessonTitle: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let inFence = false;
  const headings: Array<{ index: number; level: number; text: string }> = [];

  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) headings.push({ index, level: match[1].length, text: match[2] });
  });

  const first = headings[0];
  if (first && comparableHeading(first.text) === comparableHeading(lessonTitle)) {
    lines.splice(first.index, 1);
    headings.shift();
    headings.forEach((heading) => { heading.index -= 1; });
  }

  if (!headings.length) return lines.join("\n").trim();
  const minimumLevel = Math.min(...headings.map((heading) => heading.level));
  const shift = 2 - minimumLevel;
  headings.forEach((heading) => {
    const nextLevel = Math.min(6, Math.max(2, heading.level + shift));
    lines[heading.index] = `${"#".repeat(nextLevel)} ${heading.text}`;
  });

  return lines.join("\n").trim();
}
