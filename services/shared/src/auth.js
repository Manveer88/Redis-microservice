const crypto = require("crypto");
const config = require("./config");
const { forbidden, unauthorized } = require("./errors");

const ROLES = {
  ALL: ["super_admin", "admin", "operator", "viewer"],
  STAFF: ["super_admin", "admin", "operator"],
  MANAGERS: ["super_admin", "admin"],
  SUPER: ["super_admin"],
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const requireInternal = (req, res, next) => {
  if (!safeEqual(req.get("x-internal-token"), config.internalToken)) {
    return res.status(403).json({
      success: false,
      message: "Direct access is not allowed; use the API gateway",
      code: "INTERNAL_ONLY",
    });
  }

  const id = req.get("x-user-id");
  req.user = id
    ? {
        id: Number(id),
        role: req.get("x-user-role"),
        name: req.get("x-user-name") || "",
        email: req.get("x-user-email") || "",
      }
    : null;

  next();
};

const requireRole = (...allowed) => {
  const roles = allowed.flat();

  return (req, res, next) => {
    if (!req.user) {
      return next(unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(forbidden());
    }
    next();
  };
};

module.exports = { ROLES, requireInternal, requireRole, safeEqual };
