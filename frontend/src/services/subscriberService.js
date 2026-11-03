import api, { unwrap } from "./api";

export const getSubscribers = (params = {}) =>
    api.get("/subscribers", { params: { page: 1, limit: 20, ...params } }).then(unwrap);

export const getSubscriber = (id) => api.get(`/subscribers/${id}`).then(unwrap);

export const createSubscriber = (data) => api.post("/subscribers", data).then(unwrap);

export const updateSubscriber = (id, data) =>
    api.put(`/subscribers/${id}`, data).then(unwrap);

export const updateSubscriberStatus = (id, status) =>
    api.patch(`/subscribers/${id}/status`, { status }).then(unwrap);

export const deleteSubscriber = (id) => api.delete(`/subscribers/${id}`).then(unwrap);
