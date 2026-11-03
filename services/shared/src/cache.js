const { redis } = require("./redis");

const versionKey = (ns) => `cachever:${ns}`;

const getVersion = async (ns) => (await redis.get(versionKey(ns))) || "0";

const bumpCache = async (...namespaces) => {
  const list = namespaces.flat();
  if (!list.length) return;
  const multi = redis.multi();
  for (const ns of list) {
    multi.incr(versionKey(ns));
  }
  await multi.exec();
};

const cache = (ns, ttlSeconds = 60) => async (req, res, next) => {
  let key;

  try {
    key = `cache:${ns}:v${await getVersion(ns)}:${req.originalUrl}`;
    const hit = await redis.get(key);

    if (hit) {
      res.set("X-Cache", "HIT");
      return res.type("application/json").send(hit);
    }
  } catch {
    return next();
  }

  res.set("X-Cache", "MISS");
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redis.set(key, JSON.stringify(body), { EX: ttlSeconds }).catch(() => {});
    }
    return originalJson(body);
  };

  next();
};

const invalidate = (...namespaces) => (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return bumpCache(...namespaces)
        .catch(() => {})
        .then(() => originalJson(body));
    }
    return originalJson(body);
  };

  next();
};

module.exports = { cache, invalidate, bumpCache };
