import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { RealtimeContext } from "./contexts";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import { getAccessToken, refreshSession } from "../services/api";
import { SOCKET_URL } from "../config/constants";
import { matchesPattern } from "../utils/events";

const MAX_RECENT = 50;

function RealtimeProvider({ children }) {
    const { user, token } = useAuth();
    const { notify } = useToast();
    const [connected, setConnected] = useState(false);
    const listenersRef = useRef(new Set());
    const recentRef = useRef([]);
    const socketRef = useRef(null);
    const userId = user?.id;

    const dispatch = useCallback((message) => {
        listenersRef.current.forEach((listener) => {
            if (matchesPattern(listener.pattern, message.type)) {
                try {
                    listener.handler(message);
                } catch {
                    return;
                }
            }
        });
    }, []);

    useEffect(() => {
        if (!userId || !SOCKET_URL) {
            return undefined;
        }

        let retryTimer = null;
        let retryDelay = 5000;

        const socket = io(SOCKET_URL, {
            auth: (cb) => cb({ token: getAccessToken() }),
            reconnectionDelayMax: 10000
        });

        socketRef.current = socket;

        const scheduleRetry = () => {
            clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
                refreshSession()
                    .then(() => socket.connect())
                    .catch(() => {
                        retryDelay = Math.min(retryDelay * 2, 60000);
                        scheduleRetry();
                    });
            }, retryDelay);
        };

        socket.on("connect", () => {
            retryDelay = 5000;
            setConnected(true);
        });

        socket.on("disconnect", (reason) => {
            setConnected(false);

            if (reason === "io server disconnect") {
                scheduleRetry();
            }
        });

        socket.on("connect_error", () => {
            setConnected(false);

            if (!socket.active) {
                scheduleRetry();
            }
        });

        socket.on("event", (event) => {
            const message = { kind: "event", ...event };
            recentRef.current = [message, ...recentRef.current].slice(0, MAX_RECENT);
            dispatch(message);
        });

        socket.on("live", (live) => {
            const message = { kind: "live", ...live };

            if (message.type === "notification.created" && message.data) {
                notify({
                    title: message.data.title,
                    message: message.data.message,
                    type: message.data.severity || "info"
                });
            }

            dispatch(message);
        });

        return () => {
            clearTimeout(retryTimer);
            socket.disconnect();
            socket.removeAllListeners();
            socketRef.current = null;
            recentRef.current = [];
        };
    }, [userId, dispatch, notify]);

    useEffect(() => {
        const socket = socketRef.current;

        if (token && socket && !socket.connected) {
            socket.connect();
        }
    }, [token]);

    const subscribe = useCallback((pattern, handler) => {
        const listener = { pattern, handler };
        listenersRef.current.add(listener);

        return () => {
            listenersRef.current.delete(listener);
        };
    }, []);

    const emitLocal = useCallback(
        (type, data) => dispatch({ kind: "local", type, data, at: new Date().toISOString() }),
        [dispatch]
    );

    const getRecentEvents = useCallback(() => recentRef.current, []);

    const status = userId && connected ? "live" : "offline";

    const value = useMemo(
        () => ({ status, subscribe, emitLocal, getRecentEvents }),
        [status, subscribe, emitLocal, getRecentEvents]
    );

    return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export default RealtimeProvider;
