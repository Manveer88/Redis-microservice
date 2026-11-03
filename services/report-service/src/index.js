const { createService, config } = require("@isp/shared");
const routes = require("./routes");
const { startConsumers } = require("./consumers");

createService({
  name: "report-service",
  port: config.ports.report,
  routes,
  onStart: async ({ logger }) => startConsumers(logger),
}).start();
