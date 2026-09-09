import { appendFileSync } from "node:fs";
import { mock } from "node:test";

const product = process.env.F6_PRODUCT as "baseline" | "capstone" | "flashcards" | undefined;
const uid = process.env.F6_UID;
const body = process.env.F6_BODY;
const key = process.env.F6_KEY;
const counterPath = process.env.F6_COUNTER_PATH;
if (!product || !uid || !body || !key || !counterPath || process.env.OPENAI_API_KEY || process.env.DATABASE_URL) {
  throw new Error("Invalid isolated pre-checkpoint child configuration.");
}

const originalLocalStore = await import("../../src/lib/local-store.ts");
const documentValues = await import("../../src/lib/document-values.ts");

function storedPath(name: string) {
  const marker = "/documents/";
  const index = name.indexOf(marker);
  return index < 0 ? name : name.slice(index + marker.length);
}

mock.module("../../src/lib/local-store.ts", {
  namedExports: {
    ...originalLocalStore,
    async localDocumentStoreJson<T>(path: string, init: RequestInit = {}, allowNotFound = false) {
      if (path === "/documents:commit" && init.body) {
        const payload = JSON.parse(String(init.body)) as { writes?: Array<Record<string, unknown>> };
        const checkpoint = (payload.writes ?? []).some((write) => {
          const update = write.update as { name?: string; fields?: Record<string, Parameters<typeof documentValues.fromDocumentFields>[0][string]> } | undefined;
          if (!update?.name || storedPath(update.name).includes("__attempt__")) return false;
          return storedPath(update.name).startsWith("aiRequests/")
            && documentValues.fromDocumentFields(update.fields ?? {}).status === "result_checkpointed";
        });
        if (checkpoint) process.exit(86);
      }
      return originalLocalStore.localDocumentStoreJson<T>(path, init, allowNotFound);
    },
  },
});

const lifecycle = await import("../../src/lib/account-lifecycle.ts");
const originalAuth = await import("../../src/lib/auth-server.ts");
const originalLocalAi = await import("../../src/lib/local-ai.ts");
const account = {
  uid,
  plan: "pro" as const,
  access: "pro" as const,
  isOwner: false as const,
  accountStatus: "active" as const,
  subscriptionStatus: "active" as const,
};
const generation = await lifecycle.captureAccountGeneration(uid);

mock.module("../../src/lib/auth-server.ts", {
  namedExports: {
    ...originalAuth,
    requireAcceptedAccount: async () => account,
    withAccountRequest: <R extends Request, Args extends unknown[]>(handler: (request: R, ...args: Args) => Promise<Response>) => (
      (request: R, ...args: Args) => lifecycle.runWithAccountGeneration(generation, () => handler(request, ...args))
    ),
  },
});

mock.module("../../src/lib/local-ai.ts", {
  namedExports: {
    ...originalLocalAi,
    aiClient: () => {
      const client = originalLocalAi.aiClient();
      const parse = client.responses.parse.bind(client.responses);
      client.responses.parse = (async (...args: Parameters<typeof parse>) => {
        appendFileSync(counterPath, `${product}\n`);
        const parameters = args[0] as { text?: { format?: { name?: string } } };
        const response = parameters.text?.format?.name === "baseline_verdict"
          ? {
              id: "child-baseline-response",
              output_parsed: {
                summary: "The starting sample connects its claim to evidence and preserves a material limitation.",
                criteria: [
                  { criterion: "Identify the claim and relevant evidence.", met: true, feedback: "The claim and evidence are explicit." },
                  { criterion: "Explain one material limitation.", met: true, feedback: "The limitation is explicit." },
                ],
              },
            }
          : await parse(...args);
        return {
          ...response,
          id: `child-observed-${product}`,
          usage: { input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
        };
      }) as typeof client.responses.parse;
      return client;
    },
  },
});

const route = product === "baseline"
  ? (await import("../../src/app/api/assess-baseline/route.ts")).POST
  : product === "capstone"
    ? (await import("../../src/app/api/assess-capstone/route.ts")).POST
    : (await import("../../src/app/api/flashcards/generate/route.ts")).POST;

await route(new Request(`https://fixture.invalid/api/${product}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": key },
  body,
}));
process.exit(87);
