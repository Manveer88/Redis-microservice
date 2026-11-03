const express = require("express");
const { ROLES, requireRole, cache, invalidate, validate } = require("@isp/shared");
const service = require("./service");

const NAMESPACES = ["subscribers", "subscriptions"];

module.exports = (app) => {
  const router = express.Router();

  router.get("/", requireRole(ROLES.ALL), cache("subscribers", 60), async (req, res) => {
    const { rows, meta } = await service.listSubscribers(req.query);
    res.json({ success: true, data: rows, meta });
  });

  router.get("/:id", requireRole(ROLES.ALL), cache("subscribers", 60), async (req, res) => {
    const subscriber = await service.getSubscriber(validate.parseId(req.params.id, "subscriber ID"));
    res.json({ success: true, data: subscriber });
  });

  router.post("/", requireRole(ROLES.STAFF), invalidate(...NAMESPACES), async (req, res) => {
    const subscriber = await service.createSubscriber(req.body || {});
    res.status(201).json({ success: true, data: subscriber, message: "Subscriber created successfully" });
  });

  router.put("/:id", requireRole(ROLES.STAFF), invalidate(...NAMESPACES), async (req, res) => {
    const subscriber = await service.updateSubscriber(
      validate.parseId(req.params.id, "subscriber ID"),
      req.body || {}
    );
    res.json({ success: true, data: subscriber, message: "Subscriber updated successfully" });
  });

  router.patch("/:id/status", requireRole(ROLES.STAFF), invalidate(...NAMESPACES), async (req, res) => {
    const subscriber = await service.updateSubscriberStatus(
      validate.parseId(req.params.id, "subscriber ID"),
      (req.body || {}).status
    );
    res.json({ success: true, data: subscriber, message: "Subscriber status updated" });
  });

  router.delete("/:id", requireRole(ROLES.MANAGERS), invalidate(...NAMESPACES), async (req, res) => {
    await service.deleteSubscriber(validate.parseId(req.params.id, "subscriber ID"));
    res.json({ success: true, data: null, message: "Subscriber deleted successfully" });
  });

  app.use("/api/subscribers", router);
};
