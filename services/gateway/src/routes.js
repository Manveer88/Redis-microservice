const cors = require("cors");
const { config, notFound } = require("@isp/shared");
const { createLimiters } = require("./limits");
const { authenticate } = require("./auth");
const { resolveService, createProxy } = require("./proxy");
const { healthHandler } = require("./health");
const { auditTrail } = require("./audit");

const parseTrustProxy = (value) => {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
};

const STRIPPED_HEADER = /^(x-user-|x-internal-token$)/i;

const stripHeaders = (req, res, next) => {
  for (const name of Object.keys(req.headers)) {
    if (STRIPPED_HEADER.test(name)) delete req.headers[name];
  }
  next();
};

const limiters = {};

const beforeRoutes = (app) => {
  app.set("trust proxy", parseTrustProxy(config.env("TRUST_PROXY", "false")));
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
      exposedHeaders: ["x-request-id", "RateLimit", "RateLimit-Policy", "Retry-After", "Content-Disposition"],
    })
  );
};

const routes = (app, { logger }) => {
  app.use(stripHeaders);
  app.use((req, res, next) => (limiters.global ? limiters.global(req, res, next) : next()));
  app.use((req, res, next) => (limiters.login ? limiters.login(req, res, next) : next()));
  app.use((req, res, next) => (limiters.ingest ? limiters.ingest(req, res, next) : next()));

  app.get("/api/health", healthHandler);

  app.use((req, res, next) => {
    req.serviceName = resolveService(req.path);
    if (!req.serviceName) return next(notFound("Route not found", "ROUTE_NOT_FOUND"));
    next();
  });

  app.use(authenticate);
  app.use(auditTrail(logger));
  app.use(createProxy(logger));
};

const onStart = async () => {
  Object.assign(limiters, createLimiters());
};

module.exports = { beforeRoutes, routes, onStart };
