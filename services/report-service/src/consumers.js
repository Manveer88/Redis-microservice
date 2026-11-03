const { startConsumer, bumpCache } = require("@isp/shared");

const startConsumers = (logger) =>
  startConsumer({
    group: "report-service",
    handlers: { "*": () => bumpCache("reports") },
    logger,
    dedupe: false,
  });

module.exports = { startConsumers };
