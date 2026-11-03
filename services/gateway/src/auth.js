const jwt = require("jsonwebtoken");
const { config, redis, unauthorized } = require("@isp/shared");

const PUBLIC_ROUTES = [
  ["POST", "/api/auth/login"],
  ["POST", "/api/auth/refresh"],
  ["POST", "/api/auth/logout"],
  ["POST", "/api/usage/ingest"],
];

const isPublic = (req) =>
  PUBLIC_ROUTES.some(([method, path]) => req.method === method && (req.path === path || req.path === `${path}/`));

const bearerToken = (req) => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") || "");
  return match ? match[1] : null;
};

const authenticate = async (req, res, next) => {
  if (isPublic(req)) return next();

  const token = bearerToken(req);
  if (!token) return next(unauthorized("Authentication required", "UNAUTHORIZED"));

  let claims;
  try {
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(unauthorized("Access token expired", "TOKEN_EXPIRED"));
    }
    return next(unauthorized("Invalid access token", "INVALID_TOKEN"));
  }

  if (!claims.sub || !claims.sid || !claims.role) {
    return next(unauthorized("Invalid access token", "INVALID_TOKEN"));
  }

  const raw = await redis.get(`session:${claims.sid}`);
  let session = null;
  try {
    session = raw ? JSON.parse(raw) : null;
  } catch {
    session = null;
  }

  if (!session || String(session.adminId) !== String(claims.sub)) {
    return next(unauthorized("Session expired or revoked", "SESSION_REVOKED"));
  }

  req.user = {
    id: String(claims.sub),
    role: claims.role,
    name: claims.name || "",
    email: claims.email || "",
    sid: claims.sid,
  };
  next();
};

module.exports = { authenticate, isPublic };
