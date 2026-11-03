const { createService, config } = require("@isp/shared");
const routes = require("./routes");
const { startConsumers } = require("./consumers");

createService({
  name: "subscriber-service",
  port: config.ports.subscriber,
  routes,
  onStart: async ({ logger }) => [await startConsumers(logger)],
}).start();
