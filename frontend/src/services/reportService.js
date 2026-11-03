import api, { unwrap } from "./api";

export const getDashboard = () => api.get("/reports/dashboard").then(unwrap);

export const getRevenue = (months = 12) =>
    api.get("/reports/revenue", { params: { months } }).then(unwrap);

export const getExpiring = (days = 7, params = {}) =>
    api.get("/reports/expiring", { params: { days, page: 1, limit: 20, ...params } }).then(unwrap);

export const getTopUsage = (days = 30, limit = 10) =>
    api.get("/reports/top-usage", { params: { days, limit, page: 1 } }).then(unwrap);

export const downloadExport = async (type) => {
    const response = await api.get(`/reports/export/${type}`, {
        responseType: "blob",
        timeout: 60000
    });
    const disposition = response.headers?.["content-disposition"] || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match ? match[1] : `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
};
