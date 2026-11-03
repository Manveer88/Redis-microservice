const { createClient } = require("redis");
const config = require("./config");

const clients = [];

const createRedis = (logger, name = "main") => {
  const client = createClient({ url: config.redisUrl });

  client.on("error", (error) => {
    if (logger) logger.error(`Redis ${name} error`, { error });
  });

  clients.push(client);
  return client;
};

const redis = createRedis(null, "main");

const connectRedis = async (logger) => {
  if (logger) {
    redis.removeAllListeners("error");
    redis.on("error", (error) => logger.error("Redis main error", { error }));
  }
  if (!redis.isOpen) {
    await redis.connect();
  }
  return redis;
};

const duplicateRedis = async (logger, name) => {
  const client = redis.duplicate();
  client.on("error", (error) => {
    if (logger) logger.error(`Redis ${name} error`, { error });
  });
  clients.push(client);
  await client.connect();
  return client;
};

const closeRedis = async () => {
  await Promise.all(
    clients.map(async (client) => {
      if (client.isOpen) {
        try {
          await client.quit();
        } catch {
          client.destroy();
        }
      }
    })
  );
};

module.exports = { redis, connectRedis, duplicateRedis, createRedis, closeRedis };
