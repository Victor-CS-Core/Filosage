const INTERVAL_MS = 120_000;

export async function armRetryAlarm(storage, now = Date.now()) {
  const alarm = await storage.getAlarm();
  if (alarm === null || alarm > now + INTERVAL_MS) await storage.setAlarm(now + INTERVAL_MS);
}
export async function runRetryAlarm(storage, drain, now = Date.now()) {
  // Persist the next attempt first: storage/email failures and process eviction
  // must not silently stop retries. One low-volume application outbox owns this
  // coordination object; it does not schedule unrelated Workers.
  await storage.setAlarm(now + INTERVAL_MS);
  await drain();
}
export async function scheduleAcceptance(response, scheduler) {
  if (!response.ok) return response;
  try {
    await scheduler.ensureAlarm();
    return response;
  } catch {
    console.error(JSON.stringify({ code: "operations_receiver.scheduler_unavailable" }));
    return Response.json({ error: "scheduler_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
