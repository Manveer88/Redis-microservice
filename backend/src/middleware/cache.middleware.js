const redisClient = require("../config/redis");

const cache = (duration = 60) => {
  return async (req, res, next) => {
    try {
      const cacheKey = `cache:${req.originalUrl}`;

      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        console.log("Redis Cache HIT:", cacheKey);

        return res.json(JSON.parse(cachedData));
      }

      console.log("Redis Cache MISS:", cacheKey);

      const originalJson = res.json.bind(res);

      res.json = (data) => {
        redisClient
          .setEx(cacheKey, duration, JSON.stringify(data))
          .catch((error) => console.error("Cache write error:", error));

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error("Cache read error:", error);
      next();
    }
  };
};

const clearCache = async (pattern = "cache:*") => {
  try {
    let cursor = "0";

    do {
      const result = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });

      cursor = result.cursor;

      if (result.keys.length > 0) {
        await redisClient.del(result.keys);
      }
    } while (cursor !== "0");

    console.log("Redis cache cleared:", pattern);
  } catch (error) {
    console.error("Cache invalidation error:", error);
  }
};

const invalidateCache = (...patterns) => {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        for (const pattern of patterns) {
          await clearCache(pattern);
        }
      }

      return originalJson(data);
    };

    next();
  };
};

module.exports = { cache, clearCache, invalidateCache };
