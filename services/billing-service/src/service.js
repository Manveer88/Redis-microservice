const {
  pool,
  withTransaction,
  addEvent,
  validate,
  badRequest,
  notFound,
  conflict,
} = require("@isp/shared");

const INVOICE_STATUSES = ["unpaid", "partial", "paid", "void"];
const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "cheque", "other"];
const MAX_AMOUNT = 99999999.99;
const FUTURE_SKEW_MS = 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => cents / 100;

const INVOICE_SELECT = `
  SELECT i.id, i.invoice_number, i.subscriber_id, i.subscription_id, i.amount, i.amount_paid,
         (i.amount - i.amount_paid) AS outstanding, i.status, i.issued_at, i.due_date, i.paid_at,
         i.voided_at, i.void_reason, i.created_at, i.updated_at,
         s.name AS subscriber_name, s.username AS subscriber_username, s.email AS subscriber_email,
         s.mobile AS subscriber_mobile, s.status AS subscriber_status,
         sub.plan_id, p.name AS plan_name, sub.status AS subscription_status
  FROM invoices i
  JOIN subscribers s ON s.id = i.subscriber_id
  LEFT JOIN subscriptions sub ON sub.id = i.subscription_id
  LEFT JOIN plans p ON p.id = sub.plan_id`;

const listInvoices = async (query) => {
  const pagination = validate.parsePagination(query);
  const where = [];
  const params = [];

  const status = validate.optionalEnum(query.status, "Status", INVOICE_STATUSES);
  if (status) {
    where.push("i.status = ?");
    params.push(status);
  }
  const subscriberId = validate.optionalId(query.subscriber_id, "subscriber ID");
  if (subscriberId) {
    where.push("i.subscriber_id = ?");
    params.push(subscriberId);
  }
  const subscriptionId = validate.optionalId(query.subscription_id, "subscription ID");
  if (subscriptionId) {
    where.push("i.subscription_id = ?");
    params.push(subscriptionId);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `${INVOICE_SELECT} ${whereSql} ORDER BY i.id DESC LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM invoices i ${whereSql}`,
    params
  );

  return { rows, meta: validate.pageMeta(pagination, total) };
};

const findInvoice = async (db, id) => {
  const [rows] = await db.query(
    `${INVOICE_SELECT} WHERE i.id = ?`,
    [id]
  );
  if (!rows.length) {
    throw notFound("Invoice not found", "INVOICE_NOT_FOUND");
  }

  const [payments] = await db.query(
    `SELECT pay.id, pay.invoice_id, pay.subscriber_id, pay.amount, pay.method, pay.reference, pay.notes,
            pay.received_by, a.name AS received_by_name, pay.paid_at, pay.created_at
     FROM payments pay
     LEFT JOIN admins a ON a.id = pay.received_by
     WHERE pay.invoice_id = ?
     ORDER BY pay.paid_at, pay.id`,
    [id]
  );

  return { ...rows[0], payments };
};

const getInvoice = async (idParam) => findInvoice(pool, validate.parseId(idParam, "invoice ID"));

const parsePaymentInput = (body) => {
  const input = body || {};
  const amount = validate.requireNumber(input.amount, "Amount", { max: MAX_AMOUNT });
  if (amount <= 0) {
    throw badRequest("Amount must be greater than 0");
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    throw badRequest("Amount must have at most 2 decimal places");
  }

  const method = validate.requireEnum(input.method, "Method", PAYMENT_METHODS);
  const reference =
    method === "cash"
      ? validate.optionalString(input.reference, "Reference", { max: 100 })
      : validate.requireString(input.reference, "Reference", { max: 100 });
  const notes = validate.optionalString(input.notes, "Notes", { max: 255 });

  let paidAt = validate.optionalDate(input.paid_at, "Payment date");
  if (paidAt && paidAt.getTime() > Date.now() + FUTURE_SKEW_MS) {
    throw badRequest("Payment date cannot be in the future");
  }
  if (paidAt && paidAt.getFullYear() < 2000) {
    throw badRequest("Payment date is not valid");
  }
  if (!paidAt) {
    paidAt = new Date();
  }

  return { amountCents: toCents(amount), method, reference, notes, paidAt };
};

const assertPayable = async (conn, invoice) => {
  const [rows] = await conn.query(
    `SELECT sub.status AS subscription_status, s.status AS subscriber_status, p.status AS plan_status
     FROM subscriptions sub
     JOIN subscribers s ON s.id = sub.subscriber_id
     JOIN plans p ON p.id = sub.plan_id
     WHERE sub.id = ?`,
    [invoice.subscription_id]
  );
  if (!rows.length) {
    throw conflict("The subscription for this invoice no longer exists", "SUBSCRIPTION_NOT_FOUND");
  }
  const row = rows[0];
  if (row.subscription_status === "cancelled") {
    throw conflict("The subscription for this invoice is cancelled", "SUBSCRIPTION_CANCELLED");
  }
  if (row.subscription_status === "expired") {
    throw conflict("The subscription for this invoice has expired", "SUBSCRIPTION_EXPIRED");
  }
  if (row.subscriber_status === "suspended") {
    throw conflict("Subscriber is suspended", "SUBSCRIBER_SUSPENDED");
  }
  if (row.plan_status !== "active") {
    throw conflict("The plan for this invoice is inactive", "PLAN_INACTIVE");
  }
};

const recordPayment = async (idParam, body, user) => {
  const invoiceId = validate.parseId(idParam, "invoice ID");
  const input = parsePaymentInput(body);

  await withTransaction(async (conn) => {
    const [invoices] = await conn.query("SELECT * FROM invoices WHERE id = ? FOR UPDATE", [invoiceId]);
    if (!invoices.length) {
      throw notFound("Invoice not found", "INVOICE_NOT_FOUND");
    }
    const invoice = invoices[0];

    if (invoice.status === "paid") {
      throw conflict("Invoice is already paid", "INVOICE_PAID");
    }
    if (invoice.status === "void") {
      throw conflict("Invoice is void", "INVOICE_VOID");
    }

    await assertPayable(conn, invoice);

    const totalCents = toCents(invoice.amount);
    const paidCents = toCents(invoice.amount_paid);
    const outstandingCents = totalCents - paidCents;
    if (input.amountCents > outstandingCents) {
      throw conflict(
        `Amount exceeds the outstanding balance of ${fromCents(outstandingCents).toFixed(2)}`,
        "AMOUNT_EXCEEDS_BALANCE"
      );
    }

    if (input.reference) {
      const [dupes] = await conn.query(
        "SELECT id FROM payments WHERE method = ? AND reference = ? LIMIT 1",
        [input.method, input.reference]
      );
      if (dupes.length) {
        throw conflict("A payment with this method and reference already exists", "DUPLICATE_REFERENCE");
      }
    }

    let paymentId;
    try {
      const [result] = await conn.query(
        `INSERT INTO payments (invoice_id, subscriber_id, amount, method, reference, notes, received_by, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.id,
          invoice.subscriber_id,
          fromCents(input.amountCents),
          input.method,
          input.reference,
          input.notes,
          user && user.id ? user.id : null,
          input.paidAt,
        ]
      );
      paymentId = result.insertId;
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw conflict("A payment with this method and reference already exists", "DUPLICATE_REFERENCE");
      }
      throw error;
    }

    const newPaidCents = paidCents + input.amountCents;
    const fullyPaid = newPaidCents >= totalCents;

    await conn.query(
      `UPDATE invoices SET amount_paid = ?, status = ?, paid_at = ? WHERE id = ?`,
      [fromCents(newPaidCents), fullyPaid ? "paid" : "partial", fullyPaid ? input.paidAt : null, invoice.id]
    );

    await addEvent(conn, "payment.recorded", {
      payment_id: paymentId,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      subscriber_id: invoice.subscriber_id,
      amount: fromCents(input.amountCents),
      method: input.method,
      reference: input.reference,
    });

    if (fullyPaid) {
      await addEvent(conn, "invoice.paid", {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        subscription_id: invoice.subscription_id,
        subscriber_id: invoice.subscriber_id,
        amount: fromCents(totalCents),
      });
    }
  });

  return findInvoice(pool, invoiceId);
};

const voidInvoice = async (idParam, body) => {
  const invoiceId = validate.parseId(idParam, "invoice ID");
  const reason = validate.optionalString((body || {}).reason, "Reason", { max: 255 });

  await withTransaction(async (conn) => {
    const [invoices] = await conn.query("SELECT * FROM invoices WHERE id = ? FOR UPDATE", [invoiceId]);
    if (!invoices.length) {
      throw notFound("Invoice not found", "INVOICE_NOT_FOUND");
    }
    const invoice = invoices[0];

    if (invoice.status === "void") {
      throw conflict("Invoice is already void", "INVOICE_VOID");
    }
    if (toCents(invoice.amount_paid) > 0) {
      throw conflict("Invoice has payments and cannot be voided", "INVOICE_HAS_PAYMENTS");
    }

    await conn.query(
      "UPDATE invoices SET status = 'void', voided_at = NOW(), void_reason = ? WHERE id = ?",
      [reason, invoice.id]
    );

    await addEvent(conn, "invoice.voided", {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      subscription_id: invoice.subscription_id,
      subscriber_id: invoice.subscriber_id,
    });
  });

  return findInvoice(pool, invoiceId);
};

const listPayments = async (query) => {
  const pagination = validate.parsePagination(query);
  const where = [];
  const params = [];

  const invoiceId = validate.optionalId(query.invoice_id, "invoice ID");
  if (invoiceId) {
    where.push("pay.invoice_id = ?");
    params.push(invoiceId);
  }
  const subscriberId = validate.optionalId(query.subscriber_id, "subscriber ID");
  if (subscriberId) {
    where.push("pay.subscriber_id = ?");
    params.push(subscriberId);
  }
  const method = validate.optionalEnum(query.method, "Method", PAYMENT_METHODS);
  if (method) {
    where.push("pay.method = ?");
    params.push(method);
  }
  const from = validate.optionalDate(query.from, "From date");
  if (from) {
    where.push("pay.paid_at >= ?");
    params.push(DATE_ONLY.test(query.from) ? query.from : from);
  }
  const to = validate.optionalDate(query.to, "To date");
  if (to && DATE_ONLY.test(query.to)) {
    where.push("pay.paid_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(query.to);
  } else if (to) {
    where.push("pay.paid_at <= ?");
    params.push(to);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT pay.id, pay.invoice_id, i.invoice_number, pay.subscriber_id,
            s.name AS subscriber_name, s.username AS subscriber_username,
            pay.amount, pay.method, pay.reference, pay.notes, pay.received_by,
            a.name AS received_by_name, pay.paid_at, pay.created_at
     FROM payments pay
     JOIN invoices i ON i.id = pay.invoice_id
     JOIN subscribers s ON s.id = pay.subscriber_id
     LEFT JOIN admins a ON a.id = pay.received_by
     ${whereSql}
     ORDER BY pay.paid_at DESC, pay.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM payments pay ${whereSql}`,
    params
  );

  return { rows, meta: validate.pageMeta(pagination, total) };
};

module.exports = {
  listInvoices,
  getInvoice,
  recordPayment,
  voidInvoice,
  listPayments,
};
