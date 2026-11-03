const config = require("./config");
const { pool, withTransaction } = require("./db");
const { redis, connectRedis, duplicateRedis, closeRedis } = require("./redis");
const { createLogger } = require("./logger");
const errors = require("./errors");
const { ROLES, requireInternal, requireRole, safeEqual } = require("./auth");
const validate = require("./validate");
const { cache, invalidate, bumpCache } = require("./cache");
const { withLock, startJob } = require("./locks");
const { LIVE_CHANNEL, publishLive } = require("./live");
const events = require("./events");
const { createService } = require("./service");

module.exports = {
  config,
  pool,
  withTransaction,
  redis,
  connectRedis,
  duplicateRedis,
  closeRedis,
  createLogger,
  errors,
  ...errors,
  ROLES,
  requireInternal,
  requireRole,
  safeEqual,
  validate,
  cache,
  invalidate,
  bumpCache,
  withLock,
  startJob,
  LIVE_CHANNEL,
  publishLive,
  events,
  addEvent: events.addEvent,
  startConsumer: events.startConsumer,
  STREAM: events.STREAM,
  createService,
};
