import { expect, test } from "@playwright/test";
import {
  installRuntimeEnvironment,
  serverEnvironment,
} from "../src/lib/runtime-environment";

test("exposes Sites string bindings without serializing resource bindings", () => {
  const versionKey = "ERUDOZA_TEST_SITE_VERSION";
  const secretKey = "ERUDOZA_TEST_SITE_SECRET";
  const resourceKey = "ERUDOZA_TEST_SITE_RESOURCE";
  const previous = globalThis.__ERUDOZA_RUNTIME_ENV__;

  try {
    installRuntimeEnvironment({
      [versionKey]: "test-version",
      [secretKey]: "test-secret",
      [resourceKey]: { fetch() {} },
    });
    expect(serverEnvironment[versionKey]).toBe("test-version");
    expect(serverEnvironment[secretKey]).toBe("test-secret");
    expect(serverEnvironment[resourceKey]).toBeUndefined();
  } finally {
    globalThis.__ERUDOZA_RUNTIME_ENV__ = previous;
  }
});
