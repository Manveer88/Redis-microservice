const { config } = require("@isp/shared");

const createTransports = (logger) => {
  const mode = config.env("NOTIFY_TRANSPORT", "log");

  const deliver = async (channel, message) => {
    if (mode !== "log") {
      logger.warn("Unsupported notification transport, falling back to log", { transport: mode, channel });
    }
    logger.info(`Outgoing ${channel}`, { channel, ...message });
  };

  const sendEmail = async ({ to, subject, body }) => deliver("email", { to, subject, body });

  const sendSms = async ({ to, body }) => deliver("sms", { to, body });

  return { sendEmail, sendSms };
};

module.exports = { createTransports };
