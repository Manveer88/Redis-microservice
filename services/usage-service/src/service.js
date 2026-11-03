const {
  pool,
  withTransaction,
  addEvent,
  bumpCache,
  publishLive,
  validate,
  badRequest,
  notFound,
  AppError,
} = require("@isp/shared");

const MAX_RECORDS = 1000;
const MAX_CSV_RECORDS = 10000;
const MAX_CSV_LENGTH = 2 * 1024 * 1024;
const MAX_BYTES = 1e15;
const FUTURE_LIMIT_MS = 5 * 60 * 1000;
const MIN_RECORDED_AT = new Date("2000-01-01T00:00:00Z").getTime();
const GB = 1024 * 1024 * 1024;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CSV_COLUMNS = ["username", "bytes_in", "bytes_out", "recorded_at", "session_id", "record_key"];

const pad = (value) => String(value).padStart(2, "0");

const localDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const localDateTime = (date) =>
  `${localDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const addDays = (dateString, days) => {
  const [year, month, day] = dateString.split("-").map(Number);
  return localDate(new Date(year, month - 1, day + days));
};

const tooLarge = (message) => new AppError(413, message, "PAYLOAD_TOO_LARGE");

const parseIngestBody = (body) => {
  const records = body && body.records;
  if (!Array.isArray(records)) {
    throw badRequest("records must be an array");
  }
  if (!records.length) {
    throw badRequest("records must not be empty");
  }
  if (records.length > MAX_RECORDS) {
    throw tooLarge(`At most ${MAX_RECORDS} records are allowed per request`);
  }
  return records.map((record, index) => ({ index, record }));
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
    } else {
      field += char;
    }
    i += 1;
  }

  if (quoted) {
    throw badRequest("CSV has an unterminated quoted field", "INVALID_CSV");
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
};

const parseCsvBody = (body) => {
  const csv = body && body.csv;
  if (typeof csv !== "string" || !csv.trim()) {
    throw badRequest("csv is required");
  }
  if (csv.length > MAX_CSV_LENGTH) {
    throw tooLarge("CSV must be at most 2MB");
  }

  const rows = parseCsv(csv.replace(/^﻿/, ""));
  const nonEmpty = [];
  rows.forEach((cells, position) => {
    if (cells.some((cell) => cell.trim() !== "")) {
      nonEmpty.push({ cells, line: position + 1 });
    }
  });

  if (!nonEmpty.length) {
    throw badRequest("csv is required");
  }

  const header = nonEmpty[0].cells.map((cell) => cell.trim().toLowerCase());
  const columns = {};
  header.forEach((name, position) => {
    if (CSV_COLUMNS.includes(name) && columns[name] === undefined) {
      columns[name] = position;
    }
  });
  for (const name of ["username", "bytes_in", "bytes_out"]) {
    if (columns[name] === undefined) {
      throw badRequest(`CSV header must include ${name}`, "INVALID_CSV");
    }
  }

  const dataRows = nonEmpty.slice(1);
  if (!dataRows.length) {
    throw badRequest("CSV has no data rows", "INVALID_CSV");
  }
  if (dataRows.length > MAX_CSV_RECORDS) {
    throw tooLarge(`At most ${MAX_CSV_RECORDS} rows are allowed per import`);
  }

  return dataRows.map(({ cells, line }, index) => {
    const record = {};
    for (const [name, position] of Object.entries(columns)) {
      const value = cells[position] === undefined ? "" : cells[position].trim();
      if (value !== "") {
        record[name] = value;
      }
    }
    return { index, line, record };
  });
};

const parseBytes = (value) => {
  let number;
  if (typeof value === "number") {
    number = value;
  } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    number = Number(value.trim());
  } else {
    return null;
  }
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_BYTES) {
    return null;
  }
  return number;
};

const validateRecord = (record, now) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { reason: "INVALID_RECORD" };
  }

  const username = typeof record.username === "string" ? record.username.trim() : "";
  if (!username || username.length > 64) {
    return { reason: "INVALID_USERNAME" };
  }

  const bytesIn = parseBytes(record.bytes_in);
  if (bytesIn === null) {
    return { reason: "INVALID_BYTES_IN" };
  }
  const bytesOut = parseBytes(record.bytes_out);
  if (bytesOut === null) {
    return { reason: "INVALID_BYTES_OUT" };
  }

  let recordedAt = now;
  if (record.recorded_at !== undefined && record.recorded_at !== null && record.recorded_at !== "") {
    if (typeof record.recorded_at !== "string") {
      return { reason: "INVALID_RECORDED_AT" };
    }
    recordedAt = new Date(record.recorded_at);
    if (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() < MIN_RECORDED_AT) {
      return { reason: "INVALID_RECORDED_AT" };
    }
    if (recordedAt.getTime() > now.getTime() + FUTURE_LIMIT_MS) {
      return { reason: "RECORDED_AT_IN_FUTURE" };
    }
  }

  const optional = (value, max) => {
    if (value === undefined || value === null || value === "") return { value: null };
    if (typeof value !== "string" || value.length > max) return { invalid: true };
    return { value: value.trim() || null };
  };

  const sessionId = optional(record.session_id, 100);
  if (sessionId.invalid) {
    return { reason: "INVALID_SESSION_ID" };
  }
  const recordKey = optional(record.record_key, 191);
  if (recordKey.invalid) {
    return { reason: "INVALID_RECORD_KEY" };
  }

  const recordedAtSql = localDateTime(recordedAt);

  return {
    value: {
      username,
      bytesIn,
      bytesOut,
      recordedAt: recordedAtSql,
      usageDate: recordedAtSql.slice(0, 10),
      sessionId: sessionId.value,
      recordKey: recordKey.value,
    },
  };
};

const getCurrentPeriod = async (db, subscriberId) => {
  const [rows] = await db.query(
    `SELECT s.id AS subscription_id, s.start_date, s.end_date, p.data_limit_gb
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.subscriber_id = ? AND s.status = 'active' AND s.start_date <= NOW() AND s.end_date > NOW()
     ORDER BY s.start_date DESC, s.id DESC
     LIMIT 1`,
    [subscriberId]
  );
  if (!rows.length) {
    return null;
  }
  const subscription = rows[0];

  const [[usage]] = await db.query(
    `SELECT COALESCE(SUM(bytes_in + bytes_out), 0) AS used_bytes
     FROM usage_records
     WHERE subscriber_id = ? AND recorded_at >= ? AND recorded_at <= NOW()`,
    [subscriberId, subscription.start_date]
  );

  const limitGb = Number(subscription.data_limit_gb) || 0;
  const limitBytes = limitGb > 0 ? Math.round(limitGb * GB) : null;
  const usedBytes = Number(usage.used_bytes);

  return {
    subscription_id: subscription.subscription_id,
    start_date: subscription.start_date,
    end_date: subscription.end_date,
    used_bytes: usedBytes,
    limit_bytes: limitBytes,
    percent: limitBytes ? Math.round((usedBytes / limitBytes) * 10000) / 100 : null,
  };
};

const checkQuota = async (subscriberId) => {
  const period = await getCurrentPeriod(pool, subscriberId);
  if (!period || !period.limit_bytes || period.used_bytes < period.limit_bytes) {
    return false;
  }

  const [existing] = await pool.query(
    "SELECT 1 FROM usage_quota_alerts WHERE subscription_id = ?",
    [period.subscription_id]
  );
  if (existing.length) {
    return false;
  }

  return withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT IGNORE INTO usage_quota_alerts (subscription_id, subscriber_id, used_bytes, limit_bytes)
       VALUES (?, ?, ?, ?)`,
      [period.subscription_id, subscriberId, period.used_bytes, period.limit_bytes]
    );
    if (result.affectedRows !== 1) {
      return false;
    }
    await addEvent(conn, "usage.quota_exceeded", {
      subscriber_id: subscriberId,
      subscription_id: period.subscription_id,
      used_bytes: period.used_bytes,
      limit_bytes: period.limit_bytes,
    });
    return true;
  });
};

const processRecords = async (entries, source, logger) => {
  const now = new Date();
  const rejected = [];
  const valid = [];

  const reject = (entry, reason) => {
    rejected.push(entry.line ? { index: entry.index, line: entry.line, reason } : { index: entry.index, reason });
  };

  for (const entry of entries) {
    const result = validateRecord(entry.record, now);
    if (result.reason) {
      reject(entry, result.reason);
    } else {
      valid.push({ entry, ...result.value });
    }
  }

  const usernames = [...new Set(valid.map((item) => item.username.toLowerCase()))];
  const subscriberIds = new Map();
  if (usernames.length) {
    const [rows] = await pool.query("SELECT id, username FROM subscribers WHERE username IN (?)", [usernames]);
    for (const row of rows) {
      subscriberIds.set(row.username.toLowerCase(), row.id);
    }
  }

  const resolved = [];
  for (const item of valid) {
    const subscriberId = subscriberIds.get(item.username.toLowerCase());
    if (!subscriberId) {
      reject(item.entry, "UNKNOWN_SUBSCRIBER");
    } else {
      resolved.push({ ...item, subscriberId });
    }
  }
  rejected.sort((a, b) => a.index - b.index);

  let accepted = 0;
  let duplicates = 0;
  const totals = new Map();

  if (resolved.length) {
    await withTransaction(async (conn) => {
      const daily = new Map();

      for (const item of resolved) {
        const [result] = await conn.execute(
          `INSERT IGNORE INTO usage_records
             (subscriber_id, session_id, record_key, bytes_in, bytes_out, recorded_at, source)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [item.subscriberId, item.sessionId, item.recordKey, item.bytesIn, item.bytesOut, item.recordedAt, source]
        );

        if (result.affectedRows !== 1) {
          duplicates += 1;
          continue;
        }
        accepted += 1;

        const dayKey = `${item.subscriberId}|${item.usageDate}`;
        const day = daily.get(dayKey) || { subscriberId: item.subscriberId, date: item.usageDate, bytesIn: 0, bytesOut: 0 };
        day.bytesIn += item.bytesIn;
        day.bytesOut += item.bytesOut;
        daily.set(dayKey, day);

        const total = totals.get(item.subscriberId) || { bytes_in: 0, bytes_out: 0 };
        total.bytes_in += item.bytesIn;
        total.bytes_out += item.bytesOut;
        totals.set(item.subscriberId, total);
      }

      if (daily.size) {
        const days = [...daily.values()];
        await conn.query(
          `INSERT INTO usage_daily (subscriber_id, usage_date, bytes_in, bytes_out)
           VALUES ?
           ON DUPLICATE KEY UPDATE bytes_in = bytes_in + VALUES(bytes_in), bytes_out = bytes_out + VALUES(bytes_out)`,
          [days.map((day) => [day.subscriberId, day.date, day.bytesIn, day.bytesOut])]
        );
      }
    });
  }

  if (totals.size) {
    for (const [subscriberId, total] of totals) {
      try {
        await checkQuota(subscriberId);
      } catch (error) {
        logger.error("Quota check failed", { error, subscriberId });
      }
      await publishLive("usage.updated", { subscriber_id: subscriberId, ...total });
    }
    try {
      await bumpCache("usage", "reports");
    } catch (error) {
      logger.error("Cache bump failed", { error });
    }
  }

  return { accepted, duplicates, rejected };
};

const parseDay = (value, label) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime()) && localDate(date) === value) {
      return value;
    }
  }
  const date = validate.optionalDate(value, label);
  return localDate(date);
};

const getSummary = async (query) => {
  const pagination = validate.parsePagination(query);
  const to = parseDay(query.to, "To date") || localDate(new Date());
  const from = parseDay(query.from, "From date") || addDays(to, -29);
  if (from > to) {
    throw badRequest("From date must be before To date");
  }

  const where = ["d.usage_date BETWEEN ? AND ?"];
  const params = [from, to];
  const search = validate.optionalString(query.search, "Search", { max: 100 });
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    where.push("(s.name LIKE ? OR s.username LIKE ?)");
    params.push(like, like);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const [rows] = await pool.query(
    `SELECT s.id AS subscriber_id, s.name, s.username, s.status,
            SUM(d.bytes_in) AS bytes_in, SUM(d.bytes_out) AS bytes_out,
            SUM(d.bytes_in + d.bytes_out) AS total_bytes
     FROM usage_daily d
     JOIN subscribers s ON s.id = d.subscriber_id
     ${whereSql}
     GROUP BY s.id, s.name, s.username, s.status
     ORDER BY total_bytes DESC, s.id
     LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT d.subscriber_id) AS total
     FROM usage_daily d
     JOIN subscribers s ON s.id = d.subscriber_id
     ${whereSql}`,
    params
  );

  return {
    rows: rows.map((row) => ({
      ...row,
      bytes_in: Number(row.bytes_in),
      bytes_out: Number(row.bytes_out),
      total_bytes: Number(row.total_bytes),
    })),
    meta: validate.pageMeta(pagination, total),
  };
};

const getSubscriberUsage = async (idParam, query) => {
  const subscriberId = validate.parseId(idParam, "subscriber ID");
  const days =
    query.days === undefined || query.days === ""
      ? 30
      : validate.requireNumber(query.days, "days", { min: 1, max: 365, integer: true });

  const [subscribers] = await pool.query("SELECT id, name, username, status FROM subscribers WHERE id = ?", [
    subscriberId,
  ]);
  if (!subscribers.length) {
    throw notFound("Subscriber not found", "SUBSCRIBER_NOT_FOUND");
  }

  const to = localDate(new Date());
  const from = addDays(to, -(days - 1));

  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(usage_date, '%Y-%m-%d') AS date, bytes_in, bytes_out
     FROM usage_daily
     WHERE subscriber_id = ? AND usage_date BETWEEN ? AND ?`,
    [subscriberId, from, to]
  );
  const byDate = new Map(rows.map((row) => [row.date, row]));

  const daily = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset);
    const row = byDate.get(date);
    daily.push({
      date,
      bytes_in: row ? Number(row.bytes_in) : 0,
      bytes_out: row ? Number(row.bytes_out) : 0,
    });
  }

  return {
    subscriber: subscribers[0],
    daily,
    period: await getCurrentPeriod(pool, subscriberId),
  };
};

module.exports = {
  parseIngestBody,
  parseCsvBody,
  processRecords,
  getSummary,
  getSubscriberUsage,
};
