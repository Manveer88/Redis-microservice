const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { redis } = require("@isp/shared");

const limiterBody = (message) => ({ success: false, message, code: "RATE_LIMITED" });

const createLimiter = ({ prefix, windowMs, limit, message, skip }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    passOnStoreError: true,
    skip,
    message: limiterBody(message),
    store: new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (...args) => redis.sendCommand(args),
    }),
  });

const isIngest = (req) => req.path === "/api/usage/ingest";

const createLimiters = () => ({
  global: createLimiter({
    prefix: "global",
    windowMs: 60 * 1000,
    limit: 300,
    message: "Too many requests, please slow down",
    skip: (req) => req.method === "OPTIONS" || isIngest(req),
  }),
  login: createLimiter({
    prefix: "login",
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: "Too many login attempts, please try again later",
    skip: (req) => !(req.method === "POST" && req.path === "/api/auth/login"),
  }),
  ingest: createLimiter({
    prefix: "ingest",
    windowMs: 60 * 1000,
    limit: 600,
    message: "Too many ingest requests, please slow down",
    skip: (req) => !isIngest(req),
  }),
});

module.exports = { createLimiters };
