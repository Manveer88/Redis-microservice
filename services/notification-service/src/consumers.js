const { startConsumer } = require("@isp/shared");
const service = require("./service");
const { createOutbound } = require("./outbound");
const { formatDate, formatMoney, formatGb, formatMethod, subscriberLabel, planLabel } = require("./format");

const loadSubscriber = async (payload) => service.getSubscriber(payload.subscriber_id);

const builders = {
  "subscriber.created": async (p) => {
    const subscriber = await loadSubscriber(p);
    return {
      title: "New subscriber added",
      message: `${subscriberLabel(subscriber, p)} was added as a new subscriber.`,
      severity: "info",
      entityType: "subscriber",
      entityId: p.subscriber_id,
    };
  },

  "subscriber.status_changed": async (p) => {
    const subscriber = await loadSubscriber(p);
    const from = p.previous_status ? ` from ${p.previous_status}` : "";
    return {
      title: p.status === "suspended" ? "Subscriber suspended" : "Subscriber status changed",
      message: `${subscriberLabel(subscriber, p)} changed${from} to ${p.status || "unknown"}.`,
      severity: p.status === "suspended" ? "warning" : "info",
      entityType: "subscriber",
      entityId: p.subscriber_id,
    };
  },

  "subscription.created": async (p) => {
    const [subscriber, plan] = await Promise.all([loadSubscriber(p), service.getPlan(p.plan_id)]);
    const amount = p.amount !== undefined ? ` for ${formatMoney(p.amount)}` : "";
    return {
      title: "Subscription created",
      message: `${subscriberLabel(subscriber, p)} has a new pending ${planLabel(plan, { plan_id: p.plan_id })} subscription${amount}.`,
      severity: "info",
      entityType: "subscription",
      entityId: p.subscription_id,
    };
  },

  "subscription.activated": async (p) => {
    const [subscriber, plan] = await Promise.all([loadSubscriber(p), service.getPlan(p.plan_id)]);
    const planName = planLabel(plan, { plan_id: p.plan_id });
    const endDate = formatDate(p.end_date);
    return {
      title: "Subscription activated",
      message: `${subscriberLabel(subscriber, p)}'s ${planName} subscription is active until ${endDate}.`,
      severity: "success",
      entityType: "subscription",
      entityId: p.subscription_id,
      subscriber,
      outbound: {
        subject: "Your subscription is active",
        body: `Hi ${(subscriber && subscriber.name) || "there"}, your ${planName} subscription is now active and valid until ${endDate}.`,
      },
    };
  },

  "subscription.activation_failed": async (p) => {
    const subscriber = await loadSubscriber(p);
    return {
      title: "Subscription activation failed",
      message: `Subscription #${p.subscription_id} for ${subscriberLabel(subscriber, p)} could not be activated: ${p.reason || "unknown reason"}.`,
      severity: "error",
      entityType: "subscription",
      entityId: p.subscription_id,
    };
  },

  "subscription.cancelled": async (p) => {
    const subscriber = await loadSubscriber(p);
    const reason = p.reason ? ` Reason: ${p.reason}.` : "";
    return {
      title: "Subscription cancelled",
      message: `Subscription #${p.subscription_id} for ${subscriberLabel(subscriber, p)} was cancelled.${reason}`,
      severity: "warning",
      entityType: "subscription",
      entityId: p.subscription_id,
    };
  },

  "subscription.expired": async (p) => {
    const [subscriber, plan] = await Promise.all([loadSubscriber(p), service.getPlan(p.plan_id)]);
    const planName = planLabel(plan, { plan_id: p.plan_id });
    const endDate = formatDate(p.end_date);
    return {
      title: "Subscription expired",
      message: `${subscriberLabel(subscriber, p)}'s ${planName} subscription expired on ${endDate}.`,
      severity: "warning",
      entityType: "subscription",
      entityId: p.subscription_id,
      subscriber,
      outbound: {
        subject: "Your subscription has expired",
        body: `Hi ${(subscriber && subscriber.name) || "there"}, your ${planName} subscription expired on ${endDate}. Please renew to stay connected.`,
      },
    };
  },

  "invoice.created": async (p) => {
    const subscriber = await loadSubscriber(p);
    const number = p.invoice_number || `#${p.invoice_id}`;
    return {
      title: "Invoice created",
      message: `Invoice ${number} for ${formatMoney(p.amount)} was issued to ${subscriberLabel(subscriber, p)}.`,
      severity: "info",
      entityType: "invoice",
      entityId: p.invoice_id,
      subscriber,
      outbound: {
        subject: `Invoice ${number}`,
        body: `Hi ${(subscriber && subscriber.name) || "there"}, invoice ${number} for ${formatMoney(p.amount)} has been issued to you.`,
      },
    };
  },

  "payment.recorded": async (p) => {
    const subscriber = await loadSubscriber(p);
    const number = p.invoice_number || `#${p.invoice_id}`;
    const method = formatMethod(p.method);
    return {
      title: "Payment received",
      message: `${formatMoney(p.amount)} received via ${method} from ${subscriberLabel(subscriber, p)} for invoice ${number}.`,
      severity: "success",
      entityType: "payment",
      entityId: p.payment_id,
      subscriber,
      outbound: {
        subject: `Payment received for invoice ${number}`,
        body: `Hi ${(subscriber && subscriber.name) || "there"}, we received your payment of ${formatMoney(p.amount)} via ${method} for invoice ${number}. Thank you!`,
      },
    };
  },

  "invoice.paid": async (p) => {
    const subscriber = await loadSubscriber(p);
    const number = p.invoice_number || `#${p.invoice_id}`;
    return {
      title: "Invoice paid",
      message: `Invoice ${number} for ${subscriberLabel(subscriber, p)} has been paid in full (${formatMoney(p.amount)}).`,
      severity: "success",
      entityType: "invoice",
      entityId: p.invoice_id,
    };
  },

  "invoice.voided": async (p) => {
    const subscriber = await loadSubscriber(p);
    const number = p.invoice_number || `#${p.invoice_id}`;
    return {
      title: "Invoice voided",
      message: `Invoice ${number} for ${subscriberLabel(subscriber, p)} was voided.`,
      severity: "warning",
      entityType: "invoice",
      entityId: p.invoice_id,
    };
  },

  "usage.quota_exceeded": async (p) => {
    const subscriber = await loadSubscriber(p);
    const used = formatGb(p.used_bytes);
    const limit = formatGb(p.limit_bytes);
    return {
      title: "Data quota exceeded",
      message: `${subscriberLabel(subscriber, p)} has used ${used} GB of a ${limit} GB data limit.`,
      severity: "warning",
      entityType: "subscription",
      entityId: p.subscription_id,
      subscriber,
      outbound: {
        subject: "Data limit reached",
        body: `Hi ${(subscriber && subscriber.name) || "there"}, you have used ${used} GB of your ${limit} GB data limit for this period.`,
      },
    };
  },

  "plan.created": async (p) => {
    const plan = await service.getPlan(p.plan_id);
    return {
      title: "Plan created",
      message: `A new plan "${planLabel(plan, p)}" was created.`,
      severity: "info",
      entityType: "plan",
      entityId: p.plan_id,
    };
  },

  "plan.status_changed": async (p) => {
    const plan = await service.getPlan(p.plan_id);
    return {
      title: "Plan status changed",
      message: `Plan "${planLabel(plan, p)}" is now ${p.status || "unknown"}.`,
      severity: "info",
      entityType: "plan",
      entityId: p.plan_id,
    };
  },
};

const startConsumers = async (logger) => {
  const { notifySubscriber } = createOutbound(logger);

  const handle = (build) => async (event) => {
    const payload = event.payload || {};
    const notification = await build(payload);
    const id = await service.createNotification({
      type: event.type,
      title: notification.title,
      message: notification.message,
      severity: notification.severity,
      entityType: notification.entityType,
      entityId: notification.entityId,
      dedupeKey: `event:${event.id || event.streamId}`,
    });

    if (id && notification.outbound) {
      await notifySubscriber(notification.subscriber, notification.outbound);
    }
  };

  const handlers = {};
  for (const [type, build] of Object.entries(builders)) {
    handlers[type] = handle(build);
  }

  return startConsumer({ group: "notification-service", handlers, logger });
};

module.exports = { startConsumers, builders };
