const { startConsumer, bumpCache } = require("@isp/shared");
const { recomputeSubscriber } = require("./service");

const startConsumers = (logger) => {
  const recompute = async (event) => {
    const subscriberId = Number(event.payload.subscriber_id);
    if (!Number.isSafeInteger(subscriberId) || subscriberId <= 0) {
      logger.warn("Event without valid subscriber_id ignored", { type: event.type, eventId: event.id });
      return;
    }
    const changed = await recomputeSubscriber(subscriberId, logger);
    if (changed) {
      await bumpCache("subscribers", "subscriptions");
    }
  };

  return startConsumer({
    group: "subscriber-service",
    logger,
    handlers: {
      "subscription.activated": recompute,
      "subscription.cancelled": recompute,
      "subscription.expired": recompute,
      "plan.*": () => bumpCache("subscribers"),
    },
  });
};

module.exports = { startConsumers };
