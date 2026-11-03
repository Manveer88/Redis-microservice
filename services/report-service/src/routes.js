const express = require("express");
const { ROLES, requireRole, cache } = require("@isp/shared");
const service = require("./service");
const { toCsv, exportFilename } = require("./csv");

module.exports = (app) => {
  const router = express.Router();

  router.get("/dashboard", requireRole(ROLES.ALL), cache("reports", 60), async (req, res) => {
    res.json({ success: true, data: await service.dashboard() });
  });

  router.get("/revenue", requireRole(ROLES.ALL), cache("reports", 60), async (req, res) => {
    res.json({ success: true, data: await service.revenue(req.query) });
  });

  router.get("/expiring", requireRole(ROLES.ALL), cache("reports", 60), async (req, res) => {
    res.json({ success: true, data: await service.expiring(req.query) });
  });

  router.get("/top-usage", requireRole(ROLES.ALL), cache("reports", 60), async (req, res) => {
    res.json({ success: true, data: await service.topUsage(req.query) });
  });

  router.get("/export/:type", requireRole(ROLES.MANAGERS), async (req, res) => {
    const { columns, rows } = await service.exportRows(req.params.type, req.query);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${exportFilename(req.params.type)}"`);
    res.set("Cache-Control", "no-store");
    res.send(toCsv(columns, rows));
  });

  app.use("/api/reports", router);
};
