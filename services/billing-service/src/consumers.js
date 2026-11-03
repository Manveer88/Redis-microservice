const { withTransaction, addEvent, startConsumer, bumpCache, validate } = require("@isp/shared");

const toPositiveId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const createInvoice = (logger) => async (event) => {
  const subscriptionId = toPositiveId(event.payload.subscription_id);
  if (!subscriptionId) {
    logger.warn("subscription.created without subscription_id", { eventId: event.id });
    return;
  }

  const created = await withTransaction(async (conn) => {
    const [subscriptions] = await conn.query(
      "SELECT id, subscriber_id, amount, status FROM subscriptions WHERE id = ? FOR UPDATE",
      [subscriptionId]
    );
    if (!subscriptions.length) {
      logger.warn("Subscription not found for invoice", { subscriptionId, eventId: event.id });
      return false;
    }
    const subscription = subscriptions[0];
    if (subscription.status === "cancelled" || subscription.status === "expired") {
      logger.warn("Skipping invoice for closed subscription", {
        subscriptionId,
        status: subscription.status,
      });
      return false;
    }

    const payloadAmount = Number(event.payload.amount);
    const amount = validate.toMoney(
      event.payload.amount !== undefined && event.payload.amount !== null && Number.isFinite(payloadAmount) && payloadAmount >= 0
        ? payloadAmount
        : subscription.amount
    );
    const free = amount <= 0;

    const [existing] = await conn.query("SELECT id FROM invoices WHERE subscription_id = ?", [subscription.id]);
    if (existing.length) {
      return false;
    }

    let invoiceId;
    try {
      const [result] = await conn.query(
        `INSERT INTO invoices (subscriber_id, subscription_id, amount, amount_paid, status, issued_at, due_date, paid_at)
         VALUES (?, ?, ?, 0, ?, NOW(), NOW() + INTERVAL 7 DAY, ${free ? "NOW()" : "NULL"})`,
        [subscription.subscriber_id, subscription.id, amount, free ? "paid" : "unpaid"]
      );
      invoiceId = result.insertId;
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return false;
      }
      throw error;
    }

    await conn.query(
      `UPDATE invoices
       SET invoice_number = CONCAT('INV-', DATE_FORMAT(issued_at, '%Y%m'), '-', LPAD(id, 6, '0'))
       WHERE id = ?`,
      [invoiceId]
    );
    const [[invoice]] = await conn.query("SELECT invoice_number FROM invoices WHERE id = ?", [invoiceId]);

    const payload = {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      subscription_id: subscription.id,
      subscriber_id: subscription.subscriber_id,
      amount,
    };
    await addEvent(conn, "invoice.created", payload);
    if (free) {
      await addEvent(conn, "invoice.paid", payload);
    }
    return true;
  });

  if (created) {
    await bumpCache("invoices", "reports");
  }
};

const voidOnCancel = (logger) => async (event) => {
  const subscriptionId = toPositiveId(event.payload.subscription_id);
  if (!subscriptionId) {
    return;
  }

  const voided = await withTransaction(async (conn) => {
    const [invoices] = await conn.query(
      "SELECT * FROM invoices WHERE subscription_id = ? FOR UPDATE",
      [subscriptionId]
    );
    if (!invoices.length) {
      return false;
    }
    const invoice = invoices[0];
    if (invoice.status === "void") {
      return false;
    }
    if (Math.round(Number(invoice.amount_paid) * 100) > 0) {
      logger.warn("Cancelled subscription has a paid invoice; leaving it unchanged", {
        subscriptionId,
        invoiceId: invoice.id,
        status: invoice.status,
        amountPaid: invoice.amount_paid,
      });
      return false;
    }

    await conn.query(
      "UPDATE invoices SET status = 'void', voided_at = NOW(), void_reason = ? WHERE id = ?",
      ["Subscription cancelled", invoice.id]
    );
    await addEvent(conn, "invoice.voided", {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      subscription_id: invoice.subscription_id,
      subscriber_id: invoice.subscriber_id,
    });
    return true;
  });

  if (voided) {
    await bumpCache("invoices", "reports");
  }
};

const startConsumers = async (logger) => {
  const stop = await startConsumer({
    group: "billing-service",
    logger,
    handlers: {
      "subscription.created": createInvoice(logger),
      "subscription.cancelled": voidOnCancel(logger),
      "subscriber.*": () => bumpCache("invoices"),
    },
  });
  return stop;
};

module.exports = { startConsumers };
