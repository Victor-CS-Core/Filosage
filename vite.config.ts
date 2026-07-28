import { sites } from "./build/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const { r2 } = hostingConfig;

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    build: {
      rolldownOptions: {
        output: {
          assetFileNames(assetInfo: { names: string[] }) {
            return assetInfo.names.some((name) => name.endsWith(".css"))
              ? "assets/app.css"
              : "assets/[name]-[hash].[ext]";
          },
        },
      },
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          r2_buckets: r2
            ? [{ binding: r2, bucket_name: "site-creator-r2" }]
            : [],
        },
      }),
    ],
  };
});
