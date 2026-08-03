import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import next from "next";
import {
  installPlaywrightServerLifecycle,
  resetPlaywrightOwnedDirectory,
} from "./playwright-server-lifecycle.mjs";

const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`PORT must be an integer from 1 to 65535; received ${JSON.stringify(process.env.PORT)}.`);
}

const testStoreDir = resetPlaywrightOwnedDirectory(
  process.env.ERUDOZA_LOCAL_DIR,
  ".erudoza-local-test",
);
resetPlaywrightOwnedDirectory(process.env.ERUDOZA_NEXT_DIST_DIR, ".next");

// Next automatically adds a custom distDir's generated types to whichever
// tsconfig it owns. Point it at an ephemeral extending config so the tracked
// project config remains byte-for-byte untouched by test runs.
const testTsconfigPath = join(testStoreDir, "tsconfig.json");
mkdirSync(dirname(testTsconfigPath), { recursive: true });
writeFileSync(testTsconfigPath, `${JSON.stringify({
  extends: relative(dirname(testTsconfigPath), resolve("tsconfig.json")).replaceAll(sep, "/"),
}, null, 2)}\n`);
process.env.ERUDOZA_NEXT_TSCONFIG_PATH = relative(process.cwd(), testTsconfigPath).replaceAll(sep, "/");

const app = next({ dev: true, hostname, port });
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

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, hostname, () => {
    server.off("error", reject);
    resolve();
  });
});

installPlaywrightServerLifecycle(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  await app.close();
});
