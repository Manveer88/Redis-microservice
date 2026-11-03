const { createProxyMiddleware } = require("http-proxy-middleware");
const { config } = require("@isp/shared");

const ROUTES = [
  ["/api/auth", "auth"],
  ["/api/users", "auth"],
  ["/api/audit-logs", "auth"],
  ["/api/plans", "plan"],
  ["/api/subscribers", "subscriber"],
  ["/api/subscriptions", "subscription"],
  ["/api/invoices", "billing"],
  ["/api/payments", "billing"],
  ["/api/usage", "usage"],
  ["/api/notifications", "notification"],
  ["/api/reports", "report"],
];

const resolveService = (path) => {
  const match = ROUTES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return match ? match[1] : null;
};

const asciiHeader = (value) => String(value || "").replace(/[^\x20-\x7E]/g, "");

const createProxy = (logger) => {
  const proxies = new Map();

  for (const name of new Set(ROUTES.map(([, service]) => service))) {
    proxies.set(
      name,
      createProxyMiddleware({
        target: config.serviceUrl(name),
        changeOrigin: true,
        xfwd: true,
        proxyTimeout: 60000,
        on: {
          proxyReq: (proxyReq, req) => {
            proxyReq.setHeader("x-internal-token", config.internalToken);
            proxyReq.setHeader("x-request-id", req.requestId);
            if (req.user) {
              proxyReq.setHeader("x-user-id", asciiHeader(req.user.id));
              proxyReq.setHeader("x-user-role", asciiHeader(req.user.role));
              proxyReq.setHeader("x-user-name", asciiHeader(req.user.name));
              proxyReq.setHeader("x-user-email", asciiHeader(req.user.email));
            }
          },
          error: (error, req, res) => {
            logger.warn("Upstream request failed", {
              upstream: name,
              path: req.originalUrl,
              requestId: req.requestId,
              error: error.message,
              code: error.code,
            });
            if (!res || typeof res.writeHead !== "function") {
              if (res && typeof res.destroy === "function") res.destroy();
              return;
            }
            if (res.headersSent) {
              res.end();
              return;
            }
            res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            res.end(
              JSON.stringify({
                success: false,
                message: `${name} service is unavailable`,
                code: "SERVICE_UNAVAILABLE",
              })
            );
          },
        },
      })
    );
  }

  return (req, res, next) => {
    const proxy = proxies.get(req.serviceName);
    if (!proxy) return next();
    proxy(req, res, (error) => {
      if (!error) next();
    });
  };
};

module.exports = { ROUTES, resolveService, createProxy };
