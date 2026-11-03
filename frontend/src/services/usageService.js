import api, { unwrap } from "./api";

export const getUsageSummary = (params = {}) =>
    api.get("/usage/summary", { params: { page: 1, limit: 20, ...params } }).then(unwrap);

export const getSubscriberUsage = (id, days = 30) =>
    api.get(`/usage/subscribers/${id}`, { params: { days } }).then(unwrap);

export const importUsageCsv = (csv) =>
    api.post("/usage/import", { csv }, { timeout: 60000 }).then(unwrap);
