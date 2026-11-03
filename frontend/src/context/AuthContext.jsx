import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./contexts";
import { refreshSession, setAccessToken, setAuthHandlers } from "../services/api";
import { login as loginRequest, logout as logoutRequest } from "../services/authService";

function AuthProvider({ children }) {
    const [state, setState] = useState({
        initializing: true,
        user: null,
        token: null
    });

    useEffect(() => {
        let active = true;

        setAuthHandlers({
            onRefreshed: (user, token) =>
                setState((prev) => ({ ...prev, user: user || prev.user, token })),
            onFailure: () =>
                setState((prev) => ({ ...prev, user: null, token: null }))
        });

        refreshSession()
            .catch(() => {
                setAccessToken(null);
            })
            .finally(() => {
                if (active) {
                    setState((prev) => ({ ...prev, initializing: false }));
                }
            });

        return () => {
            active = false;
        };
    }, []);

    const login = useCallback(async (email, password) => {
        const body = await loginRequest(email, password);
        const { accessToken, user } = body.data;

        setAccessToken(accessToken);
        setState({ initializing: false, user, token: accessToken });

        return user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await logoutRequest();
        } catch {
            setAccessToken(null);
        }

        setAccessToken(null);
        setState({ initializing: false, user: null, token: null });
    }, []);

    const value = useMemo(
        () => ({
            user: state.user,
            token: state.token,
            initializing: state.initializing,
            login,
            logout
        }),
        [state, login, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
