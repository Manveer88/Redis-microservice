const { startConsumer, bumpCache } = require("@isp/shared");
const { attachInvoice, activateSubscription } = require("./service");

const positiveId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const startConsumers = (logger) =>
  startConsumer({
    group: "subscription-service",
    logger,
    handlers: {
      "invoice.created": async (event) => {
        const subscriptionId = positiveId(event.payload.subscription_id);
        const invoiceId = positiveId(event.payload.invoice_id);
        if (!subscriptionId || !invoiceId) {
          logger.warn("invoice.created without valid ids ignored", { eventId: event.id });
          return;
        }
        if (await attachInvoice(subscriptionId, invoiceId)) {
          await bumpCache("subscriptions");
        } else {
          logger.warn("invoice.created for unknown subscription", { subscriptionId, invoiceId });
        }
      },
      "invoice.paid": async (event) => {
        const subscriptionId = positiveId(event.payload.subscription_id);
        const invoiceId = positiveId(event.payload.invoice_id);
        if (!subscriptionId) {
          logger.warn("invoice.paid without valid subscription_id ignored", { eventId: event.id });
          return;
        }
        await activateSubscription(subscriptionId, invoiceId, logger);
        await bumpCache("subscriptions");
      },
      "plan.*": () => bumpCache("subscriptions"),
      "subscriber.*": () => bumpCache("subscriptions"),
    },
  });

module.exports = { startConsumers };
