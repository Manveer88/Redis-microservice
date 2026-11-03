const express = require("express");
const { ROLES, requireRole, cache, invalidate } = require("@isp/shared");
const service = require("./service");

module.exports = (app) => {
  const invoices = express.Router();
  const payments = express.Router();

  invoices.get("/", requireRole(ROLES.ALL), cache("invoices", 60), async (req, res) => {
    const { rows, meta } = await service.listInvoices(req.query);
    res.json({ success: true, data: rows, meta });
  });

  invoices.get("/:id", requireRole(ROLES.ALL), cache("invoices", 60), async (req, res) => {
    res.json({ success: true, data: await service.getInvoice(req.params.id) });
  });

  invoices.post(
    "/:id/payments",
    requireRole(ROLES.STAFF),
    invalidate("invoices", "reports"),
    async (req, res) => {
      const data = await service.recordPayment(req.params.id, req.body, req.user);
      res.status(201).json({ success: true, data, message: "Payment recorded" });
    }
  );

  invoices.post(
    "/:id/void",
    requireRole(ROLES.MANAGERS),
    invalidate("invoices", "reports"),
    async (req, res) => {
      const data = await service.voidInvoice(req.params.id, req.body);
      res.json({ success: true, data, message: "Invoice voided" });
    }
  );

  payments.get("/", requireRole(ROLES.ALL), cache("invoices", 60), async (req, res) => {
    const { rows, meta } = await service.listPayments(req.query);
    res.json({ success: true, data: rows, meta });
  });

  app.use("/api/invoices", invoices);
  app.use("/api/payments", payments);
};
