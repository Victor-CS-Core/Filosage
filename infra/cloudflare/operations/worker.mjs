import { DurableObject } from "cloudflare:workers";
import { armRetryAlarm, runRetryAlarm, scheduleAcceptance } from "./scheduler.mjs";
import { EmailMessage } from "cloudflare:email";
import { receiveAlert, dispatchPending, receiverHealth } from "./receiver.mjs";

function sendNotification(env, row) {
  // Only validated operational metadata leaves the receiver; never forward raw
  // messages, contexts, request bodies, prompts or provider exceptions.
  const text = ["FiloSage operational alert", `Severity: ${row.severity}`, `Code: ${row.code}`,
    `Environment: ${row.environment}`, `Source: ${row.version ?? "unknown"}`,
    `Occurred: ${row.occurred_at}`, `Alert ID: ${row.id}`,
    "", "Inspect the application and receiver's persisted Cloudflare logs for diagnosis."].join("\r\n");
  const raw = [`From: FiloSage Operations <${env.ALERT_FROM}>`, `To: ${env.ALERT_TO}`,
    `Subject: [FiloSage ${row.severity}] ${row.code}`, `Message-ID: <${row.id}@alerts.filosage.com>`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", text].join("\r\n");
  return env.EMAIL.send(new EmailMessage(env.ALERT_FROM, env.ALERT_TO, raw));
}
async function drain(env) {
  try { await dispatchPending(env, row => sendNotification(env, row)); }
  catch { console.error(JSON.stringify({ code: "operations_receiver.dispatch_unavailable" })); }
}
export class AlertScheduler extends DurableObject {
  async ensureAlarm() { await armRetryAlarm(this.ctx.storage); }
  async alarm() {
    await runRetryAlarm(this.ctx.storage, async () => {
      console.log(JSON.stringify({ code: "operations_receiver.retry_alarm_ran" }));
      await drain(this.env);
    });
  }
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (!env.SCHEDULER?.getByName) return new Response(null, { status: 503 });
    if (request.method === "GET" && path === "/health") return receiverHealth(env);
    if (request.method !== "POST" || path !== "/alerts") return new Response(null, { status: 404 });
    const received = await receiveAlert(request, env);
    const response = await scheduleAcceptance(received, env.SCHEDULER.getByName("production-alerts"));
    if (response.ok) ctx.waitUntil(drain(env));
    return response;
  },
};
