function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
}

function unsafeReturnPathLayer(value: string) {
  return value.includes("\\")
    || value.startsWith("//")
    || hasControlCharacter(value);
}

export function safeAuthenticationReturnPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  let inspected = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (unsafeReturnPathLayer(inspected)) return "/";
    if (!inspected.includes("%")) break;
    try {
      const decoded = decodeURIComponent(inspected);
      if (decoded === inspected) break;
      inspected = decoded;
    } catch {
      return "/";
    }
  }
  if (unsafeReturnPathLayer(inspected)) return "/";
  try {
    const parsed = new URL(value, "https://filosage.invalid");
    return parsed.origin === "https://filosage.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}
