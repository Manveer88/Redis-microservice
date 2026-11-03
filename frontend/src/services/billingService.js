import api, { unwrap } from "./api";

export const getInvoices = (params = {}) =>
    api.get("/invoices", { params: { page: 1, limit: 20, ...params } }).then(unwrap);

export const getInvoice = (id) => api.get(`/invoices/${id}`).then(unwrap);

export const recordPayment = (invoiceId, data) =>
    api.post(`/invoices/${invoiceId}/payments`, data).then(unwrap);

export const voidInvoice = (invoiceId, reason) =>
    api.post(`/invoices/${invoiceId}/void`, reason ? { reason } : {}).then(unwrap);

export const getPayments = (params = {}) =>
    api.get("/payments", { params: { page: 1, limit: 20, ...params } }).then(unwrap);
