import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // R2 incremental cache disabled for now; enable after the R2 bucket exists.
});
