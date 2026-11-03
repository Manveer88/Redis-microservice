const crypto = require("crypto");
const { redis } = require("./redis");

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

const withLock = async (name, ttlSeconds, work) => {
  const key = `lock:${name}`;
  const token = crypto.randomUUID();
  const acquired = await redis.set(key, token, { NX: true, EX: ttlSeconds });

  if (!acquired) {
    return { skipped: true };
  }

  try {
    return { skipped: false, result: await work() };
  } finally {
    await redis.eval(RELEASE_SCRIPT, { keys: [key], arguments: [token] }).catch(() => {});
  }
};

const startJob = ({ name, intervalMs, lockSeconds, logger, run }) => {
  let timer = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      await withLock(name, lockSeconds || Math.ceil(intervalMs / 1000), run);
    } catch (error) {
      logger.error(`Job ${name} failed`, { error });
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };

  timer = setTimeout(tick, 2000);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
};

module.exports = { withLock, startJob };
