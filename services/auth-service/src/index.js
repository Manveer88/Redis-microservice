const { createService, config } = require("@isp/shared");
const routes = require("./routes");

createService({
  name: "auth-service",
  port: config.ports.auth,
  routes,
}).start();
