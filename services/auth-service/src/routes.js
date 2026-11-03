const express = require("express");
const { ROLES, requireRole, validate } = require("@isp/shared");
const service = require("./service");
const sessions = require("./sessions");

module.exports = (app) => {
  const auth = express.Router();

  auth.post("/login", async (req, res) => {
    const result = await service.login(req.body || {});
    sessions.setRefreshCookie(res, result.refreshToken);
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
  });

  auth.post("/refresh", async (req, res) => {
    const result = await service.refresh(sessions.readRefreshCookie(req));
    sessions.setRefreshCookie(res, result.refreshToken);
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
  });

  auth.post("/logout", async (req, res) => {
    await service.logout(req);
    sessions.clearRefreshCookie(res);
    res.json({ success: true, message: "Logged out" });
  });

  auth.get("/me", requireRole(ROLES.ALL), async (req, res) => {
    res.json({ success: true, data: await service.me(req.user.id) });
  });

  auth.post("/change-password", requireRole(ROLES.ALL), async (req, res) => {
    await service.changePassword(req);
    res.json({ success: true, message: "Password changed" });
  });

  const users = express.Router();
  users.use(requireRole(ROLES.SUPER));

  users.get("/", async (req, res) => {
    const result = await service.listAdmins(req.query);
    res.json({ success: true, data: result.data, meta: result.meta });
  });

  users.post("/", async (req, res) => {
    res.status(201).json({ success: true, data: await service.createAdmin(req.body || {}), message: "Admin created" });
  });

  users.put("/:id", async (req, res) => {
    const id = validate.parseId(req.params.id, "admin ID");
    res.json({ success: true, data: await service.updateAdmin(id, req.body || {}, req.user), message: "Admin updated" });
  });

  users.patch("/:id/status", async (req, res) => {
    const id = validate.parseId(req.params.id, "admin ID");
    res.json({ success: true, data: await service.setAdminStatus(id, req.body || {}, req.user), message: "Status updated" });
  });

  users.post("/:id/reset-password", async (req, res) => {
    const id = validate.parseId(req.params.id, "admin ID");
    res.json({ success: true, data: await service.resetPassword(id, req.body || {}), message: "Password reset" });
  });

  const auditLogs = express.Router();
  auditLogs.use(requireRole(ROLES.SUPER));

  auditLogs.get("/", async (req, res) => {
    const result = await service.listAuditLogs(req.query);
    res.json({ success: true, data: result.data, meta: result.meta });
  });

  app.use("/api/auth", auth);
  app.use("/api/users", users);
  app.use("/api/audit-logs", auditLogs);
};
