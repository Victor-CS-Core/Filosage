export async function unsafeEval(request: Request) {
  const code = await request.text();
  // ruleid: filosage-request-code-injection
  return eval(code);
}

export function unsafeFunction(request: Request) {
  const code = request.headers.get("x-code") ?? "";
  // ruleid: filosage-request-code-injection
  return new Function(code);
}

export async function safeJson(request: Request) {
  const input = await request.text();
  // ok: filosage-request-code-injection
  return JSON.parse(input);
}
