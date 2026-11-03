const {
  pool,
  publishLive,
  bumpCache,
  notFound,
  validate: { parseId, parsePagination, pageMeta },
} = require("@isp/shared");

const COLUMNS = "id, type, title, message, severity, entity_type, entity_id, read_at, created_at";

const clip = (value, max) => {
  const text = String(value === undefined || value === null ? "" : value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const createNotification = async ({ type, title, message, severity = "info", entityType = null, entityId = null, dedupeKey }) => {
  const row = {
    type: clip(type, 100),
    title: clip(title, 150),
    message: clip(message, 500),
    severity,
  };

  const [result] = await pool.execute(
    `INSERT IGNORE INTO notifications (type, title, message, severity, entity_type, entity_id, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.type, row.title, row.message, row.severity, entityType, entityId || null, clip(dedupeKey, 191)]
  );

  if (!result.affectedRows) {
    return null;
  }

  const id = result.insertId;
  await bumpCache("notifications").catch(() => {});
  await publishLive("notification.created", { id, ...row });
  return id;
};

const listNotifications = async (query) => {
  const pagination = parsePagination(query);
  const where = query.unread === "true" ? "WHERE read_at IS NULL" : "";

  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM notifications ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [pagination.limit, pagination.offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notifications ${where}`);

  return { rows, meta: pageMeta(pagination, total) };
};

const unreadCount = async () => {
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM notifications WHERE read_at IS NULL");
  return Number(count);
};

const markRead = async (rawId) => {
  const id = parseId(rawId, "notification ID");
  await pool.execute("UPDATE notifications SET read_at = NOW() WHERE id = ? AND read_at IS NULL", [id]);
  const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM notifications WHERE id = ?`, [id]);
  if (!rows.length) {
    throw notFound("Notification not found");
  }
  return rows[0];
};

const markAllRead = async () => {
  const [result] = await pool.execute("UPDATE notifications SET read_at = NOW() WHERE read_at IS NULL");
  return result.affectedRows;
};

const getSubscriber = async (id) => {
  if (!id) return null;
  const [rows] = await pool.execute(
    "SELECT id, name, username, email, mobile FROM subscribers WHERE id = ?",
    [id]
  );
  return rows[0] || null;
};

const getPlan = async (id) => {
  if (!id) return null;
  const [rows] = await pool.execute("SELECT id, name FROM plans WHERE id = ?", [id]);
  return rows[0] || null;
};

const getSubscription = async (id) => {
  if (!id) return null;
  const [rows] = await pool.execute(
    "SELECT id, subscriber_id, plan_id, end_date FROM subscriptions WHERE id = ?",
    [id]
  );
  return rows[0] || null;
};

const findExpiringSubscriptions = async () => {
  const [rows] = await pool.query(
    `SELECT s.id AS subscription_id, s.subscriber_id, s.plan_id, s.end_date,
            sub.name, sub.username, sub.email, sub.mobile, p.name AS plan_name
     FROM subscriptions s
     LEFT JOIN subscribers sub ON sub.id = s.subscriber_id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.status = 'active' AND s.end_date BETWEEN NOW() AND NOW() + INTERVAL 3 DAY
     ORDER BY s.end_date`
  );
  return rows;
};

module.exports = {
  createNotification,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  getSubscriber,
  getPlan,
  getSubscription,
  findExpiringSubscriptions,
};
