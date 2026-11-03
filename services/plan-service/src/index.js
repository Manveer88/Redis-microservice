const { createService, config } = require("@isp/shared");
const routes = require("./routes");

createService({
  name: "plan-service",
  port: config.ports.plan,
  routes,
}).start();
