import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnvironment from "@next/env";

const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
const { loadEnvConfig } = nextEnvironment;
loadEnvConfig(projectDirectory, process.env.NODE_ENV === "development");

const vinextCliPath = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);
const localNodeCompatibilityFlag = ["nodejs", "compat"].join("_");

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [vinextCliPath, "build"], {
    env: {
      ...process.env,
      LOCAL_WORKERS_COMPATIBILITY_FLAG: localNodeCompatibilityFlag,
    },
    stdio: "inherit",
  });

  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;
