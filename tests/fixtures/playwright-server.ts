function configuredPort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PLAYWRIGHT_PORT must be an integer from 1 to 65535; received ${JSON.stringify(value)}.`);
  }
  return port;
}

export function playwrightServerSettings(defaultPort = 3100) {
  const external = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";
  const port = process.env.PLAYWRIGHT_PORT
    ? configuredPort(process.env.PLAYWRIGHT_PORT)
    : defaultPort;
  return {
    external,
    port,
    id: String(port),
    baseURL: `http://127.0.0.1:${port}`,
  };
}
