const { createService, config } = require("@isp/shared");
const routes = require("./routes");
const { startConsumers } = require("./consumers");

createService({
  name: "billing-service",
  port: config.ports.billing,
  routes,
  onStart: ({ logger }) => startConsumers(logger),
}).start();
