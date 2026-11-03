const { pool, withTransaction, addEvent, notFound, conflict, validate } = require("@isp/shared");

const STATUSES = ["active", "inactive"];
const MAX_MONEY = 99999999.99;

const parsePlan = (body) => {
  const name = validate.requireString(body.name, "Name", { max: 100 });
  const downloadSpeed = validate.requireNumber(body.download_speed, "Download speed", {
    min: 1,
    max: 1000000,
    integer: true,
  });
  const uploadSpeed = validate.requireNumber(body.upload_speed, "Upload speed", {
    min: 1,
    max: 1000000,
    integer: true,
  });
  const rawLimit = body.data_limit_gb;
  const dataLimit =
    rawLimit === undefined || rawLimit === null || rawLimit === ""
      ? null
      : validate.toMoney(validate.requireNumber(rawLimit, "Data limit", { min: 0, max: MAX_MONEY }));
  const validityDays = validate.requireNumber(body.validity_days, "Validity days", {
    min: 1,
    max: 3650,
    integer: true,
  });
  const price = validate.toMoney(validate.requireNumber(body.price, "Price", { min: 0, max: MAX_MONEY }));

  return {
    name,
    download_speed: downloadSpeed,
    upload_speed: uploadSpeed,
    data_limit_gb: dataLimit ? dataLimit : null,
    validity_days: validityDays,
    price,
  };
};

const findPlan = async (db, id, lock = false) => {
  const [rows] = await db.query(`SELECT * FROM plans WHERE id = ?${lock ? " FOR UPDATE" : ""}`, [id]);
  return rows[0] || null;
};

const ensureUniqueName = async (conn, name, excludeId = null) => {
  const [rows] = await conn.query(
    "SELECT id FROM plans WHERE name = ? AND id <> ? LIMIT 1",
    [name, excludeId || 0]
  );
  if (rows.length) {
    throw conflict("A plan with this name already exists", "DUPLICATE_NAME");
  }
};

const listPlans = async (query) => {
  const status = validate.optionalEnum(query.status, "Status", STATUSES);
  const pagination = validate.parsePagination(query);
  const where = [];
  const params = [];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM plans ${clause}`, params);
  const [rows] = await pool.query(
    `SELECT * FROM plans ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );

  return { rows, meta: validate.pageMeta(pagination, total) };
};

const getPlan = async (id) => {
  const [rows] = await pool.query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM subscribers s WHERE s.plan_id = p.id) AS subscriber_count,
       (SELECT COUNT(*) FROM subscriptions su WHERE su.plan_id = p.id) AS subscription_count
     FROM plans p
     WHERE p.id = ?`,
    [id]
  );
  if (!rows.length) {
    throw notFound("Plan not found", "PLAN_NOT_FOUND");
  }
  return rows[0];
};

const createPlan = async (body) => {
  const data = parsePlan(body);

  return withTransaction(async (conn) => {
    await ensureUniqueName(conn, data.name);

    const [result] = await conn.query(
      `INSERT INTO plans (name, download_speed, upload_speed, data_limit_gb, validity_days, price, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [data.name, data.download_speed, data.upload_speed, data.data_limit_gb, data.validity_days, data.price]
    );

    await addEvent(conn, "plan.created", { plan_id: result.insertId, name: data.name });
    return findPlan(conn, result.insertId);
  });
};

const updatePlan = async (id, body) => {
  const data = parsePlan(body);

  return withTransaction(async (conn) => {
    const existing = await findPlan(conn, id, true);
    if (!existing) {
      throw notFound("Plan not found", "PLAN_NOT_FOUND");
    }

    await ensureUniqueName(conn, data.name, id);

    await conn.query(
      `UPDATE plans
       SET name = ?, download_speed = ?, upload_speed = ?, data_limit_gb = ?, validity_days = ?, price = ?
       WHERE id = ?`,
      [data.name, data.download_speed, data.upload_speed, data.data_limit_gb, data.validity_days, data.price, id]
    );

    await addEvent(conn, "plan.updated", { plan_id: id, name: data.name });
    return findPlan(conn, id);
  });
};

const updatePlanStatus = async (id, rawStatus) => {
  const status = validate.requireEnum(rawStatus, "Status", STATUSES);

  return withTransaction(async (conn) => {
    const existing = await findPlan(conn, id, true);
    if (!existing) {
      throw notFound("Plan not found", "PLAN_NOT_FOUND");
    }

    if (existing.status === status) {
      return existing;
    }

    await conn.query("UPDATE plans SET status = ? WHERE id = ?", [status, id]);
    await addEvent(conn, "plan.status_changed", { plan_id: id, name: existing.name, status });
    return findPlan(conn, id);
  });
};

const deletePlan = async (id) =>
  withTransaction(async (conn) => {
    const existing = await findPlan(conn, id, true);
    if (!existing) {
      throw notFound("Plan not found", "PLAN_NOT_FOUND");
    }

    const [[usage]] = await conn.query(
      `SELECT
         EXISTS(SELECT 1 FROM subscribers WHERE plan_id = ?) AS has_subscribers,
         EXISTS(SELECT 1 FROM subscriptions WHERE plan_id = ?) AS has_subscriptions`,
      [id, id]
    );

    if (usage.has_subscribers || usage.has_subscriptions) {
      throw conflict("Plan is used by subscribers or subscriptions. Deactivate it instead.", "IN_USE");
    }

    await conn.query("DELETE FROM plans WHERE id = ?", [id]);
    await addEvent(conn, "plan.deleted", { plan_id: id, name: existing.name });
  });

module.exports = {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  updatePlanStatus,
  deletePlan,
};
