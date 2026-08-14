export interface ModelFallbackResult<T> {
  model: string;
  result: T;
  usedFallback: boolean;
}

interface RunWithModelFallbackOptions<T> {
  fallbackModel: string;
  generate(model: string): Promise<T>;
  onPrimaryError?(error: unknown): void;
  primaryModel: string;
}

export async function runWithModelFallback<T>({
  fallbackModel,
  generate,
  onPrimaryError,
  primaryModel,
}: RunWithModelFallbackOptions<T>): Promise<ModelFallbackResult<T>> {
  try {
    return {
      model: primaryModel,
      result: await generate(primaryModel),
      usedFallback: false,
    };
  } catch (error) {
    onPrimaryError?.(error);
    if (fallbackModel === primaryModel) throw error;
    return {
      model: fallbackModel,
      result: await generate(fallbackModel),
      usedFallback: true,
    };
  }
}

export function safeModelErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const value = error as Record<string, unknown>;
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    status: typeof value.status === "number" ? value.status : undefined,
    code: typeof value.code === "string" ? value.code : undefined,
    type: typeof value.type === "string" ? value.type : undefined,
    param: typeof value.param === "string" ? value.param : undefined,
    requestId: typeof value.request_id === "string"
      ? value.request_id
      : typeof value.requestID === "string"
        ? value.requestID
        : undefined,
  };
}
