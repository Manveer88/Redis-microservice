const { pool, withTransaction, addEvent, notFound, conflict, validate } = require("@isp/shared");

const STATUSES = ["pending", "active", "expired", "cancelled"];
const EXPIRY_BATCH = 100;

const SELECT_SUBSCRIPTION = `
  SELECT su.*,
    sb.name AS subscriber_name, sb.username,
    p.name AS plan_name, p.download_speed, p.upload_speed
  FROM subscriptions su
  JOIN subscribers sb ON sb.id = su.subscriber_id
  JOIN plans p ON p.id = su.plan_id`;

const iso = (value) => (value ? new Date(value).toISOString() : null);

const fetchSubscription = async (db, id) => {
  const [rows] = await db.query(`${SELECT_SUBSCRIPTION} WHERE su.id = ?`, [id]);
  return rows[0] || null;
};

const listSubscriptions = async (query) => {
  const status = validate.optionalEnum(query.status, "Status", STATUSES);
  const subscriberId = validate.optionalId(query.subscriber_id, "subscriber ID");
  const planId = validate.optionalId(query.plan_id, "plan ID");
  const pagination = validate.parsePagination(query);
  const where = [];
  const params = [];

  if (status) {
    where.push("su.status = ?");
    params.push(status);
  }
  if (subscriberId) {
    where.push("su.subscriber_id = ?");
    params.push(subscriberId);
  }
  if (planId) {
    where.push("su.plan_id = ?");
    params.push(planId);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM subscriptions su ${clause}`, params);
  const [rows] = await pool.query(`${SELECT_SUBSCRIPTION} ${clause} ORDER BY su.id DESC LIMIT ? OFFSET ?`, [
    ...params,
    pagination.limit,
    pagination.offset,
  ]);

  return { rows, meta: validate.pageMeta(pagination, total) };
};

const getSubscription = async (id) => {
  const subscription = await fetchSubscription(pool, id);
  if (!subscription) {
    throw notFound("Subscription not found", "SUBSCRIPTION_NOT_FOUND");
  }
  return subscription;
};

const createSubscription = async (body) => {
  const subscriberId = validate.parseId(body.subscriber_id, "subscriber ID");
  const planId = validate.parseId(body.plan_id, "plan ID");

  return withTransaction(async (conn) => {
    const [subscribers] = await conn.query("SELECT id, status FROM subscribers WHERE id = ? FOR UPDATE", [
      subscriberId,
    ]);
    if (!subscribers.length) {
      throw notFound("Subscriber not found", "SUBSCRIBER_NOT_FOUND");
    }
    if (subscribers[0].status === "suspended") {
      throw conflict("Cannot create a subscription for a suspended subscriber", "SUBSCRIBER_SUSPENDED");
    }

    const [plans] = await conn.query("SELECT id, status, price, validity_days FROM plans WHERE id = ?", [planId]);
    if (!plans.length) {
      throw notFound("Plan not found", "PLAN_NOT_FOUND");
    }
    if (plans[0].status !== "active") {
      throw conflict("Plan is not active", "PLAN_INACTIVE");
    }
    const plan = plans[0];

    const [pending] = await conn.query(
      "SELECT id FROM subscriptions WHERE subscriber_id = ? AND status = 'pending' LIMIT 1",
      [subscriberId]
    );
    if (pending.length) {
      throw conflict("Subscriber already has a pending subscription", "PENDING_EXISTS");
    }

    const [result] = await conn.query(
      `INSERT INTO subscriptions (subscriber_id, plan_id, start_date, end_date, amount, status)
       VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?, 'pending')`,
      [subscriberId, planId, plan.validity_days, plan.price]
    );

    await addEvent(conn, "subscription.created", {
      subscription_id: result.insertId,
      subscriber_id: subscriberId,
      plan_id: planId,
      amount: validate.toMoney(plan.price),
    });

    return fetchSubscription(conn, result.insertId);
  });
};

const cancelSubscription = async (id, body) => {
  const reason = validate.optionalString(body.reason, "Reason", { max: 255 });

  return withTransaction(async (conn) => {
    const [rows] = await conn.query("SELECT id, subscriber_id, status FROM subscriptions WHERE id = ? FOR UPDATE", [
      id,
    ]);
    if (!rows.length) {
      throw notFound("Subscription not found", "SUBSCRIPTION_NOT_FOUND");
    }
    const subscription = rows[0];
    if (!["pending", "active"].includes(subscription.status)) {
      throw conflict("Only pending or active subscriptions can be cancelled", "INVALID_STATUS");
    }

    await conn.query(
      "UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = ? WHERE id = ?",
      [reason, id]
    );

    await addEvent(conn, "subscription.cancelled", {
      subscription_id: id,
      subscriber_id: subscription.subscriber_id,
      previous_status: subscription.status,
      reason,
    });

    return fetchSubscription(conn, id);
  });
};

const attachInvoice = async (subscriptionId, invoiceId) => {
  const [result] = await pool.query("UPDATE subscriptions SET invoice_id = ? WHERE id = ?", [
    invoiceId,
    subscriptionId,
  ]);
  return result.affectedRows > 0;
};

const activateSubscription = async (subscriptionId, invoiceId, logger) =>
  withTransaction(async (conn) => {
    const [rows] = await conn.query(
      "SELECT id, subscriber_id, plan_id, status, invoice_id FROM subscriptions WHERE id = ? FOR UPDATE",
      [subscriptionId]
    );
    if (!rows.length) {
      logger.warn("Activation skipped: subscription not found", { subscriptionId, invoiceId });
      return { activated: false };
    }
    const subscription = rows[0];

    const fail = async (reason) => {
      await addEvent(conn, "subscription.activation_failed", {
        subscription_id: subscription.id,
        subscriber_id: subscription.subscriber_id,
        invoice_id: invoiceId,
        reason,
      });
      logger.warn("Subscription activation failed", { subscriptionId, invoiceId, reason });
      return { activated: false, reason };
    };

    if (subscription.status !== "pending") {
      if (subscription.status === "active") {
        return { activated: false };
      }
      return fail("NOT_PENDING");
    }

    const [subscribers] = await conn.query("SELECT id, status FROM subscribers WHERE id = ? FOR UPDATE", [
      subscription.subscriber_id,
    ]);
    if (!subscribers.length) {
      return fail("SUBSCRIBER_NOT_FOUND");
    }
    if (subscribers[0].status === "suspended") {
      return fail("SUBSCRIBER_SUSPENDED");
    }

    const [plans] = await conn.query("SELECT id, status, validity_days FROM plans WHERE id = ?", [
      subscription.plan_id,
    ]);
    if (!plans.length || plans[0].status !== "active") {
      return fail("PLAN_INACTIVE");
    }

    const [[dates]] = await conn.query(
      `SELECT x.start_date, DATE_ADD(x.start_date, INTERVAL ? DAY) AS end_date
       FROM (
         SELECT GREATEST(NOW(), COALESCE(MAX(end_date), NOW())) AS start_date
         FROM subscriptions
         WHERE subscriber_id = ? AND status = 'active'
       ) x`,
      [plans[0].validity_days, subscription.subscriber_id]
    );

    await conn.query(
      `UPDATE subscriptions
       SET status = 'active', start_date = ?, end_date = ?, activated_at = NOW(), invoice_id = ?
       WHERE id = ?`,
      [dates.start_date, dates.end_date, invoiceId || subscription.invoice_id, subscription.id]
    );

    await addEvent(conn, "subscription.activated", {
      subscription_id: subscription.id,
      subscriber_id: subscription.subscriber_id,
      plan_id: subscription.plan_id,
      start_date: iso(dates.start_date),
      end_date: iso(dates.end_date),
      invoice_id: invoiceId || subscription.invoice_id,
    });

    return { activated: true };
  });

const expireBatch = async () =>
  withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, subscriber_id, plan_id, end_date
       FROM subscriptions
       WHERE status = 'active' AND end_date <= NOW()
       ORDER BY id
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [EXPIRY_BATCH]
    );
    if (!rows.length) return 0;

    await conn.query("UPDATE subscriptions SET status = 'expired' WHERE id IN (?)", [rows.map((row) => row.id)]);

    for (const row of rows) {
      await addEvent(conn, "subscription.expired", {
        subscription_id: row.id,
        subscriber_id: row.subscriber_id,
        plan_id: row.plan_id,
        end_date: iso(row.end_date),
      });
    }

    return rows.length;
  });

module.exports = {
  listSubscriptions,
  getSubscription,
  createSubscription,
  cancelSubscription,
  attachInvoice,
  activateSubscription,
  expireBatch,
};
