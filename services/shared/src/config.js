const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../.env"),
  quiet: true,
});

const env = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
};

const required = (name) => {
  const value = env(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

const PORTS = {
  gateway: Number(env("GATEWAY_PORT", 5001)),
  auth: Number(env("AUTH_PORT", 5101)),
  subscriber: Number(env("SUBSCRIBER_PORT", 5102)),
  plan: Number(env("PLAN_PORT", 5103)),
  subscription: Number(env("SUBSCRIPTION_PORT", 5104)),
  billing: Number(env("BILLING_PORT", 5105)),
  usage: Number(env("USAGE_PORT", 5106)),
  notification: Number(env("NOTIFICATION_PORT", 5107)),
  report: Number(env("REPORT_PORT", 5108)),
  realtime: Number(env("REALTIME_PORT", 5109)),
};

const serviceUrl = (name) =>
  env(`${name.toUpperCase()}_URL`, `http://127.0.0.1:${PORTS[name]}`);

const config = {
  env,
  required,
  nodeEnv: env("NODE_ENV", "development"),
  isProduction: env("NODE_ENV", "development") === "production",
  db: {
    host: env("DB_HOST", "127.0.0.1"),
    port: Number(env("DB_PORT", 3306)),
    user: env("DB_USER", "root"),
    password: env("DB_PASSWORD", ""),
    database: env("DB_NAME", "radius_management"),
  },
  redisUrl: env("REDIS_URL", "redis://127.0.0.1:6379"),
  frontendUrl: env("FRONTEND_URL", "http://localhost:5173"),
  ports: PORTS,
  serviceUrl,
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  get internalToken() {
    return required("INTERNAL_TOKEN");
  },
};

module.exports = config;
