const expectedInput = process.argv[2]?.trim().toLowerCase();
if (expectedInput !== "direct-google" && expectedInput !== "migration-dual") {
  console.error("Expected authentication mode must be direct-google or migration-dual.");
  process.exit(1);
}

const chunks = [];
let byteLength = 0;
for await (const chunk of process.stdin) {
  byteLength += chunk.length;
  if (byteLength > 1_024) {
    console.error("Managed authentication provider state is invalid.");
    process.exit(1);
  }
  chunks.push(chunk);
}

let state;
try {
  state = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  console.error("Managed authentication provider state is invalid.");
  process.exit(1);
}

const exactKeys = state && typeof state === "object" && !Array.isArray(state)
  ? Object.keys(state).sort()
  : [];
if (exactKeys.length !== 2
  || exactKeys[0] !== "filosage"
  || exactKeys[1] !== "google"
  || typeof state.google !== "boolean"
  || typeof state.filosage !== "boolean") {
  console.error("Managed authentication provider state is invalid.");
  process.exit(1);
}
if (!state.google) {
  console.error("Direct Google managed authentication must remain enabled.");
  process.exit(1);
}
if (state.filosage !== (expectedInput === "migration-dual")) {
  console.error("Filosage managed authentication state does not match the requested mode.");
  process.exit(1);
}

console.log("Managed authentication provider state matches the requested mode.");
