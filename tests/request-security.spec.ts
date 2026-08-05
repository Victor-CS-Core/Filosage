import { expect, test } from "@playwright/test";

test.describe("public mutation request perimeter", () => {
  test("rejects cross-site, wrong-content-type, oversized, and malformed requests", async ({ request }) => {
    const crossSite = await request.post("/api/waitlist", {
      headers: {
        Origin: "https://attacker.invalid",
        "Content-Type": "application/json",
      },
      data: { email: "learner@example.com", marketingConsent: true },
    });
    expect(crossSite.status()).toBe(403);

    const wrongContentType = await request.post("/api/waitlist", {
      headers: { "Content-Type": "text/plain" },
      data: "not-json",
    });
    expect(wrongContentType.status()).toBe(415);

    const oversized = await request.post("/api/waitlist", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ email: `${"x".repeat(1_100)}@example.com`, marketingConsent: true }),
    });
    expect(oversized.status()).toBe(413);

    const malformed = await request.post("/api/waitlist", {
      headers: { "Content-Type": "application/json" },
      data: "{",
    });
    expect(malformed.status()).toBe(400);
  });

  test("rejects forged lifecycle telemetry and binds learning telemetry to authentication", async ({ request }) => {
    const base = {
      schemaVersion: 1,
      route: "/pricing",
      source: "internal",
      actorId: "attacker-actor-id",
      sessionId: "attacker-session-id",
    };
    const forgedLifecycle = await request.post("/api/telemetry", {
      data: { ...base, event: "subscription_started" },
    });
    expect(forgedLifecycle.status()).toBe(403);

    const anonymousLearning = await request.post("/api/telemetry", {
      data: { ...base, route: "/lesson", event: "lesson_completed" },
    });
    expect(anonymousLearning.status()).toBe(401);

    const authenticatedLearning = await request.post("/api/telemetry", {
      headers: { Authorization: "Bearer playwright-local-owner" },
      data: { ...base, route: "/lesson", event: "lesson_completed" },
    });
    expect(authenticatedLearning.status()).toBe(204);
  });
});
