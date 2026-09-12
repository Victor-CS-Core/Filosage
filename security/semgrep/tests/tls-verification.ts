import { Agent } from "node:https";

export function unsafeTls() {
  // ruleid: filosage-disabled-tls-verification
  return new Agent({ rejectUnauthorized: false });
}

export function safeTls() {
  // ok: filosage-disabled-tls-verification
  return new Agent({ rejectUnauthorized: true });
}

export function safeDefault() {
  // ok: filosage-disabled-tls-verification
  return new Agent();
}
