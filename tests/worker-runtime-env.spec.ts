import { expect, test } from "@playwright/test";
import { populateProcessEnvFromBindings } from "../worker/runtime-env";

test("copies Sites string bindings into process.env without serializing resource bindings", () => {
  const versionKey = "ERUDOZA_TEST_SITE_VERSION";
  const secretKey = "ERUDOZA_TEST_SITE_SECRET";
  const resourceKey = "ERUDOZA_TEST_SITE_RESOURCE";
  const previous = {
    version: process.env[versionKey],
    secret: process.env[secretKey],
    resource: process.env[resourceKey],
  };

  try {
    populateProcessEnvFromBindings({
      [versionKey]: "test-version",
      [secretKey]: "test-secret",
      [resourceKey]: { fetch() {} },
    });
    expect(process.env[versionKey]).toBe("test-version");
    expect(process.env[secretKey]).toBe("test-secret");
    expect(process.env[resourceKey]).toBe(previous.resource);
  } finally {
    if (previous.version === undefined) delete process.env[versionKey];
    else process.env[versionKey] = previous.version;
    if (previous.secret === undefined) delete process.env[secretKey];
    else process.env[secretKey] = previous.secret;
    if (previous.resource === undefined) delete process.env[resourceKey];
    else process.env[resourceKey] = previous.resource;
  }
});
