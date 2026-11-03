const { redis } = require("./redis");

const LIVE_CHANNEL = "isp:live";

const publishLive = async (type, data) => {
  try {
    await redis.publish(LIVE_CHANNEL, JSON.stringify({ type, data, at: new Date().toISOString() }));
  } catch {
    return;
  }
};

module.exports = { LIVE_CHANNEL, publishLive };
