const { startJob, bumpCache } = require("@isp/shared");
const { expireBatch } = require("./service");

const startJobs = (logger) =>
  startJob({
    name: "subscription-expiry",
    intervalMs: 60000,
    logger,
    run: async () => {
      let total = 0;
      let count;
      do {
        count = await expireBatch();
        total += count;
      } while (count === 100);

      if (total) {
        await bumpCache("subscriptions", "subscribers");
        logger.info("Expired subscriptions", { count: total });
      }
      return total;
    },
  });

module.exports = { startJobs };
