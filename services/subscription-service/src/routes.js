const express = require("express");
const { ROLES, requireRole, cache, invalidate, validate } = require("@isp/shared");
const service = require("./service");

module.exports = (app) => {
  const router = express.Router();

  router.get("/", requireRole(ROLES.ALL), cache("subscriptions", 60), async (req, res) => {
    const { rows, meta } = await service.listSubscriptions(req.query);
    res.json({ success: true, data: rows, meta });
  });

  router.get("/:id", requireRole(ROLES.ALL), cache("subscriptions", 60), async (req, res) => {
    const subscription = await service.getSubscription(validate.parseId(req.params.id, "subscription ID"));
    res.json({ success: true, data: subscription });
  });

  router.post("/", requireRole(ROLES.STAFF), invalidate("subscriptions"), async (req, res) => {
    const subscription = await service.createSubscription(req.body || {});
    res.status(201).json({ success: true, data: subscription, message: "Subscription created successfully" });
  });

  router.post("/:id/cancel", requireRole(ROLES.STAFF), invalidate("subscriptions"), async (req, res) => {
    const subscription = await service.cancelSubscription(
      validate.parseId(req.params.id, "subscription ID"),
      req.body || {}
    );
    res.json({ success: true, data: subscription, message: "Subscription cancelled" });
  });

  app.use("/api/subscriptions", router);
};
