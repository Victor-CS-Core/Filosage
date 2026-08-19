import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const source = (path: string) => readFileSync(path, "utf8");

test("keeps public discovery, lesson starts, and sign-up intent as distinct events", () => {
  const coursePage = source("src/app/course/[topic]/page.tsx");
  const openLesson = coursePage.slice(
    coursePage.indexOf("const openLesson"),
    coursePage.indexOf("const masteryJourney"),
  );
  const discoveryEffect = coursePage.slice(
    coursePage.indexOf("const masteryJourney"),
    coursePage.indexOf("const loadProgress"),
  );
  const authModal = source("src/components/AuthModal.tsx");

  expect(openLesson).toContain('trackProductEvent("course_started"');
  expect(openLesson.indexOf('trackProductEvent("course_started"')).toBeLessThan(openLesson.indexOf("window.location.assign"));
  expect(discoveryEffect).toContain('trackProductEvent("course_discovered"');
  expect(discoveryEffect).not.toContain('trackProductEvent("course_started"');
  expect(authModal).toContain('trackProductEvent("signup_started"');
  expect(authModal).toContain('"EXP-001-professional-outcome"');
});

test("routes the landing account action through the existing legal-aware modal", () => {
  expect(source("src/components/marketing/AccountStartButton.tsx")).toContain("AccountEntryButton");
  expect(source("src/components/AccountEntryButton.tsx")).toContain('new CustomEvent("filosage:open-auth",');
  expect(source("src/components/AppShell.tsx")).toContain('window.addEventListener("filosage:open-auth", openAuth)');
  expect(source("src/components/AuthModal.tsx")).toContain("I confirm I am at least 13");
});
