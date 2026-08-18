const expectedInput = process.argv[2]?.trim().toLowerCase();
if (expectedInput !== "true" && expectedInput !== "false") {
  console.error("Expected QA External ID application gate must be true or false.");
  process.exit(1);
}

const chunks = [];
let byteLength = 0;
for await (const chunk of process.stdin) {
  byteLength += chunk.length;
  if (byteLength > 1_024) {
    console.error("QA authentication provider state is invalid.");
    process.exit(1);
  }
  chunks.push(chunk);
}

let state;
try {
  state = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  console.error("QA authentication provider state is invalid.");
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
  console.error("QA authentication provider state is invalid.");
  process.exit(1);
}
if (!state.google) {
  console.error("Direct Google Easy Auth must remain enabled in QA.");
  process.exit(1);
}
if (state.filosage !== (expectedInput === "true")) {
  console.error("Filosage Easy Auth provider state does not match the requested application acceptance gate.");
  process.exit(1);
}

console.log("QA authentication provider state matches the requested application gate.");
