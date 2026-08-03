import { preview } from "vite";
import {
  installPlaywrightServerLifecycle,
  resetPlaywrightOwnedDirectory,
} from "./playwright-server-lifecycle.mjs";

const host = process.env.HOSTNAME ?? "127.0.0.1";
const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`PORT must be an integer from 1 to 65535; received ${JSON.stringify(process.env.PORT)}.`);
}

resetPlaywrightOwnedDirectory(process.env.ERUDOZA_PLAYWRIGHT_LIFECYCLE_DIR, ".erudoza-local-test");

// Vite preview runs the production Sites worker through the local Cloudflare
// runtime, including its declared R2 binding, without cloud credentials.
const previewServer = await preview({
  clearScreen: false,
  preview: { host, port, strictPort: true },
});

installPlaywrightServerLifecycle(() => previewServer.close());
