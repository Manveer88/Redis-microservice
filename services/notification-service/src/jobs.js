const { startJob } = require("@isp/shared");
const service = require("./service");
const { createOutbound } = require("./outbound");
const { formatDate, subscriberLabel } = require("./format");

const runExpiryReminders = async (logger, notifySubscriber) => {
  const rows = await service.findExpiringSubscriptions();
  let created = 0;

  for (const row of rows) {
    const planName = row.plan_name || `Plan #${row.plan_id}`;
    const endDate = formatDate(row.end_date);
    const id = await service.createNotification({
      type: "subscription.expiring",
      title: "Subscription expiring soon",
      message: `${subscriberLabel(row, row)}'s ${planName} subscription expires on ${endDate}.`,
      severity: "warning",
      entityType: "subscription",
      entityId: row.subscription_id,
      dedupeKey: `expiring:${row.subscription_id}`,
    });

    if (id) {
      created += 1;
      await notifySubscriber(row, {
        subject: "Your subscription is expiring soon",
        body: `Hi ${row.name || "there"}, your ${planName} subscription expires on ${endDate}. Renew now to avoid interruption.`,
      });
    }
  }

  if (created) {
    logger.info("Expiry reminders created", { created });
  }
  return created;
};

const startJobs = (logger) => {
  const { notifySubscriber } = createOutbound(logger);

  return startJob({
    name: "notification-expiry-reminders",
    intervalMs: 3600000,
    lockSeconds: 300,
    logger,
    run: () => runExpiryReminders(logger, notifySubscriber),
  });
};

module.exports = { startJobs, runExpiryReminders };
