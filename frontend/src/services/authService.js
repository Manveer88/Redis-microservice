import api, { unwrap } from "./api";

export const login = (email, password) =>
    api.post("/auth/login", { email, password }).then(unwrap);

export const logout = () => api.post("/auth/logout").then(unwrap);

export const getMe = () => api.get("/auth/me").then(unwrap);

export const changePassword = (data) =>
    api.post("/auth/change-password", data).then(unwrap);
