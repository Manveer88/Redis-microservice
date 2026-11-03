const express = require("express");
const { ROLES, requireRole, cache, invalidate, validate } = require("@isp/shared");
const service = require("./service");

const NAMESPACES = ["plans", "subscribers", "subscriptions"];

module.exports = (app) => {
  const router = express.Router();

  router.get("/", requireRole(ROLES.ALL), cache("plans", 60), async (req, res) => {
    const { rows, meta } = await service.listPlans(req.query);
    res.json({ success: true, data: rows, meta });
  });

  router.get("/:id", requireRole(ROLES.ALL), cache("plans", 60), async (req, res) => {
    const plan = await service.getPlan(validate.parseId(req.params.id, "plan ID"));
    res.json({ success: true, data: plan });
  });

  router.post("/", requireRole(ROLES.MANAGERS), invalidate(...NAMESPACES), async (req, res) => {
    const plan = await service.createPlan(req.body || {});
    res.status(201).json({ success: true, data: plan, message: "Plan created successfully" });
  });

  router.put("/:id", requireRole(ROLES.MANAGERS), invalidate(...NAMESPACES), async (req, res) => {
    const plan = await service.updatePlan(validate.parseId(req.params.id, "plan ID"), req.body || {});
    res.json({ success: true, data: plan, message: "Plan updated successfully" });
  });

  router.patch("/:id/status", requireRole(ROLES.MANAGERS), invalidate(...NAMESPACES), async (req, res) => {
    const plan = await service.updatePlanStatus(
      validate.parseId(req.params.id, "plan ID"),
      (req.body || {}).status
    );
    res.json({ success: true, data: plan, message: "Plan status updated successfully" });
  });

  router.delete("/:id", requireRole(ROLES.MANAGERS), invalidate(...NAMESPACES), async (req, res) => {
    await service.deletePlan(validate.parseId(req.params.id, "plan ID"));
    res.json({ success: true, data: null, message: "Plan deleted successfully" });
  });

  app.use("/api/plans", router);
};
