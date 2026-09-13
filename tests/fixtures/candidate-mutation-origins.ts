import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiRequestError, assertTrustedMutation } from "../../src/lib/api-security";

const request = (origin: string, site = "same-origin") => new Request("http://localhost:3000/api/flashcards/generate", {
  method: "POST", headers: { origin, "sec-fetch-site": site },
});
const denied = (operation: () => void) => assert.throws(operation, (error: unknown) => error instanceof ApiRequestError && error.status === 403);

test("production proxy accepts both configured labels and canonical origin, retaining CSRF rejection", () => {
  assert.equal(process.env.NODE_ENV, "production");
  const origins = process.env.ALLOWED_ORIGINS!;
  const [blue, green] = origins.split(",");
  assert.equal(blue, "https://filosage-app---blue.region.azurecontainerapps.io");
  assert.equal(green, "https://filosage-app---green.region.azurecontainerapps.io");
  delete process.env.ALLOWED_ORIGINS;
  denied(() => assertTrustedMutation(request(blue)));
  process.env.ALLOWED_ORIGINS = origins;
  for (const origin of [blue, green, "https://filosage.com"]) assert.doesNotThrow(() => assertTrustedMutation(request(origin)));
  for (const origin of ["https://unrelated.example", "https://other-app---blue.region.azurecontainerapps.io", `${blue}.attacker.example`]) denied(() => assertTrustedMutation(request(origin)));
  for (const origin of [blue, green, "https://filosage.com"]) denied(() => assertTrustedMutation(request(origin, "cross-site")));
  denied(() => assertTrustedMutation(new Request("http://localhost:3000/api/flashcards/generate", { method: "POST" })));
});
