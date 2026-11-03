const redisClient = require("../config/redis");

const testRedis = async (req, res, next) => {
  try {
    await redisClient.set("isp:test", "Redis is working!");

    const value = await redisClient.get("isp:test");

    res.status(200).json({
      success: true,
      message: value,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { testRedis };