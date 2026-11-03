const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { config, redis, safeEqual } = require("@isp/shared");

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const ACCESS_TOKEN_TTL = "15m";
const COOKIE_NAME = "refresh_token";
const COOKIE_PATH = "/api/auth";

const CAS_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
  return 1
end
return 0`;

const sessionKey = (sid) => `session:${sid}`;
const adminSessionsKey = (adminId) => `admin_sessions:${adminId}`;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const newRefreshToken = (sid) => {
  const token = `${sid}.${crypto.randomBytes(32).toString("base64url")}`;
  return { token, hash: sha256(token) };
};

const signAccessToken = (admin, sid) =>
  jwt.sign(
    { role: admin.role, name: admin.name, email: admin.email, sid },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL, subject: String(admin.id) }
  );

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
};

const sessionData = (admin, refreshHash, createdAt) => ({
  adminId: admin.id,
  role: admin.role,
  name: admin.name,
  email: admin.email,
  refreshHash,
  createdAt: createdAt || new Date().toISOString(),
});

const createSession = async (admin) => {
  const sid = crypto.randomBytes(16).toString("hex");
  const refresh = newRefreshToken(sid);

  await redis
    .multi()
    .set(sessionKey(sid), JSON.stringify(sessionData(admin, refresh.hash)), { EX: SESSION_TTL_SECONDS })
    .sAdd(adminSessionsKey(admin.id), sid)
    .expire(adminSessionsKey(admin.id), SESSION_TTL_SECONDS)
    .exec();

  return { sid, refreshToken: refresh.token, accessToken: signAccessToken(admin, sid) };
};

const parseRefreshToken = (token) => {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const sid = token.slice(0, dot);
  if (!/^[a-f0-9]{32}$/.test(sid)) return null;
  return { sid, token };
};

const readSession = async (sid) => {
  const raw = await redis.get(sessionKey(sid));
  if (!raw) return null;
  try {
    return { raw, data: JSON.parse(raw) };
  } catch {
    return null;
  }
};

const findRefreshSession = async (token) => {
  const parsed = parseRefreshToken(token);
  if (!parsed) return null;
  const session = await readSession(parsed.sid);
  if (!session || !safeEqual(session.data.refreshHash, sha256(parsed.token))) return null;
  return { sid: parsed.sid, ...session };
};

const rotateSession = async (sid, previousRaw, admin, createdAt) => {
  const refresh = newRefreshToken(sid);
  const next = JSON.stringify(sessionData(admin, refresh.hash, createdAt));
  const swapped = await redis.eval(CAS_SCRIPT, {
    keys: [sessionKey(sid)],
    arguments: [previousRaw, next, String(SESSION_TTL_SECONDS)],
  });

  if (Number(swapped) !== 1) return null;

  await redis
    .multi()
    .sAdd(adminSessionsKey(admin.id), sid)
    .expire(adminSessionsKey(admin.id), SESSION_TTL_SECONDS)
    .exec();

  return { refreshToken: refresh.token, accessToken: signAccessToken(admin, sid) };
};

const deleteSession = async (sid, adminId) => {
  const multi = redis.multi().del(sessionKey(sid));
  if (adminId) multi.sRem(adminSessionsKey(adminId), sid);
  await multi.exec();
};

const revokeAdminSessions = async (adminId, { exceptSid } = {}) => {
  const key = adminSessionsKey(adminId);
  const sids = await redis.sMembers(key);
  const revoke = sids.filter((sid) => sid !== exceptSid);
  const multi = redis.multi();

  for (const sid of revoke) {
    multi.del(sessionKey(sid));
    multi.sRem(key, sid);
  }

  if (revoke.length) await multi.exec();
  return revoke.length;
};

const parseCookies = (header) => {
  const cookies = {};
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!name || name in cookies) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
};

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: config.isProduction,
  path: COOKIE_PATH,
});

const setRefreshCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_TTL_SECONDS * 1000 });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
};

const readRefreshCookie = (req) => parseCookies(req.get("cookie"))[COOKIE_NAME];

module.exports = {
  createSession,
  findRefreshSession,
  rotateSession,
  deleteSession,
  revokeAdminSessions,
  verifyAccessToken,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
  parseRefreshToken,
};
