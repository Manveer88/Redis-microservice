const { config } = require("@isp/shared");

const SERVICES = [
  "auth",
  "subscriber",
  "plan",
  "subscription",
  "billing",
  "usage",
  "notification",
  "report",
  "realtime",
];

const TIMEOUT_MS = 1500;

const check = async (name) => {
  const started = Date.now();
  try {
    const response = await fetch(`${config.serviceUrl(name)}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.arrayBuffer().catch(() => null);
    return [name, { ok: response.ok, latency_ms: Date.now() - started }];
  } catch {
    return [name, { ok: false, latency_ms: Date.now() - started }];
  }
};

const healthHandler = async (req, res) => {
  const services = Object.fromEntries(await Promise.all(SERVICES.map(check)));
  res.json({ success: true, data: { gateway: "ok", services } });
};

module.exports = { healthHandler };
