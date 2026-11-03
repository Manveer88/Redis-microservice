import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../utils/errors";

export default function useApi(fetcher, deps = [], options = {}) {
    const enabled = options.enabled ?? true;
    const [version, setVersion] = useState(0);
    const [state, setState] = useState({ key: null, body: null, error: "" });
    const fetcherRef = useRef(fetcher);
    const key = enabled ? JSON.stringify([deps, version]) : null;

    useEffect(() => {
        fetcherRef.current = fetcher;
    });

    useEffect(() => {
        if (key === null) {
            return undefined;
        }

        let active = true;

        Promise.resolve()
            .then(() => fetcherRef.current())
            .then(
                (body) => {
                    if (active) {
                        setState({ key, body: body ?? {}, error: "" });
                    }
                },
                (error) => {
                    if (active) {
                        setState((prev) => ({
                            key,
                            body: prev.body,
                            error: getErrorMessage(error, "Unable to load data")
                        }));
                    }
                }
            );

        return () => {
            active = false;
        };
    }, [key]);

    const reload = useCallback(() => setVersion((value) => value + 1), []);

    const loading = key !== null && state.key !== key;
    const error = state.key === key ? state.error : "";

    return {
        body: state.body,
        data: state.body?.data,
        meta: state.body?.meta,
        loading,
        loaded: state.body !== null,
        error,
        reload
    };
}
