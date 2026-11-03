const { createTransports } = require("./transports");

const createOutbound = (logger) => {
  const transports = createTransports(logger);

  const attempt = async (channel, send) => {
    try {
      await send();
    } catch (error) {
      logger.error("Notification transport failed", { error, channel });
    }
  };

  const notifySubscriber = async (subscriber, { subject, body }) => {
    if (!subscriber) return;
    if (subscriber.email) {
      await attempt("email", () => transports.sendEmail({ to: subscriber.email, subject, body }));
    }
    if (subscriber.mobile) {
      await attempt("sms", () => transports.sendSms({ to: subscriber.mobile, body }));
    }
  };

  return { notifySubscriber };
};

module.exports = { createOutbound };
