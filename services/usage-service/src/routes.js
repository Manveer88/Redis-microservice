const express = require("express");
const { ROLES, requireRole, cache, invalidate, config, safeEqual, unauthorized } = require("@isp/shared");
const service = require("./service");

const requireIngestKey = (req, res, next) => {
  const expected = config.env("USAGE_INGEST_KEY");
  if (!expected || !safeEqual(req.get("x-api-key"), expected)) {
    return next(unauthorized("Invalid API key", "INVALID_API_KEY"));
  }
  next();
};

module.exports = (app, { logger }) => {
  const router = express.Router();

  router.post("/ingest", requireIngestKey, async (req, res) => {
    const records = service.parseIngestBody(req.body);
    const data = await service.processRecords(records, "api", logger);
    res.json({ success: true, data });
  });

  router.post("/import", requireRole(ROLES.STAFF), invalidate("usage", "reports"), async (req, res) => {
    const records = service.parseCsvBody(req.body);
    const data = await service.processRecords(records, "csv", logger);
    res.json({ success: true, data, message: "Usage imported" });
  });

  router.get("/summary", requireRole(ROLES.ALL), cache("usage", 60), async (req, res) => {
    const { rows, meta } = await service.getSummary(req.query);
    res.json({ success: true, data: rows, meta });
  });

  router.get("/subscribers/:id", requireRole(ROLES.ALL), cache("usage", 60), async (req, res) => {
    res.json({ success: true, data: await service.getSubscriberUsage(req.params.id, req.query) });
  });

  app.use("/api/usage", router);
};
