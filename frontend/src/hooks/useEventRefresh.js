import { useEffect, useRef } from "react";
import useRealtime from "./useRealtime";

export default function useEventRefresh(pattern, callback, options = {}) {
    const { subscribe } = useRealtime();
    const callbackRef = useRef(callback);
    const filterRef = useRef(options.filter);
    const delay = options.delay ?? 500;
    const key = JSON.stringify(pattern);

    useEffect(() => {
        callbackRef.current = callback;
        filterRef.current = options.filter;
    });

    useEffect(() => {
        let timer = null;

        const unsubscribe = subscribe(JSON.parse(key), (message) => {
            if (filterRef.current && !filterRef.current(message)) {
                return;
            }

            if (timer) {
                return;
            }

            timer = setTimeout(() => {
                timer = null;
                callbackRef.current?.(message);
            }, delay);
        });

        return () => {
            clearTimeout(timer);
            unsubscribe();
        };
    }, [key, delay, subscribe]);
}
