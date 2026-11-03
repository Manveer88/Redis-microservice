import api, { unwrap } from "./api";

export const getSubscriptions = (params = {}) =>
    api.get("/subscriptions", { params: { page: 1, limit: 20, ...params } }).then(unwrap);

export const getSubscription = (id) => api.get(`/subscriptions/${id}`).then(unwrap);

export const createSubscription = (data) => api.post("/subscriptions", data).then(unwrap);

export const cancelSubscription = (id, reason) =>
    api.post(`/subscriptions/${id}/cancel`, reason ? { reason } : {}).then(unwrap);
