import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import next from "next";
import {
  installPlaywrightServerLifecycle,
} from "./playwright-server-lifecycle.mjs";
import {
  resetPlaywrightOwnedDirectory,
  resolvePlaywrightOwnedDirectory,
} from "./playwright-owned-directory.mjs";

const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const port = Number(process.env.PORT);
const require = createRequire(import.meta.url);

const hmrSocketMarker = Symbol("filosage-playwright-hmr");
const suppressedHmrTypes = new Set([
  "addedPage",
  "building",
  "clientChanges",
  "devPagesManifestUpdate",
  "middlewareChanges",
  "reloadPage",
  "removedPage",
  "serverComponentChanges",
  "serverOnlyChanges",
]);
const WebSocket = require("next/dist/compiled/ws");
const originalWebSocketSend = WebSocket.prototype.send;
WebSocket.prototype.send = function sendWithoutTestReloads(data, options, callback) {
  if (this._socket?.[hmrSocketMarker] && typeof data === "string") {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      message = null;
    }
    const suppress = suppressedHmrTypes.has(message?.type)
      || (message?.type === "built" && !message.errors?.length);
    if (suppress) {
      const complete = typeof options === "function" ? options : callback;
      if (complete) queueMicrotask(() => complete());
      return;
    }
  }
  return originalWebSocketSend.call(this, data, options, callback);
};

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`PORT must be an integer from 1 to 65535; received ${JSON.stringify(process.env.PORT)}.`);
}

const testStoreDir = resetPlaywrightOwnedDirectory(
  process.env.FILOSAGE_LOCAL_DIR,
  ".filosage-local-test",
);
if (process.env.FILOSAGE_PLAYWRIGHT_REUSE_DIST === "1") {
  resolvePlaywrightOwnedDirectory(process.env.FILOSAGE_NEXT_DIST_DIR, ".next");
} else {
  resetPlaywrightOwnedDirectory(process.env.FILOSAGE_NEXT_DIST_DIR, ".next");
}

const seedName = process.env.FILOSAGE_PLAYWRIGHT_SEED?.trim();
if (seedName) {
  const commandCenterSeedOptions = {
    "command-center-v2-contract": { includeMalformedTicket: true },
    "command-center-v2-founder": { includeMalformedTicket: false },
  }[seedName];
  let seededStore;
  if (commandCenterSeedOptions) {
    const { buildCommandCenterV2ContractStore } = await import("../tests/fixtures/command-center-v2-store.mjs");
    seededStore = buildCommandCenterV2ContractStore(commandCenterSeedOptions);
  } else if (seedName === "shared-evidence") {
    const { buildSharedEvidenceStore } = await import("../tests/fixtures/shared-evidence-store.mjs");
    seededStore = buildSharedEvidenceStore();
  } else {
    throw new Error(`Unsupported Playwright seed fixture: ${JSON.stringify(seedName)}.`);
  }
  mkdirSync(testStoreDir, { recursive: true });
  writeFileSync(
    join(testStoreDir, "store.json"),
    `${JSON.stringify(seededStore, null, 2)}\n`,
  );
}

// Next automatically adds a custom distDir's generated types to whichever
// tsconfig it owns. Point it at an ephemeral extending config so the tracked
// project config remains byte-for-byte untouched by test runs.
const testTsconfigPath = join(testStoreDir, "tsconfig.json");
mkdirSync(dirname(testTsconfigPath), { recursive: true });
writeFileSync(testTsconfigPath, `${JSON.stringify({
  extends: relative(dirname(testTsconfigPath), resolve("tsconfig.json")).replaceAll(sep, "/"),
}, null, 2)}\n`);
process.env.FILOSAGE_NEXT_TSCONFIG_PATH = relative(process.cwd(), testTsconfigPath).replaceAll(sep, "/");

let nextUpgradeHandler;
const upgradeHandlerRegistry = {
  on(eventName, handler) {
    if (eventName !== "upgrade") {
      throw new Error(`Unexpected Next.js server event registration: ${JSON.stringify(eventName)}.`);
    }
    nextUpgradeHandler = handler;
    return this;
  },
};

const app = next({
  dev: true,
  hostname,
  port,
  // Next's development client normally receives HMR messages whenever a new
  // route is compiled. During a Playwright run no source files are edited, and
  // those messages can reload the page being left while WebKit is navigating
  // to the newly compiled route. Register the upgrade handler through a gate
  // so the test server can keep HMR sockets open without forwarding reloads.
  httpServer: upgradeHandlerRegistry,
  // Isolated worktrees may share node_modules through a directory link.
  // Turbopack rejects links outside its root, so every owned test server uses
  // webpack rather than making only seeded suites work in isolation.
  webpack: true,
});
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer(async (request, response) => {
  try {
    await handle(request, response);
  } catch (error) {
    console.error("[playwright-server] Request failed:", error);
    if (!response.headersSent) response.writeHead(500);
    response.end("Internal Server Error");
  }
});

const hmrSockets = new Set();
server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(request.url ?? "/", `http://${hostname}:${port}`);
  if (requestUrl.pathname === "/_next/webpack-hmr" && nextUpgradeHandler) {
    socket[hmrSocketMarker] = true;
    hmrSockets.add(socket);
    socket.once("close", () => hmrSockets.delete(socket));
    socket.once("error", () => hmrSockets.delete(socket));
    nextUpgradeHandler(request, socket, head);
    return;
  }
  if (nextUpgradeHandler) nextUpgradeHandler(request, socket, head);
  else socket.destroy();
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, hostname, () => {
    server.off("error", reject);
    resolve();
  });
});

installPlaywrightServerLifecycle(async () => {
  for (const socket of hmrSockets) socket.destroy();
  hmrSockets.clear();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  await app.close();
});
