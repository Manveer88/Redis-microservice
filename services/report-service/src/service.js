const {
  pool,
  badRequest,
  validate: { requireNumber, toMoney },
} = require("@isp/shared");

const EXPORT_LIMIT = 50000;

const intParam = (value, label, { min, max, fallback }) =>
  value === undefined || value === "" ? fallback : requireNumber(value, label, { min, max, integer: true });

const num = (value) => Number(value || 0);

const dashboard = async () => {
  const [
    [[subscribers]],
    [[subscriptions]],
    [[revenue]],
    [[invoices]],
    [plans],
    [[usage]],
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'active'), 0) AS active,
              COALESCE(SUM(status = 'inactive'), 0) AS inactive,
              COALESCE(SUM(status = 'suspended'), 0) AS suspended
       FROM subscribers`
    ),
    pool.query(
      `SELECT COALESCE(SUM(status = 'pending'), 0) AS pending,
              COALESCE(SUM(status = 'active'), 0) AS active,
              COALESCE(SUM(status = 'active' AND end_date > NOW() AND end_date <= NOW() + INTERVAL 7 DAY), 0) AS expiring_7d
       FROM subscriptions`
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN paid_at >= CURDATE() AND paid_at < CURDATE() + INTERVAL 1 DAY THEN amount END), 0) AS today,
              COALESCE(SUM(CASE WHEN paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                                 AND paid_at < DATE_FORMAT(CURDATE(), '%Y-%m-01') + INTERVAL 1 MONTH THEN amount END), 0) AS month,
              COALESCE(SUM(amount), 0) AS total
       FROM payments`
    ),
    pool.query(
      `SELECT COUNT(*) AS unpaid_count, COALESCE(SUM(amount - amount_paid), 0) AS unpaid_amount
       FROM invoices
       WHERE status IN ('unpaid', 'partial')`
    ),
    pool.query(
      `SELECT p.id AS plan_id, p.name, COUNT(s.id) AS subscribers
       FROM plans p
       LEFT JOIN subscribers s ON s.plan_id = p.id
       GROUP BY p.id, p.name
       ORDER BY subscribers DESC, p.name`
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN usage_date = CURDATE() THEN bytes_in + bytes_out END), 0) AS today_bytes,
              COALESCE(SUM(bytes_in + bytes_out), 0) AS month_bytes
       FROM usage_daily
       WHERE usage_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND usage_date <= CURDATE()`
    ),
  ]);

  return {
    subscribers: {
      total: num(subscribers.total),
      active: num(subscribers.active),
      inactive: num(subscribers.inactive),
      suspended: num(subscribers.suspended),
    },
    subscriptions: {
      pending: num(subscriptions.pending),
      active: num(subscriptions.active),
      expiring_7d: num(subscriptions.expiring_7d),
    },
    revenue: {
      today: toMoney(revenue.today),
      month: toMoney(revenue.month),
      total: toMoney(revenue.total),
    },
    invoices: {
      unpaid_count: num(invoices.unpaid_count),
      unpaid_amount: toMoney(invoices.unpaid_amount),
    },
    plans: plans.map((plan) => ({ plan_id: num(plan.plan_id), name: plan.name, subscribers: num(plan.subscribers) })),
    usage: {
      today_bytes: num(usage.today_bytes),
      month_bytes: num(usage.month_bytes),
    },
  };
};

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const revenue = async (query) => {
  const months = intParam(query.months, "months", { min: 1, max: 36, fallback: 12 });
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, SUM(amount) AS amount, COUNT(*) AS payments
     FROM payments
     WHERE paid_at >= ?
     GROUP BY month`,
    [start]
  );
  const byMonth = new Map(rows.map((row) => [row.month, row]));

  const result = [];
  for (let index = 0; index < months; index += 1) {
    const key = monthKey(new Date(start.getFullYear(), start.getMonth() + index, 1));
    const row = byMonth.get(key);
    result.push({ month: key, amount: toMoney(row ? row.amount : 0), payments: num(row && row.payments) });
  }
  return result;
};

const expiring = async (query) => {
  const days = intParam(query.days, "days", { min: 1, max: 90, fallback: 7 });

  const [rows] = await pool.query(
    `SELECT s.id AS subscription_id, s.subscriber_id, sub.name, sub.username, sub.mobile,
            s.plan_id, p.name AS plan_name, s.end_date,
            GREATEST(0, TIMESTAMPDIFF(HOUR, NOW(), s.end_date)) AS hours_left
     FROM subscriptions s
     LEFT JOIN subscribers sub ON sub.id = s.subscriber_id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.status = 'active' AND s.end_date > NOW() AND s.end_date <= NOW() + INTERVAL ? DAY
     ORDER BY s.end_date, s.id
     LIMIT 1000`,
    [days]
  );

  return rows.map((row) => ({
    subscription_id: num(row.subscription_id),
    subscriber_id: num(row.subscriber_id),
    name: row.name,
    username: row.username,
    mobile: row.mobile,
    plan_id: num(row.plan_id),
    plan_name: row.plan_name,
    end_date: row.end_date,
    days_left: Math.ceil(num(row.hours_left) / 24),
  }));
};

const topUsage = async (query) => {
  const days = intParam(query.days, "days", { min: 1, max: 365, fallback: 30 });
  const limit = intParam(query.limit, "limit", { min: 1, max: 100, fallback: 10 });

  const [rows] = await pool.query(
    `SELECT u.subscriber_id, sub.name, sub.username,
            SUM(u.bytes_in) AS bytes_in, SUM(u.bytes_out) AS bytes_out,
            SUM(u.bytes_in + u.bytes_out) AS total_bytes
     FROM usage_daily u
     LEFT JOIN subscribers sub ON sub.id = u.subscriber_id
     WHERE u.usage_date >= CURDATE() - INTERVAL ? DAY AND u.usage_date <= CURDATE()
     GROUP BY u.subscriber_id, sub.name, sub.username
     ORDER BY total_bytes DESC, u.subscriber_id
     LIMIT ?`,
    [days - 1, limit]
  );

  return rows.map((row) => ({
    subscriber_id: num(row.subscriber_id),
    name: row.name,
    username: row.username,
    bytes_in: num(row.bytes_in),
    bytes_out: num(row.bytes_out),
    total_bytes: num(row.total_bytes),
  }));
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseBound = (value, label, isEnd) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw badRequest(`${label} is not a valid date`);

  const match = DATE_ONLY.exec(value);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + (isEnd ? 1 : 0));
    if (Number.isNaN(date.getTime())) throw badRequest(`${label} is not a valid date`);
    return { date, op: isEnd ? "<" : ">=" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} is not a valid date`);
  return { date, op: isEnd ? "<=" : ">=" };
};

const EXPORTS = {
  subscribers: {
    dateColumn: "s.created_at",
    sql: `SELECT s.id, s.name, s.username, s.email, s.mobile, s.status, s.plan_id, p.name AS plan_name,
                 s.expires_at, s.created_at
          FROM subscribers s
          LEFT JOIN plans p ON p.id = s.plan_id`,
    order: "s.id",
    columns: [
      { key: "id", header: "id" },
      { key: "name", header: "name" },
      { key: "username", header: "username" },
      { key: "email", header: "email" },
      { key: "mobile", header: "mobile" },
      { key: "status", header: "status" },
      { key: "plan_id", header: "plan_id" },
      { key: "plan_name", header: "plan_name" },
      { key: "expires_at", header: "expires_at" },
      { key: "created_at", header: "created_at" },
    ],
  },
  subscriptions: {
    dateColumn: "s.created_at",
    sql: `SELECT s.id, s.subscriber_id, sub.name AS subscriber_name, sub.username, s.plan_id, p.name AS plan_name,
                 s.status, s.amount, s.invoice_id, s.start_date, s.end_date, s.activated_at, s.cancelled_at, s.created_at
          FROM subscriptions s
          LEFT JOIN subscribers sub ON sub.id = s.subscriber_id
          LEFT JOIN plans p ON p.id = s.plan_id`,
    order: "s.id",
    columns: [
      { key: "id", header: "id" },
      { key: "subscriber_id", header: "subscriber_id" },
      { key: "subscriber_name", header: "subscriber_name" },
      { key: "username", header: "username" },
      { key: "plan_id", header: "plan_id" },
      { key: "plan_name", header: "plan_name" },
      { key: "status", header: "status" },
      { key: "amount", header: "amount", kind: "money" },
      { key: "invoice_id", header: "invoice_id" },
      { key: "start_date", header: "start_date" },
      { key: "end_date", header: "end_date" },
      { key: "activated_at", header: "activated_at" },
      { key: "cancelled_at", header: "cancelled_at" },
      { key: "created_at", header: "created_at" },
    ],
  },
  invoices: {
    dateColumn: "i.issued_at",
    sql: `SELECT i.id, i.invoice_number, i.subscriber_id, sub.name AS subscriber_name, sub.username, i.subscription_id,
                 i.amount, i.amount_paid, (i.amount - i.amount_paid) AS outstanding, i.status,
                 i.issued_at, i.due_date, i.paid_at
          FROM invoices i
          LEFT JOIN subscribers sub ON sub.id = i.subscriber_id`,
    order: "i.id",
    columns: [
      { key: "id", header: "id" },
      { key: "invoice_number", header: "invoice_number" },
      { key: "subscriber_id", header: "subscriber_id" },
      { key: "subscriber_name", header: "subscriber_name" },
      { key: "username", header: "username" },
      { key: "subscription_id", header: "subscription_id" },
      { key: "amount", header: "amount", kind: "money" },
      { key: "amount_paid", header: "amount_paid", kind: "money" },
      { key: "outstanding", header: "outstanding", kind: "money" },
      { key: "status", header: "status" },
      { key: "issued_at", header: "issued_at" },
      { key: "due_date", header: "due_date" },
      { key: "paid_at", header: "paid_at" },
    ],
  },
  payments: {
    dateColumn: "pay.paid_at",
    sql: `SELECT pay.id, pay.invoice_id, i.invoice_number, pay.subscriber_id, sub.name AS subscriber_name, sub.username,
                 pay.amount, pay.method, pay.reference, pay.received_by, a.name AS received_by_name, pay.paid_at
          FROM payments pay
          LEFT JOIN invoices i ON i.id = pay.invoice_id
          LEFT JOIN subscribers sub ON sub.id = pay.subscriber_id
          LEFT JOIN admins a ON a.id = pay.received_by`,
    order: "pay.id",
    columns: [
      { key: "id", header: "id" },
      { key: "invoice_id", header: "invoice_id" },
      { key: "invoice_number", header: "invoice_number" },
      { key: "subscriber_id", header: "subscriber_id" },
      { key: "subscriber_name", header: "subscriber_name" },
      { key: "username", header: "username" },
      { key: "amount", header: "amount", kind: "money" },
      { key: "method", header: "method" },
      { key: "reference", header: "reference" },
      { key: "received_by", header: "received_by" },
      { key: "received_by_name", header: "received_by_name" },
      { key: "paid_at", header: "paid_at" },
    ],
  },
  usage: {
    dateColumn: "u.usage_date",
    sql: `SELECT u.usage_date, u.subscriber_id, sub.name AS subscriber_name, sub.username,
                 u.bytes_in, u.bytes_out, (u.bytes_in + u.bytes_out) AS total_bytes
          FROM usage_daily u
          LEFT JOIN subscribers sub ON sub.id = u.subscriber_id`,
    order: "u.usage_date, u.subscriber_id",
    columns: [
      { key: "usage_date", header: "usage_date", kind: "date" },
      { key: "subscriber_id", header: "subscriber_id" },
      { key: "subscriber_name", header: "subscriber_name" },
      { key: "username", header: "username" },
      { key: "bytes_in", header: "bytes_in" },
      { key: "bytes_out", header: "bytes_out" },
      { key: "total_bytes", header: "total_bytes" },
    ],
  },
};

const exportRows = async (type, query) => {
  const definition = Object.prototype.hasOwnProperty.call(EXPORTS, type) ? EXPORTS[type] : null;
  if (!definition) {
    throw badRequest(`Export type must be one of: ${Object.keys(EXPORTS).join(", ")}`);
  }

  const from = parseBound(query.from, "from", false);
  const to = parseBound(query.to, "to", true);
  const conditions = [];
  const params = [];

  if (from) {
    conditions.push(`${definition.dateColumn} ${from.op} ?`);
    params.push(from.date);
  }
  if (to) {
    conditions.push(`${definition.dateColumn} ${to.op} ?`);
    params.push(to.date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `${definition.sql} ${where} ORDER BY ${definition.order} LIMIT ${EXPORT_LIMIT}`,
    params
  );

  return { columns: definition.columns, rows };
};

module.exports = { dashboard, revenue, expiring, topUsage, exportRows };
