const { createService, config } = require("@isp/shared");
const routes = require("./routes");
const { onStart } = require("./socket");

createService({
  name: "realtime-service",
  port: config.ports.realtime,
  internal: false,
  outbox: false,
  routes,
  onStart,
}).start();
