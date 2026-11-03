const crypto = require("crypto");
const os = require("os");
const { pool } = require("./db");
const { redis, duplicateRedis } = require("./redis");

const STREAM = "isp:events";
const DEAD_LETTER_STREAM = "isp:events:dlq";
const MAX_ATTEMPTS = 5;
const STREAM_MAX_LENGTH = 100000;

let serviceName = "unknown";

const setServiceName = (name) => {
  serviceName = name;
};

const toJson = (value) => JSON.stringify(value === undefined ? {} : value);

const addEvent = async (connection, type, payload) => {
  const eventId = crypto.randomUUID();

  await connection.execute(
    `INSERT INTO outbox_events (event_id, source_service, type, payload)
     VALUES (?, ?, ?, ?)`,
    [eventId, serviceName, type, toJson(payload)]
  );

  return eventId;
};

const publishBatch = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, event_id, type, payload, created_at
       FROM outbox_events
       WHERE source_service = ? AND published_at IS NULL
       ORDER BY id
       LIMIT 100
       FOR UPDATE SKIP LOCKED`,
      [serviceName]
    );

    for (const row of rows) {
      const payload = typeof row.payload === "string" ? row.payload : toJson(row.payload);

      await redis.xAdd(
        STREAM,
        "*",
        {
          id: row.event_id,
          type: row.type,
          source: serviceName,
          payload,
          occurredAt: new Date(row.created_at).toISOString(),
        },
        { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: STREAM_MAX_LENGTH } }
      );
    }

    if (rows.length) {
      await connection.query(
        "UPDATE outbox_events SET published_at = NOW(3) WHERE id IN (?)",
        [rows.map((row) => row.id)]
      );
    }

    await connection.commit();
    return rows.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const startOutboxRelay = ({ logger, intervalMs = 250 } = {}) => {
  let stopped = false;
  let timer = null;

  const loop = async () => {
    if (stopped) return;
    let published = 0;

    try {
      published = await publishBatch();
    } catch (error) {
      if (logger) logger.error("Outbox relay failed", { error });
    }

    if (!stopped) {
      timer = setTimeout(loop, published === 100 ? 0 : intervalMs);
    }
  };

  timer = setTimeout(loop, intervalMs);

  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
};

const parseMessage = (message) => {
  const fields = message.message;
  let payload = {};

  try {
    payload = JSON.parse(fields.payload || "{}");
  } catch {
    payload = {};
  }

  return {
    streamId: message.id,
    id: fields.id,
    type: fields.type,
    source: fields.source,
    payload,
    occurredAt: fields.occurredAt,
  };
};

const findHandler = (handlers, type) => {
  if (handlers[type]) return handlers[type];
  const prefix = type.split(".")[0];
  if (handlers[`${prefix}.*`]) return handlers[`${prefix}.*`];
  return handlers["*"] || null;
};

const startConsumer = async ({
  group,
  handlers,
  logger,
  startId = "0",
  dedupe = true,
  blockMs = 5000,
}) => {
  const client = await duplicateRedis(logger, `consumer:${group}`);
  const consumer = `${group}-${os.hostname()}-${process.pid}`;
  const attemptsKey = `isp:events:attempts:${group}`;
  let stopped = false;

  try {
    await client.xGroupCreate(STREAM, group, startId, { MKSTREAM: true });
  } catch (error) {
    if (!String(error.message).includes("BUSYGROUP")) throw error;
  }

  const ack = (streamId) => redis.xAck(STREAM, group, streamId);

  const handle = async (message) => {
    if (!message || !message.message) {
      return;
    }

    const event = parseMessage(message);
    const handler = event.type ? findHandler(handlers, event.type) : null;

    if (!handler) {
      await ack(event.streamId);
      return;
    }

    try {
      if (dedupe && event.id) {
        const [rows] = await pool.execute(
          "SELECT 1 FROM processed_events WHERE consumer_group = ? AND event_id = ?",
          [group, event.id]
        );
        if (rows.length) {
          await ack(event.streamId);
          return;
        }
      }

      await handler(event);

      if (dedupe && event.id) {
        await pool.execute(
          "INSERT IGNORE INTO processed_events (consumer_group, event_id) VALUES (?, ?)",
          [group, event.id]
        );
      }

      await ack(event.streamId);
      await redis.hDel(attemptsKey, event.streamId);
    } catch (error) {
      const attempts = await redis.hIncrBy(attemptsKey, event.streamId, 1);
      logger.error("Event handler failed", {
        error,
        group,
        type: event.type,
        eventId: event.id,
        attempts,
      });

      if (attempts >= MAX_ATTEMPTS) {
        await redis.xAdd(DEAD_LETTER_STREAM, "*", {
          group,
          streamId: event.streamId,
          id: event.id || "",
          type: event.type || "",
          payload: JSON.stringify(event.payload),
          error: String(error.message).slice(0, 500),
        });
        await ack(event.streamId);
        await redis.hDel(attemptsKey, event.streamId);
      }
    }
  };

  const readLoop = async () => {
    while (!stopped) {
      try {
        const response = await client.xReadGroup(
          group,
          consumer,
          { key: STREAM, id: ">" },
          { COUNT: 20, BLOCK: blockMs }
        );

        if (!response) continue;

        for (const stream of response) {
          for (const message of stream.messages) {
            await handle(message);
          }
        }
      } catch (error) {
        if (stopped) break;
        logger.error("Event read failed", { error, group });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  const reclaim = async () => {
    try {
      const result = await redis.xAutoClaim(STREAM, group, consumer, 30000, "0-0", { COUNT: 20 });
      for (const message of result.messages) {
        await handle(message);
      }
      for (const deletedId of result.deletedMessages || []) {
        await ack(deletedId);
      }
    } catch (error) {
      if (!stopped) logger.error("Event reclaim failed", { error, group });
    }
  };

  readLoop();
  const reclaimTimer = setInterval(reclaim, 15000);

  return async () => {
    stopped = true;
    clearInterval(reclaimTimer);
    if (client.isOpen) client.destroy();
  };
};

module.exports = {
  STREAM,
  DEAD_LETTER_STREAM,
  setServiceName,
  addEvent,
  startOutboxRelay,
  startConsumer,
};
