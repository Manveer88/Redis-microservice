const express = require("express");
const { ROLES, requireRole, cache, invalidate } = require("@isp/shared");
const service = require("./service");

module.exports = (app) => {
  const router = express.Router();

  router.use(requireRole(ROLES.ALL));

  router.get("/", cache("notifications", 30), async (req, res) => {
    const { rows, meta } = await service.listNotifications(req.query);
    res.json({ success: true, data: rows, meta });
  });

  router.get("/unread-count", cache("notifications", 30), async (req, res) => {
    const count = await service.unreadCount();
    res.json({ success: true, data: { count } });
  });

  router.post("/read-all", invalidate("notifications"), async (req, res) => {
    const updated = await service.markAllRead();
    res.json({ success: true, data: { updated }, message: "All notifications marked as read" });
  });

  router.patch("/:id/read", invalidate("notifications"), async (req, res) => {
    const notification = await service.markRead(req.params.id);
    res.json({ success: true, data: notification, message: "Notification marked as read" });
  });

  app.use("/api/notifications", router);
};
