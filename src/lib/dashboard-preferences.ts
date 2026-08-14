export type DashboardPreset = "default" | "focused" | "progress" | "discover" | "custom";

export type DashboardMainSection = "nextUp" | "achievements" | "learningTip";
export type DashboardSideSection = "snapshot" | "quickActions";
export type DashboardSection = DashboardMainSection | DashboardSideSection;
export type DashboardMetric = "studyTime" | "lessons" | "streak" | "accuracy" | "mastered";

export interface DashboardPreferences {
  preset: DashboardPreset;
  sections: Record<DashboardSection, boolean>;
  metrics: Record<DashboardMetric, boolean>;
  mainOrder: DashboardMainSection[];
  sideOrder: DashboardSideSection[];
}

export const DASHBOARD_MAIN_SECTIONS: DashboardMainSection[] = ["nextUp", "achievements", "learningTip"];
export const DASHBOARD_SIDE_SECTIONS: DashboardSideSection[] = ["snapshot", "quickActions"];
export const DASHBOARD_METRICS: DashboardMetric[] = ["studyTime", "lessons", "streak", "accuracy", "mastered"];

const baseSections: Record<DashboardSection, boolean> = {
  nextUp: true,
  achievements: false,
  learningTip: false,
  snapshot: true,
  quickActions: false,
};

const baseMetrics: Record<DashboardMetric, boolean> = {
  studyTime: true,
  lessons: true,
  streak: true,
  accuracy: true,
  mastered: true,
};

export const DASHBOARD_PRESETS: Record<Exclude<DashboardPreset, "custom">, DashboardPreferences> = {
  default: {
    preset: "default",
    sections: { ...baseSections },
    metrics: { ...baseMetrics },
    mainOrder: [...DASHBOARD_MAIN_SECTIONS],
    sideOrder: [...DASHBOARD_SIDE_SECTIONS],
  },
  focused: {
    preset: "focused",
    sections: { ...baseSections, snapshot: false },
    metrics: { ...baseMetrics, accuracy: false, mastered: false },
    mainOrder: [...DASHBOARD_MAIN_SECTIONS],
    sideOrder: [...DASHBOARD_SIDE_SECTIONS],
  },
  progress: {
    preset: "progress",
    sections: { ...baseSections, achievements: true },
    metrics: { ...baseMetrics },
    mainOrder: ["achievements", "nextUp", "learningTip"],
    sideOrder: [...DASHBOARD_SIDE_SECTIONS],
  },
  discover: {
    preset: "discover",
    sections: { ...baseSections, learningTip: true, snapshot: false, quickActions: true },
    metrics: { ...baseMetrics },
    mainOrder: ["nextUp", "learningTip", "achievements"],
    sideOrder: ["quickActions", "snapshot"],
  },
};

export const DEFAULT_DASHBOARD_PREFERENCES = DASHBOARD_PRESETS.default;

function orderedValues<T extends string>(value: unknown, allowed: readonly T[]) {
  if (!Array.isArray(value)) return [...allowed];
  const supplied = value.filter((item): item is T => typeof item === "string" && allowed.includes(item as T));
  return [...new Set([...supplied, ...allowed])];
}

export function normalizeDashboardPreferences(value: unknown): DashboardPreferences {
  if (!value || typeof value !== "object") return cloneDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES);
  const candidate = value as Partial<DashboardPreferences>;
  const sections = (candidate.sections && typeof candidate.sections === "object" ? candidate.sections : {}) as Partial<Record<DashboardSection, boolean>>;
  const metrics = (candidate.metrics && typeof candidate.metrics === "object" ? candidate.metrics : {}) as Partial<Record<DashboardMetric, boolean>>;
  const preset = ["default", "focused", "progress", "discover", "custom"].includes(String(candidate.preset))
    ? candidate.preset as DashboardPreset
    : "default";

  return {
    preset,
    sections: Object.fromEntries(
      [...DASHBOARD_MAIN_SECTIONS, ...DASHBOARD_SIDE_SECTIONS].map((key) => [key, typeof sections[key] === "boolean" ? sections[key] : baseSections[key]]),
    ) as Record<DashboardSection, boolean>,
    metrics: Object.fromEntries(
      DASHBOARD_METRICS.map((key) => [key, typeof metrics[key] === "boolean" ? metrics[key] : baseMetrics[key]]),
    ) as Record<DashboardMetric, boolean>,
    mainOrder: orderedValues(candidate.mainOrder, DASHBOARD_MAIN_SECTIONS),
    sideOrder: orderedValues(candidate.sideOrder, DASHBOARD_SIDE_SECTIONS),
  };
}

export function cloneDashboardPreferences(value: DashboardPreferences): DashboardPreferences {
  return {
    ...value,
    sections: { ...value.sections },
    metrics: { ...value.metrics },
    mainOrder: [...value.mainOrder],
    sideOrder: [...value.sideOrder],
  };
}
