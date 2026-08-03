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
});
