import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { installRuntimeEnvironment } from "../src/lib/runtime-environment";
import { withStrictTransportSecurity } from "../src/lib/security-headers";

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env extends Record<string, unknown> {
  ASSETS: Fetcher;
  COURSE_BANNERS?: {
    get(key: string): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> } | null>;
    put(
      key: string,
      value: Uint8Array,
      options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
    ): Promise<unknown>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    installRuntimeEnvironment(env);
    globalThis.__FILOSAGE_COURSE_BANNERS__ = env.COURSE_BANNERS;
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return withStrictTransportSecurity(request, await handleImageOptimization(
        request,
        {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      ));
    }

    return withStrictTransportSecurity(request, await handler.fetch(request, env, ctx));
  },
};

export default worker;
