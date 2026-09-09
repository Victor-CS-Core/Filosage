import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { HMR_MESSAGE_SENT_TO_BROWSER } = require("next/dist/server/dev/hot-reloader-types");

const suppressedHmrTypes = new Set([
  HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE,
  HMR_MESSAGE_SENT_TO_BROWSER.BUILDING,
  HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES,
  HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE,
  HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
  HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
  HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE,
  HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
  HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
]);

export function isPlaywrightHmrPathname(pathname) {
  return pathname === "/_next/webpack-hmr" || pathname === "/_next/hmr";
}

export function shouldSuppressSuccessfulPlaywrightHmrMessage(data) {
  if (typeof data !== "string") return false;

  let message;
  try {
    message = JSON.parse(data);
  } catch {
    return false;
  }

  return suppressedHmrTypes.has(message?.type)
    || (message?.type === HMR_MESSAGE_SENT_TO_BROWSER.BUILT && !message.errors?.length);
}
