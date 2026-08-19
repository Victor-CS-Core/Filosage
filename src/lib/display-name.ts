export const MAX_DISPLAY_NAME_CODE_POINTS = 80;

const CONTROL_CHARACTER = /[\p{Cc}\p{Cf}]/u;

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compatible = value.normalize("NFKC");
  if (CONTROL_CHARACTER.test(compatible.replace(/\s/gu, ""))) return null;
  const normalized = compatible.trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.toLocaleLowerCase("en-US") === "unknown") return null;
  return [...normalized].length <= MAX_DISPLAY_NAME_CODE_POINTS ? normalized : null;
}

export function providerDisplayName(value: unknown, email?: string | null): string | null {
  const name = normalizeDisplayName(value);
  if (!name) return null;
  const normalizedEmail = email?.trim().normalize("NFKC").toLocaleLowerCase("en-US");
  return normalizedEmail && name.toLocaleLowerCase("en-US") === normalizedEmail ? null : name;
}

export function preferredDisplayName(
  storedValue: unknown,
  providerValue: unknown,
  email?: string | null,
): string | null {
  return normalizeDisplayName(storedValue) ?? providerDisplayName(providerValue, email);
}
