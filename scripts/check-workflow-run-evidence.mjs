const MAX_INPUT_BYTES = 64 * 1024;
const GENERIC_ERROR = "Required workflow evidence is unavailable.";

const fail = () => {
  process.stderr.write(`${GENERIC_ERROR}\n`);
  process.exit(1);
};

const [expectedSha, expectedPath] = process.argv.slice(2);
if (
  !/^[a-f0-9]{40}$/i.test(expectedSha ?? "")
  || !/^\.github\/workflows\/[a-z0-9-]+\.ya?ml$/i.test(expectedPath ?? "")
) {
  fail();
}

let input = "";
let inputBytes = 0;
try {
  for await (const chunk of process.stdin) {
    inputBytes += Buffer.byteLength(chunk);
    if (inputBytes > MAX_INPUT_BYTES) fail();
    input += chunk;
  }
  const parsed = JSON.parse(input);
  if (!Array.isArray(parsed?.workflow_runs)) fail();
  const accepted = parsed.workflow_runs.some((run) => (
    run
    && typeof run === "object"
    && run.status === "completed"
    && run.conclusion === "success"
    && run.head_sha === expectedSha
    && run.path === expectedPath
  ));
  if (!accepted) fail();
} catch {
  fail();
}

process.stdout.write("Workflow evidence verified.\n");
