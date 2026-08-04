export const MAX_MODERATION_BATCH_CHARACTERS = 8_000;

const EXCERPT_SEPARATOR = "\n[...moderation excerpt...]\n";

function compactWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function stratifiedExcerpt(input: string, budget: number) {
  if (input.length <= budget) return input;
  if (budget <= EXCERPT_SEPARATOR.length * 2 + 3) return input.slice(0, budget);

  const available = budget - EXCERPT_SEPARATOR.length * 2;
  const firstLength = Math.ceil(available / 3);
  const middleLength = Math.floor(available / 3);
  const lastLength = available - firstLength - middleLength;
  const middleStart = Math.max(firstLength, Math.floor((input.length - middleLength) / 2));

  return [
    input.slice(0, firstLength),
    input.slice(middleStart, middleStart + middleLength),
    input.slice(-lastLength),
  ].join(EXCERPT_SEPARATOR).slice(0, budget);
}

function fairCharacterBudgets(lengths: number[], totalBudget: number) {
  const budgets = Array.from({ length: lengths.length }, () => 0);
  const ordered = lengths
    .map((length, index) => ({ index, length }))
    .sort((left, right) => left.length - right.length);
  let remaining = Math.max(0, totalBudget);

  for (let position = 0; position < ordered.length; position += 1) {
    const activeCount = ordered.length - position;
    const share = Math.floor(remaining / activeCount);
    const current = ordered[position];
    if (current.length <= share) {
      budgets[current.index] = current.length;
      remaining -= current.length;
      continue;
    }

    for (let active = position; active < ordered.length; active += 1) {
      const item = ordered[active];
      const allocation = Math.min(item.length, Math.floor(remaining / (ordered.length - active)));
      budgets[item.index] = allocation;
      remaining -= allocation;
    }
    break;
  }

  return budgets;
}

/**
 * Keeps one moderation request below the lowest published omni-moderation TPM
 * tier while representing every document. Full inputs still pass local policy
 * checks before this provider-oriented excerpt is built.
 */
export function buildModerationInputs(
  inputs: string[],
  totalBudget = MAX_MODERATION_BATCH_CHARACTERS,
) {
  const compacted = inputs.map(compactWhitespace);
  const budgets = fairCharacterBudgets(compacted.map((input) => input.length), totalBudget);
  return compacted.map((input, index) => stratifiedExcerpt(input, budgets[index] ?? 0));
}
