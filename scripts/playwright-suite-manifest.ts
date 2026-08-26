import { resolve } from "node:path";

export const contractSuites = [
  "tests/auth-identity.spec.ts",
  "tests/azure-infrastructure.spec.ts",
  "tests/azure-zero-cost-hardening.spec.ts",
  "tests/bibliographic-references.spec.ts",
  "tests/billing-offer.spec.ts",
  "tests/course-deck-velocity.spec.ts",
  "tests/course-deletion-indexes.spec.ts",
  "tests/course-pipeline-v2-regressions.spec.ts",
  "tests/course-research.spec.ts",
  "tests/landing-funnel-contract.spec.ts",
  "tests/identity-link-server.spec.ts",
  "tests/identity-migration.spec.ts",
  "tests/learner-readiness.spec.ts",
  "tests/learning-design-contract.spec.ts",
  "tests/learning-engine-trust-boundaries.spec.ts",
  "tests/lesson-pedagogy.spec.ts",
  "tests/membership-analytics.spec.ts",
  "tests/openai-generation-profiles.spec.ts",
  "tests/operational-alerts.spec.ts",
  "tests/operations-scripts.spec.ts",
  "tests/pro-evidence-course-credits.spec.ts",
  "tests/release-hardening.spec.ts",
  "tests/release-scripts.spec.ts",
  "tests/retrieval-planning.spec.ts",
  "tests/retired-systems.spec.ts",
  "tests/source-citations.spec.ts",
  "tests/source-research-v5.spec.ts",
  "tests/tier-consistency-contracts.spec.ts",
  "tests/worker-runtime-env.spec.ts",
] as const;

export const apiSuites = [
  "tests/account-privacy-policy.spec.ts",
  "tests/request-security.spec.ts",
] as const;

export const singleEngineSuites = [
  "tests/account-onboarding.spec.ts",
  "tests/admin-research-layout.spec.ts",
  "tests/auth-linking.spec.ts",
  "tests/billing-lifecycle.spec.ts",
  "tests/command-center.spec.ts",
  "tests/external-id-branding.spec.ts",
  "tests/flashcard-system.spec.ts",
  "tests/flashcard-visual.spec.ts",
  "tests/lesson-interactions-v2.spec.ts",
  "tests/marketing-gauntlet.spec.ts",
  "tests/marketing-gauntlet-runtime-acceptance.spec.ts",
  "tests/navigation-content-integrity.spec.ts",
  "tests/publication-override.spec.ts",
  "tests/release-recovery.spec.ts",
  "tests/search.spec.ts",
  "tests/support-center.spec.ts",
  "tests/tier-consistency-ui.spec.ts",
] as const;

export const deviceSensitiveSuites = [
  "tests/analytics-consent.spec.ts",
  "tests/app-shell.spec.ts",
  "tests/auth-accessibility.spec.ts",
  "tests/course-learning-flow.spec.ts",
  "tests/example.spec.ts",
  "tests/landing-motion.spec.ts",
  "tests/pricing-mobile.spec.ts",
  "tests/support-wiki.spec.ts",
] as const;

export const smokeBrowserSuites = [
  "tests/account-onboarding.spec.ts",
  "tests/analytics-consent.spec.ts",
  "tests/auth-accessibility.spec.ts",
  "tests/auth-linking.spec.ts",
  "tests/billing-lifecycle.spec.ts",
  "tests/command-center.spec.ts",
  "tests/release-recovery.spec.ts",
] as const;

export const dedicatedSuiteConfigs = {
  "tests/command-center-v2-contract.spec.ts": "playwright.command-center-v2.config.ts",
  "tests/command-center-v2-ui.spec.ts": "playwright.command-center-v2-ui.config.ts",
  "tests/shared-evidence-ui.spec.ts": "playwright.shared-evidence.config.ts",
} as const;

export const dedicatedSuites = Object.keys(dedicatedSuiteConfigs) as Array<keyof typeof dedicatedSuiteConfigs>;

export type BrowserProjectName = "chromium" | "mobile-chromium" | "mobile-webkit";

export const browserSuitesByProject: Record<BrowserProjectName, readonly string[]> = {
  chromium: [...deviceSensitiveSuites, ...singleEngineSuites],
  "mobile-chromium": deviceSensitiveSuites.filter((suite) => (
    suite !== "tests/course-learning-flow.spec.ts"
    && suite !== "tests/support-wiki.spec.ts"
  )),
  "mobile-webkit": deviceSensitiveSuites,
};

export const browserSuiteEstimatedTestLoad: Record<BrowserProjectName, Record<string, number>> = {
  chromium: {
    "tests/account-onboarding.spec.ts": 7,
    "tests/admin-research-layout.spec.ts": 2,
    "tests/analytics-consent.spec.ts": 3,
    "tests/app-shell.spec.ts": 32,
    "tests/auth-accessibility.spec.ts": 3,
    "tests/auth-linking.spec.ts": 47,
    "tests/billing-lifecycle.spec.ts": 23,
    "tests/command-center.spec.ts": 14,
    "tests/course-learning-flow.spec.ts": 6,
    "tests/example.spec.ts": 76,
    "tests/external-id-branding.spec.ts": 9,
    "tests/flashcard-system.spec.ts": 8,
    "tests/flashcard-visual.spec.ts": 1,
    "tests/landing-motion.spec.ts": 2,
    "tests/lesson-interactions-v2.spec.ts": 7,
    "tests/marketing-gauntlet.spec.ts": 13,
    "tests/marketing-gauntlet-runtime-acceptance.spec.ts": 1,
    "tests/navigation-content-integrity.spec.ts": 2,
    "tests/pricing-mobile.spec.ts": 1,
    "tests/publication-override.spec.ts": 7,
    "tests/release-recovery.spec.ts": 2,
    "tests/search.spec.ts": 3,
    "tests/support-center.spec.ts": 8,
    "tests/support-wiki.spec.ts": 11,
    "tests/tier-consistency-ui.spec.ts": 1,
  },
  "mobile-chromium": {
    "tests/analytics-consent.spec.ts": 1,
    "tests/app-shell.spec.ts": 13,
    "tests/auth-accessibility.spec.ts": 3,
    "tests/example.spec.ts": 7,
    "tests/landing-motion.spec.ts": 2,
    "tests/pricing-mobile.spec.ts": 1,
  },
  "mobile-webkit": {
    "tests/analytics-consent.spec.ts": 3,
    "tests/app-shell.spec.ts": 15,
    "tests/auth-accessibility.spec.ts": 3,
    "tests/course-learning-flow.spec.ts": 1,
    "tests/example.spec.ts": 8,
    "tests/landing-motion.spec.ts": 2,
    "tests/pricing-mobile.spec.ts": 1,
    "tests/support-wiki.spec.ts": 1,
  },
};

export function suitePatterns(suites: readonly string[]) {
  return suites.map((suite) => `**/${suite.slice("tests/".length)}`);
}

export function suitePathFromSelector(selector: string) {
  if (selector.startsWith("-")) return undefined;
  const normalized = selector.replaceAll("\\", "/");
  return normalized.match(/^(.*\.spec\.ts)(?::\d+(?::\d+)?)?$/)?.[1];
}

export function invalidPlaywrightSuiteSelector(selector: string) {
  return !selector.startsWith("-") && selector.includes(".spec.ts") && !suitePathFromSelector(selector);
}

const playwrightOptionsWithSeparateValues = new Set(["--grep", "-g", "--grep-invert", "-G"]);

export function classifyPlaywrightSuiteArguments(arguments_: readonly string[]) {
  const selectors: Array<{ argument: string; path: string }> = [];
  const optionArgs: string[] = [];
  const invalidSelectors: string[] = [];
  let expectsOptionValue = false;

  for (const argument of arguments_) {
    if (expectsOptionValue) {
      optionArgs.push(argument);
      expectsOptionValue = false;
      continue;
    }
    if (playwrightOptionsWithSeparateValues.has(argument)) {
      optionArgs.push(argument);
      expectsOptionValue = true;
      continue;
    }
    if (invalidPlaywrightSuiteSelector(argument)) {
      invalidSelectors.push(argument);
      continue;
    }
    const path = suitePathFromSelector(argument);
    if (path) selectors.push({ argument, path });
    else optionArgs.push(argument);
  }

  return { invalidSelectors, optionArgs, selectors };
}

export function suiteSelectorMatches(selector: string, suite: string) {
  const requested = suitePathFromSelector(selector) ?? selector.replaceAll("\\", "/");
  const basename = suite.slice(suite.lastIndexOf("/") + 1);
  return requested === suite
    || requested === basename
    || resolve(requested).replaceAll("\\", "/") === resolve(suite).replaceAll("\\", "/");
}
