const crypto = require("crypto");
const http = require("http");
const express = require("express");
const { pool } = require("./db");
const { redis, connectRedis, closeRedis } = require("./redis");
const { createLogger } = require("./logger");
const { requireInternal } = require("./auth");
const { createErrorHandler, notFoundHandler } = require("./errors");
const { setServiceName, startOutboxRelay } = require("./events");

const requestId = (req, res, next) => {
  const incoming = req.get("x-request-id");
  req.requestId = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.set("x-request-id", req.requestId);
  next();
};

const createService = ({
  name,
  port,
  routes,
  json = true,
  internal = true,
  outbox = true,
  beforeRoutes,
  onStart,
}) => {
  const logger = createLogger(name);
  setServiceName(name);

  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);

  if (beforeRoutes) beforeRoutes(app);

  app.get("/health", async (req, res) => {
    const checks = { db: false, redis: false };

    try {
      await pool.query("SELECT 1");
      checks.db = true;
    } catch {
      checks.db = false;
    }

    try {
      checks.redis = (await redis.ping()) === "PONG";
    } catch {
      checks.redis = false;
    }

    const ok = checks.db && checks.redis;
    res.status(ok ? 200 : 503).json({
      success: ok,
      data: { service: name, ...checks, uptime_s: Math.round(process.uptime()) },
    });
  });

  if (json) app.use(express.json({ limit: "2mb" }));
  if (internal) app.use(requireInternal);

  routes(app, { logger });

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  const start = async () => {
    const stops = [];

    try {
      await connectRedis(logger);
      await pool.query("SELECT 1");
    } catch (error) {
      logger.error("Startup dependency check failed", { error });
      process.exit(1);
    }

    const server = http.createServer(app);

    if (outbox) stops.push(startOutboxRelay({ logger }));

    if (onStart) {
      const extra = await onStart({ app, server, logger });
      for (const stop of [].concat(extra || [])) {
        if (typeof stop === "function") stops.push(stop);
      }
    }

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, resolve);
    });

    logger.info(`${name} listening`, { port });

    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info("Shutting down", { signal });

      const force = setTimeout(() => process.exit(1), 10000);
      force.unref();

      const closed = new Promise((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      setTimeout(() => server.closeAllConnections(), 3000).unref();
      await closed;
      for (const stop of stops) {
        try {
          await stop();
        } catch (error) {
          logger.error("Stop hook failed", { error });
        }
      }
      await closeRedis();
      await pool.end().catch(() => {});
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    return server;
  };

  return { app, logger, start };
};

module.exports = { createService };
