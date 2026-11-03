const {
  pool,
  withTransaction,
  addEvent,
  badRequest,
  notFound,
  conflict,
  validate,
} = require("@isp/shared");

const STATUSES = ["active", "inactive", "suspended"];
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,64}$/;
const MOBILE_PATTERN = /^[0-9+\- ]{7,20}$/;

const SELECT_SUBSCRIBER = `
  SELECT s.id, s.name, s.email, s.mobile, s.username, s.plan_id, s.status, s.expires_at,
    s.created_at, s.updated_at,
    p.name AS plan_name, p.download_speed, p.upload_speed, p.price
  FROM subscribers s
  LEFT JOIN plans p ON p.id = s.plan_id`;

const CURRENT_SUBSCRIPTION = `
  SELECT su.*, p.name AS plan_name
  FROM subscriptions su
  JOIN plans p ON p.id = su.plan_id
  WHERE su.subscriber_id = ? AND su.status = 'active' AND su.start_date <= NOW() AND su.end_date > NOW()
  ORDER BY su.end_date DESC
  LIMIT 1`;

const parseUsername = (value) => {
  const username = validate.requireString(value, "Username", { max: 64 });
  if (!USERNAME_PATTERN.test(username)) {
    throw badRequest("Username must be 3-64 characters: letters, digits, dot, underscore or dash");
  }
  return username;
};

const parseMobile = (value) => {
  const mobile = validate.optionalString(value, "Mobile", { max: 20 });
  if (mobile && !MOBILE_PATTERN.test(mobile)) {
    throw badRequest("Mobile must be 7-20 characters: digits, +, space or dash");
  }
  return mobile;
};

const parseDetails = (body) => ({
  name: validate.requireString(body.name, "Name", { max: 150 }),
  email: validate.optionalEmail(body.email),
  mobile: parseMobile(body.mobile),
});

const ensureActivePlan = async (conn, planId) => {
  const [rows] = await conn.query("SELECT id, status FROM plans WHERE id = ?", [planId]);
  if (!rows.length || rows[0].status !== "active") {
    throw badRequest("Plan does not exist or is not active", "INVALID_PLAN");
  }
};

const ensureUnique = async (conn, { username, email }, excludeId = 0) => {
  if (username) {
    const [rows] = await conn.query("SELECT id FROM subscribers WHERE username = ? AND id <> ? LIMIT 1", [
      username,
      excludeId,
    ]);
    if (rows.length) throw conflict("Username is already taken", "DUPLICATE_USERNAME");
  }
  if (email) {
    const [rows] = await conn.query("SELECT id FROM subscribers WHERE email = ? AND id <> ? LIMIT 1", [
      email,
      excludeId,
    ]);
    if (rows.length) throw conflict("Email is already in use", "DUPLICATE_EMAIL");
  }
};

const lockSubscriber = async (conn, id) => {
  const [rows] = await conn.query(
    "SELECT id, name, username, email, plan_id, status, expires_at FROM subscribers WHERE id = ? FOR UPDATE",
    [id]
  );
  if (!rows.length) {
    throw notFound("Subscriber not found", "SUBSCRIBER_NOT_FOUND");
  }
  return rows[0];
};

const fetchSubscriber = async (db, id) => {
  const [rows] = await db.query(`${SELECT_SUBSCRIBER} WHERE s.id = ?`, [id]);
  return rows[0] || null;
};

const listSubscribers = async (query) => {
  const status = validate.optionalEnum(query.status, "Status", STATUSES);
  const planId = validate.optionalId(query.plan_id, "plan ID");
  const search = validate.optionalString(query.search, "Search", { max: 100 });
  const pagination = validate.parsePagination(query);
  const where = [];
  const params = [];

  if (status) {
    where.push("s.status = ?");
    params.push(status);
  }
  if (planId) {
    where.push("s.plan_id = ?");
    params.push(planId);
  }
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(s.name LIKE ? OR s.username LIKE ? OR s.email LIKE ? OR s.mobile LIKE ?)");
    params.push(like, like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM subscribers s ${clause}`, params);
  const [rows] = await pool.query(`${SELECT_SUBSCRIBER} ${clause} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [
    ...params,
    pagination.limit,
    pagination.offset,
  ]);

  return { rows, meta: validate.pageMeta(pagination, total) };
};

const getSubscriber = async (id) => {
  const subscriber = await fetchSubscriber(pool, id);
  if (!subscriber) {
    throw notFound("Subscriber not found", "SUBSCRIBER_NOT_FOUND");
  }
  const [current] = await pool.query(CURRENT_SUBSCRIPTION, [id]);
  return { ...subscriber, current_subscription: current[0] || null };
};

const createSubscriber = async (body) => {
  const details = parseDetails(body);
  const username = parseUsername(body.username);
  const planId = validate.optionalId(body.plan_id, "plan ID");

  return withTransaction(async (conn) => {
    if (planId) await ensureActivePlan(conn, planId);
    await ensureUnique(conn, { username, email: details.email });

    const [result] = await conn.query(
      `INSERT INTO subscribers (name, email, mobile, username, plan_id, status)
       VALUES (?, ?, ?, ?, ?, 'inactive')`,
      [details.name, details.email, details.mobile, username, planId]
    );

    await addEvent(conn, "subscriber.created", {
      subscriber_id: result.insertId,
      name: details.name,
      username,
    });

    return fetchSubscriber(conn, result.insertId);
  });
};

const updateSubscriber = async (id, body) => {
  if (body.username !== undefined) {
    throw badRequest("Username cannot be changed", "USERNAME_IMMUTABLE");
  }
  const details = parseDetails(body);
  const planGiven = body.plan_id !== undefined;
  const planId = planGiven ? validate.optionalId(body.plan_id, "plan ID") : null;

  return withTransaction(async (conn) => {
    const existing = await lockSubscriber(conn, id);
    const nextPlanId = planGiven ? planId : existing.plan_id;

    if (nextPlanId && nextPlanId !== existing.plan_id) {
      await ensureActivePlan(conn, nextPlanId);
    }
    await ensureUnique(conn, { email: details.email }, id);

    await conn.query("UPDATE subscribers SET name = ?, email = ?, mobile = ?, plan_id = ? WHERE id = ?", [
      details.name,
      details.email,
      details.mobile,
      nextPlanId,
      id,
    ]);

    await addEvent(conn, "subscriber.updated", {
      subscriber_id: id,
      name: details.name,
      username: existing.username,
    });

    return fetchSubscriber(conn, id);
  });
};

const updateSubscriberStatus = async (id, rawStatus) => {
  const status = validate.requireEnum(rawStatus, "Status", STATUSES);

  return withTransaction(async (conn) => {
    const existing = await lockSubscriber(conn, id);

    if (status === "active") {
      const [current] = await conn.query(CURRENT_SUBSCRIPTION, [id]);
      if (!current.length) {
        throw conflict("Subscriber has no current active subscription", "NO_ACTIVE_SUBSCRIPTION");
      }
    }

    if (existing.status !== status) {
      await conn.query("UPDATE subscribers SET status = ? WHERE id = ?", [status, id]);
      await addEvent(conn, "subscriber.status_changed", {
        subscriber_id: id,
        name: existing.name,
        username: existing.username,
        status,
        previous_status: existing.status,
      });
    }

    return fetchSubscriber(conn, id);
  });
};

const deleteSubscriber = async (id) =>
  withTransaction(async (conn) => {
    const existing = await lockSubscriber(conn, id);

    const [[usage]] = await conn.query(
      `SELECT
         EXISTS(SELECT 1 FROM subscriptions WHERE subscriber_id = ?) AS has_subscriptions,
         EXISTS(SELECT 1 FROM invoices WHERE subscriber_id = ?) AS has_invoices,
         EXISTS(SELECT 1 FROM usage_records WHERE subscriber_id = ?) AS has_usage`,
      [id, id, id]
    );

    if (usage.has_subscriptions || usage.has_invoices || usage.has_usage) {
      throw conflict("Subscriber has subscriptions, invoices or usage records and cannot be deleted", "IN_USE");
    }

    await conn.query("DELETE FROM subscribers WHERE id = ?", [id]);
    await addEvent(conn, "subscriber.deleted", {
      subscriber_id: id,
      name: existing.name,
      username: existing.username,
    });
  });

const sameTime = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

const recomputeSubscriber = async (subscriberId, logger) =>
  withTransaction(async (conn) => {
    const [rows] = await conn.query(
      "SELECT id, name, username, plan_id, status, expires_at FROM subscribers WHERE id = ? FOR UPDATE",
      [subscriberId]
    );
    if (!rows.length) {
      logger.warn("Recompute skipped: subscriber not found", { subscriberId });
      return false;
    }
    const subscriber = rows[0];

    const [[agg]] = await conn.query(
      `SELECT MAX(end_date) AS max_end, COALESCE(SUM(end_date > NOW()), 0) AS live_count, COUNT(*) AS active_count
       FROM subscriptions
       WHERE subscriber_id = ? AND status = 'active'`,
      [subscriberId]
    );

    let expiresAt = subscriber.expires_at;
    let planId = subscriber.plan_id;

    if (Number(agg.active_count) > 0) {
      expiresAt = agg.max_end;
      const [[pick]] = await conn.query(
        `SELECT plan_id FROM subscriptions
         WHERE subscriber_id = ? AND status = 'active'
         ORDER BY (start_date <= NOW() AND end_date > NOW()) DESC, end_date DESC, id DESC
         LIMIT 1`,
        [subscriberId]
      );
      planId = pick.plan_id;
    } else if (expiresAt && new Date(expiresAt) > new Date()) {
      expiresAt = new Date();
    }

    const status =
      subscriber.status === "suspended" ? "suspended" : Number(agg.live_count) > 0 ? "active" : "inactive";

    const changed =
      status !== subscriber.status || planId !== subscriber.plan_id || !sameTime(expiresAt, subscriber.expires_at);

    if (!changed) return false;

    await conn.query("UPDATE subscribers SET status = ?, plan_id = ?, expires_at = ? WHERE id = ?", [
      status,
      planId,
      expiresAt,
      subscriberId,
    ]);

    if (status !== subscriber.status) {
      await addEvent(conn, "subscriber.status_changed", {
        subscriber_id: subscriber.id,
        name: subscriber.name,
        username: subscriber.username,
        status,
        previous_status: subscriber.status,
      });
    }

    return true;
  });

module.exports = {
  listSubscribers,
  getSubscriber,
  createSubscriber,
  updateSubscriber,
  updateSubscriberStatus,
  deleteSubscriber,
  recomputeSubscriber,
};
