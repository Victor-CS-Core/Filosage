import { isAbsolute, relative, resolve } from "node:path";

function configuredPort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PLAYWRIGHT_PORT must be an integer from 1 to 65535; received ${JSON.stringify(value)}.`);
  }
  return port;
}

export function playwrightOwnedStorePath(baseURL: string | undefined) {
  if (process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1") {
    throw new Error("The Playwright-owned store is unavailable with an external server.");
  }
  const url = new URL(baseURL ?? "");
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port) {
    throw new Error("The Playwright-owned store requires a configured loopback server URL.");
  }
  const root = resolve(process.cwd(), ".filosage-local-test");
  const store = resolve(root, url.port, "store.json");
  const location = relative(root, store);
  if (isAbsolute(location) || location.startsWith("..")) {
    throw new Error("The Playwright-owned store must remain inside .filosage-local-test.");
  }
  return store;
}

export function playwrightServerSettings(defaultPort = 3100) {
  const external = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";
  const port = process.env.PLAYWRIGHT_PORT
    ? configuredPort(process.env.PLAYWRIGHT_PORT)
    : defaultPort;
  return {
    external,
    port,
    id: String(port),
    baseURL: `http://127.0.0.1:${port}`,
  };
}
