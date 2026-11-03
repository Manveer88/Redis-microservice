const { createService, config } = require("@isp/shared");
const routes = require("./routes");

createService({
  name: "usage-service",
  port: config.ports.usage,
  routes,
}).start();
