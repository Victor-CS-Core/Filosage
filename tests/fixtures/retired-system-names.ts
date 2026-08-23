export const RETIRED_SYSTEM_NAME_PARTS = [
  ["eru", "doza"],
  ["fire", "store"],
  ["fire", "base"],
  ["supa", "base"],
] as const;

export const RETIRED_SYSTEM_NAMES = RETIRED_SYSTEM_NAME_PARTS.map((parts) => parts.join(""));
