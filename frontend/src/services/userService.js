import api, { unwrap } from "./api";

export const getUsers = (params = {}) =>
    api.get("/users", { params: { page: 1, limit: 20, ...params } }).then(unwrap);

export const createUser = (data) => api.post("/users", data).then(unwrap);

export const updateUser = (id, data) => api.put(`/users/${id}`, data).then(unwrap);

export const updateUserStatus = (id, status) =>
    api.patch(`/users/${id}/status`, { status }).then(unwrap);

export const resetUserPassword = (id, password) =>
    api.post(`/users/${id}/reset-password`, { password }).then(unwrap);

export const getAuditLogs = (params = {}) =>
    api.get("/audit-logs", { params: { page: 1, limit: 20, ...params } }).then(unwrap);
