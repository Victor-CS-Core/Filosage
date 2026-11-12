import { expect, test } from "@playwright/test";
import {
  authenticationConfigurationIssues,
  authenticationRuntimeConfiguration,
} from "../src/lib/auth-runtime";
import {
  normalizeDisplayName,
  providerDisplayName,
} from "../src/lib/display-name";

test("runtime defaults to direct Google authentication", () => {
  expect(authenticationRuntimeConfiguration({})).toMatchObject({
    directGoogleEnabled: true,
    directGoogleIssuer: "https://accounts.google.com",
  });
});

test("authentication configuration requires direct Google", () => {
  const config = authenticationRuntimeConfiguration({
    DIRECT_GOOGLE_AUTH_ENABLED: "false",
  });
  expect(authenticationConfigurationIssues(config)).toContain(
    "DIRECT_GOOGLE_AUTH_ENABLED must be true in production.",
  );
});

test("normalizes learner names without accepting provider placeholders or identity data", () => {
  expect(normalizeDisplayName("  Avery\t  N.  ")).toBe("Avery N.");
  expect(normalizeDisplayName("Ａｖｅｒｙ")).toBe("Avery");
  expect(normalizeDisplayName("unknown")).toBeNull();
  expect(normalizeDisplayName("ＵＮＫＮＯＷＮ")).toBeNull();
  expect(normalizeDisplayName("Avery\u0000Learner")).toBeNull();
  expect(normalizeDisplayName("a".repeat(81))).toBeNull();
  expect(providerDisplayName("learner@example.com", "learner@example.com")).toBeNull();
  expect(providerDisplayName("  Managed   Learner ", "learner@example.com")).toBe("Managed Learner");
});
