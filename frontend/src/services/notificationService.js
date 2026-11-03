import api, { unwrap } from "./api";

export const getNotifications = (params = {}) =>
    api.get("/notifications", { params: { page: 1, limit: 20, ...params } }).then(unwrap);

export const getUnreadCount = () => api.get("/notifications/unread-count").then(unwrap);

export const markNotificationRead = (id) =>
    api.patch(`/notifications/${id}/read`).then(unwrap);

export const markAllNotificationsRead = () =>
    api.post("/notifications/read-all").then(unwrap);
