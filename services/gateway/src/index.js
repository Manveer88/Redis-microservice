const { createService, config } = require("@isp/shared");
const { beforeRoutes, routes, onStart } = require("./routes");

createService({
  name: "gateway",
  port: config.ports.gateway,
  json: false,
  internal: false,
  outbox: false,
  beforeRoutes,
  routes,
  onStart,
}).start();
