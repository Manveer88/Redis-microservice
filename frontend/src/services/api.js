
import axios from "axios";

const AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];

let accessToken = null;
let refreshPromise = null;
let handlers = {
    onRefreshed: null,
    onFailure: null
};

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    headers: {
        "Content-Type": "application/json"
    },
    timeout: 10000,
    withCredentials: true
});

const matchesPath = (url, paths) =>
    paths.some((path) => (url || "").split("?")[0].endsWith(path));

export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
    accessToken = token || null;
};

export const setAuthHandlers = (next) => {
    handlers = { ...handlers, ...next };
};

export const refreshSession = () => {
    if (!refreshPromise) {
        refreshPromise = api
            .post("/auth/refresh", null, { skipAuthRefresh: true })
            .then((response) => {
                const { accessToken: token, user } = response.data.data;
                setAccessToken(token);
                handlers.onRefreshed?.(user, token);
                return { accessToken: token, user };
            })
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
};

const failAuth = () => {
    setAccessToken(null);
    handlers.onFailure?.();
};

api.interceptors.request.use((config) => {
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        const status = error.response?.status;

        if (
            status !== 401 ||
            !original ||
            original.skipAuthRefresh ||
            matchesPath(original.url, AUTH_PATHS)
        ) {
            return Promise.reject(error);
        }

        if (original._retry || error.response?.data?.code === "SESSION_REVOKED") {
            failAuth();
            return Promise.reject(error);
        }

        original._retry = true;

        try {
            const { accessToken: token } = await refreshSession();
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
        } catch {
            failAuth();
            return Promise.reject(error);
        }
    }
);

export const unwrap = (response) => response.data;

export default api;
