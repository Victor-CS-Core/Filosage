import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const vinextCliPath = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [vinextCliPath, "build"], {
    env: {
      ...process.env,
      LOCAL_WORKERS_COMPATIBILITY_FLAG: "nodejs_compat",
    },
    stdio: "inherit",
  });

  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;
