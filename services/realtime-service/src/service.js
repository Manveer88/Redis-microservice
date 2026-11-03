const jwt = require("jsonwebtoken");
const { config, redis } = require("@isp/shared");

const readSession = async (sid) => {
  const raw = await redis.get(`session:${sid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const authenticateToken = async (token) => {
  if (typeof token !== "string" || !token) return null;

  let claims;
  try {
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }

  if (!claims.sub || !claims.sid || !claims.role) return null;

  const session = await readSession(claims.sid);
  if (!session || String(session.adminId) !== String(claims.sub)) return null;

  return {
    id: Number(claims.sub),
    role: claims.role,
    name: claims.name || "",
    email: claims.email || "",
    sid: claims.sid,
  };
};

const sessionsAlive = async (sids) => {
  if (!sids.length) return [];
  const multi = redis.multi();
  for (const sid of sids) multi.exists(`session:${sid}`);
  const results = await multi.exec();
  return results.map((value) => Number(value) === 1);
};

const parseLiveMessage = (message) => {
  try {
    const parsed = JSON.parse(message);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

module.exports = { authenticateToken, sessionsAlive, parseLiveMessage };
