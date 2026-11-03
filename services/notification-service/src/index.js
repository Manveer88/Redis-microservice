const { createService, config } = require("@isp/shared");
const routes = require("./routes");
const { startConsumers } = require("./consumers");
const { startJobs } = require("./jobs");

createService({
  name: "notification-service",
  port: config.ports.notification,
  routes,
  onStart: async ({ logger }) => {
    const stopConsumers = await startConsumers(logger);
    const stopJobs = startJobs(logger);
    return [stopConsumers, stopJobs];
  },
}).start();
