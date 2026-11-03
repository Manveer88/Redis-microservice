const bcrypt = require("bcrypt");
const {
  pool,
  withTransaction,
  redis,
  addEvent,
  validate,
  badRequest,
  unauthorized,
  notFound,
  conflict,
  tooMany,
} = require("@isp/shared");
const sessions = require("./sessions");

const BCRYPT_COST = 12;
const ROLE_VALUES = ["super_admin", "admin", "operator", "viewer"];
const STATUS_VALUES = ["active", "inactive"];
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;
const INVALID_CREDENTIALS = "Invalid email or password";
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);
const ADMIN_COLUMNS = "id, name, email, role, status, last_login_at, created_at, updated_at";

const toPublic = (row) =>
  row && {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

const eventPayload = (admin) => ({
  admin_id: admin.id,
  name: admin.name,
  role: admin.role,
  status: admin.status,
});

const requirePassword = (value, label = "Password") => {
  if (typeof value !== "string" || value.length < 8) {
    throw badRequest(`${label} must be at least 8 characters`);
  }
  if (Buffer.byteLength(value) > 72) {
    throw badRequest(`${label} must be at most 72 bytes`);
  }
  return value;
};

const findAdminById = async (id, connection = pool, { lock = false } = {}) => {
  const [rows] = await connection.execute(
    `SELECT ${ADMIN_COLUMNS} FROM admins WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    [id]
  );
  return rows[0] || null;
};

const failKey = (email) => `login_fail:${email}`;

const recordFailure = async (email) => {
  const count = await redis.incr(failKey(email));
  if (count === 1) await redis.expire(failKey(email), LOGIN_FAIL_WINDOW_SECONDS);
};

const login = async (body) => {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    throw badRequest("Email and password are required");
  }
  if (email.length > 150) {
    throw unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
  }

  const failures = Number(await redis.get(failKey(email))) || 0;
  if (failures >= LOGIN_FAIL_LIMIT) {
    throw tooMany("Too many failed login attempts. Please try again later.", "LOGIN_LOCKED");
  }

  const [rows] = await pool.execute(
    `SELECT ${ADMIN_COLUMNS}, password FROM admins WHERE email = ?`,
    [email]
  );
  const admin = rows[0];
  const matches = await bcrypt.compare(password, admin ? admin.password : DUMMY_HASH);

  if (!admin || !matches || admin.status !== "active") {
    await recordFailure(email);
    throw unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
  }

  await redis.del(failKey(email));
  await pool.execute("UPDATE admins SET last_login_at = NOW() WHERE id = ?", [admin.id]);

  const session = await sessions.createSession(admin);
  const fresh = await findAdminById(admin.id);

  return { accessToken: session.accessToken, refreshToken: session.refreshToken, user: toPublic(fresh) };
};

const refresh = async (token) => {
  const session = await sessions.findRefreshSession(token);
  if (!session) {
    throw unauthorized("Session expired, please log in again", "INVALID_REFRESH_TOKEN");
  }

  const admin = await findAdminById(session.data.adminId);
  if (!admin || admin.status !== "active") {
    await sessions.deleteSession(session.sid, session.data.adminId);
    throw unauthorized("Session expired, please log in again", "INVALID_REFRESH_TOKEN");
  }

  const rotated = await sessions.rotateSession(session.sid, session.raw, admin, session.data.createdAt);
  if (!rotated) {
    throw unauthorized("Session expired, please log in again", "INVALID_REFRESH_TOKEN");
  }

  return { accessToken: rotated.accessToken, refreshToken: rotated.refreshToken, user: toPublic(admin) };
};

const logout = async (req) => {
  const session = await sessions.findRefreshSession(sessions.readRefreshCookie(req));
  if (session) await sessions.deleteSession(session.sid, session.data.adminId);

  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  const claims = match ? sessions.verifyAccessToken(match[1].trim()) : null;
  if (claims && claims.sid) await sessions.deleteSession(claims.sid, claims.sub);
};

const me = async (userId) => {
  const admin = await findAdminById(userId);
  if (!admin) throw unauthorized();
  return toPublic(admin);
};

const currentSid = (req) => {
  const header = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) {
    const claims = sessions.verifyAccessToken(match[1].trim());
    if (claims && String(claims.sub) === String(req.user.id) && claims.sid) return claims.sid;
  }
  const parsed = sessions.parseRefreshToken(sessions.readRefreshCookie(req));
  return parsed ? parsed.sid : null;
};

const changePassword = async (req) => {
  const body = req.body || {};
  if (typeof body.current_password !== "string" || !body.current_password) {
    throw badRequest("Current password is required");
  }
  const newPassword = requirePassword(body.new_password, "New password");

  const [rows] = await pool.execute("SELECT id, password FROM admins WHERE id = ?", [req.user.id]);
  const admin = rows[0];
  if (!admin) throw unauthorized();

  if (!(await bcrypt.compare(body.current_password, admin.password))) {
    throw badRequest("Current password is incorrect", "INVALID_PASSWORD");
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await pool.execute("UPDATE admins SET password = ? WHERE id = ?", [hash, admin.id]);

  const sid = currentSid(req);
  await sessions.revokeAdminSessions(admin.id, { exceptSid: sid });
};

const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const listAdmins = async (query) => {
  const pagination = validate.parsePagination(query);
  const where = [];
  const params = [];

  const search = validate.optionalString(query.search, "Search", { max: 100 });
  if (search) {
    where.push("(name LIKE ? OR email LIKE ?)");
    params.push(`%${escapeLike(search)}%`, `%${escapeLike(search)}%`);
  }
  const role = validate.optionalEnum(query.role, "Role", ROLE_VALUES);
  if (role) {
    where.push("role = ?");
    params.push(role);
  }
  const status = validate.optionalEnum(query.status, "Status", STATUS_VALUES);
  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM admins ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT ${ADMIN_COLUMNS} FROM admins ${clause} ORDER BY id ASC LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );

  return { data: rows.map(toPublic), meta: validate.pageMeta(pagination, total) };
};

const ensureEmailFree = async (connection, email, exceptId) => {
  const [rows] = await connection.execute(
    "SELECT id FROM admins WHERE email = ? AND id <> ?",
    [email, exceptId || 0]
  );
  if (rows.length) throw conflict("An admin with this email already exists", "EMAIL_TAKEN");
};

const createAdmin = async (body) => {
  const name = validate.requireString(body.name, "Name", { max: 100 });
  const email = validate.requireEmail(body.email);
  const password = requirePassword(body.password);
  const role = validate.requireEnum(body.role, "Role", ROLE_VALUES);
  const hash = await bcrypt.hash(password, BCRYPT_COST);

  return withTransaction(async (connection) => {
    await ensureEmailFree(connection, email);
    const [result] = await connection.execute(
      "INSERT INTO admins (name, email, password, role, status) VALUES (?, ?, ?, ?, 'active')",
      [name, email, hash, role]
    );
    const admin = await findAdminById(result.insertId, connection);
    await addEvent(connection, "admin.created", eventPayload(admin));
    return toPublic(admin);
  });
};

const updateAdmin = async (id, body, actor) => {
  const name = validate.requireString(body.name, "Name", { max: 100 });
  const email = validate.requireEmail(body.email);
  const role = validate.requireEnum(body.role, "Role", ROLE_VALUES);

  const { admin, roleChanged } = await withTransaction(async (connection) => {
    const existing = await findAdminById(id, connection, { lock: true });
    if (!existing) throw notFound("Admin not found");
    if (existing.id === actor.id && role !== existing.role) {
      throw conflict("You cannot change your own role", "SELF_DEMOTION");
    }
    await ensureEmailFree(connection, email, id);
    await connection.execute(
      "UPDATE admins SET name = ?, email = ?, role = ? WHERE id = ?",
      [name, email, role, id]
    );
    const updated = await findAdminById(id, connection);
    await addEvent(connection, "admin.updated", eventPayload(updated));
    return { admin: updated, roleChanged: existing.role !== role };
  });

  if (roleChanged) await sessions.revokeAdminSessions(id);
  return toPublic(admin);
};

const setAdminStatus = async (id, body, actor) => {
  const status = validate.requireEnum(body.status, "Status", STATUS_VALUES);
  if (id === actor.id && status !== "active") {
    throw conflict("You cannot deactivate your own account", "SELF_DEACTIVATION");
  }

  const admin = await withTransaction(async (connection) => {
    const existing = await findAdminById(id, connection, { lock: true });
    if (!existing) throw notFound("Admin not found");
    if (existing.status === status) return existing;
    await connection.execute("UPDATE admins SET status = ? WHERE id = ?", [status, id]);
    const updated = await findAdminById(id, connection);
    await addEvent(connection, "admin.updated", eventPayload(updated));
    return updated;
  });

  if (status === "inactive") await sessions.revokeAdminSessions(id);
  return toPublic(admin);
};

const resetPassword = async (id, body) => {
  const password = requirePassword(body.password);
  const admin = await findAdminById(id);
  if (!admin) throw notFound("Admin not found");

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await pool.execute("UPDATE admins SET password = ? WHERE id = ?", [hash, id]);
  await sessions.revokeAdminSessions(id);
  return toPublic(await findAdminById(id));
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const listAuditLogs = async (query) => {
  const pagination = validate.parsePagination(query);
  const where = [];
  const params = [];

  const adminId = validate.optionalId(query.admin_id, "admin ID");
  if (adminId) {
    where.push("admin_id = ?");
    params.push(adminId);
  }
  const method = validate.optionalEnum(
    typeof query.method === "string" ? query.method.toUpperCase() : query.method,
    "Method",
    METHODS
  );
  if (method) {
    where.push("method = ?");
    params.push(method);
  }
  const from = validate.optionalDate(query.from, "From date");
  if (from) {
    where.push("created_at >= ?");
    params.push(from);
  }
  const to = validate.optionalDate(query.to, "To date");
  if (to) {
    if (DATE_ONLY.test(String(query.to))) {
      where.push("created_at < DATE_ADD(?, INTERVAL 1 DAY)");
      params.push(String(query.to));
    } else {
      where.push("created_at <= ?");
      params.push(to);
    }
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT id, admin_id, admin_name, method, path, status_code, ip, request_id, created_at
     FROM audit_logs ${clause}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );

  return { data: rows, meta: validate.pageMeta(pagination, total) };
};

module.exports = {
  login,
  refresh,
  logout,
  me,
  changePassword,
  listAdmins,
  createAdmin,
  updateAdmin,
  setAdminStatus,
  resetPassword,
  listAuditLogs,
};
