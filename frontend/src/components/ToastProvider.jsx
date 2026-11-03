import { useCallback, useMemo, useState } from "react";
import { ToastContext } from "../context/contexts";
import ToastList from "./Toast";

let nextToastId = 0;

function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => {
        setToasts((items) => items.filter((item) => item.id !== id));
    }, []);

    const notify = useCallback(
        (input) => {
            nextToastId += 1;

            const toast = {
                id: nextToastId,
                type: "info",
                duration: 4500,
                ...(typeof input === "string" ? { message: input } : input)
            };

            setToasts((items) => [...items, toast].slice(-5));
            setTimeout(() => dismiss(toast.id), toast.duration);

            return toast.id;
        },
        [dismiss]
    );

    const value = useMemo(
        () => ({
            notify,
            dismiss,
            success: (message) => notify({ type: "success", message }),
            error: (message) => notify({ type: "error", message, duration: 7000 }),
            info: (message) => notify({ type: "info", message })
        }),
        [notify, dismiss]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastList toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

export default ToastProvider;
