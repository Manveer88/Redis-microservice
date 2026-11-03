const { pool } = require("@isp/shared");

const SKIP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const auditTrail = (logger) => (req, res, next) => {
  if (SKIP_METHODS.has(req.method)) return next();

  res.on("finish", () => {
    if (!req.user) return;
    pool
      .execute(
        `INSERT INTO audit_logs (admin_id, admin_name, method, path, status_code, ip, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(req.user.id),
          String(req.user.name || "").slice(0, 100),
          req.method.slice(0, 10),
          req.originalUrl.slice(0, 255),
          res.statusCode,
          String(req.ip || "").slice(0, 64),
          req.requestId,
        ]
      )
      .catch((error) => {
        logger.error("Audit log insert failed", { error, requestId: req.requestId });
      });
  });

  next();
};

module.exports = { auditTrail };
