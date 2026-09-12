/** Status-only adaptation of the reviewed QA probe. Never consume secret bodies. */
export async function productionVaultStatusProbe({ expectedSha, required, denied }) {
  if (process.env.SITE_VERSION !== expectedSha || !/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("runtime-target");
  const endpoint = new URL(process.env.IDENTITY_ENDPOINT);
  if (!["http:", "https:"].includes(endpoint.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) throw new Error("identity-endpoint");
  endpoint.searchParams.set("api-version", "2019-08-01");
  endpoint.searchParams.set("resource", "https://vault.azure.net");
  endpoint.searchParams.set("client_id", "fc8fec59-9873-4502-80e2-21f4dacc301c");
  const identity = await fetch(endpoint, { redirect: "error", headers: { "X-IDENTITY-HEADER": process.env.IDENTITY_HEADER }, signal: AbortSignal.timeout(8000) });
  if (!identity.ok) throw new Error("identity-response");
  const token = (await identity.json()).access_token;
  if (typeof token !== "string" || !token) throw new Error("identity-token");
  const checks = [];
  for (const item of [...required.map((entry) => ({ ...entry, expected: 200 })), ...denied.map((name) => ({ name, url: `https://filosagestg-p4ujucgnxq3g.vault.azure.net/secrets/${name}`, expected: 403 }))]) {
    const url = new URL(item.url);
    if (url.origin !== "https://filosagestg-p4ujucgnxq3g.vault.azure.net" || url.username || url.password || url.hash
      || !/^\/secrets\/[a-z0-9-]+(?:\/[a-f0-9]{32})?$/.test(url.pathname) || url.pathname.split("/")[2] !== item.name) throw new Error("secret-target");
    url.searchParams.set("api-version", "7.4");
    const response = await fetch(url, { redirect: "error", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    const status = response.status;
    await response.body?.cancel();
    checks.push({ name: item.name, status, expected: item.expected });
  }
  return { operation: "production-vault-status-probe", sourceSha: expectedSha, checks, passed: checks.every((item) => item.status === item.expected) };
}
