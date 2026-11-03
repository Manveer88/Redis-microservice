const { createService, config } = require("@isp/shared");
const routes = require("./routes");
const { startConsumers } = require("./consumers");
const { startJobs } = require("./jobs");

createService({
  name: "subscription-service",
  port: config.ports.subscription,
  routes,
  onStart: async ({ logger }) => [await startConsumers(logger), startJobs(logger)],
}).start();
