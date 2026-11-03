import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

const ICONS = {
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
    info: Info
};

function Toast({ toast, onDismiss }) {
    const Icon = ICONS[toast.type] || Info;

    return (
        <div className={`toast toast-${toast.type}`} role="status">
            <Icon size={18} className="toast-icon" />
            <div className="toast-body">
                {toast.title && <strong>{toast.title}</strong>}
                {toast.message && <p>{toast.message}</p>}
            </div>
            <button
                type="button"
                className="toast-close"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss"
            >
                <X size={15} />
            </button>
        </div>
    );
}

function ToastList({ toasts, onDismiss }) {
    if (toasts.length === 0) {
        return null;
    }

    return (
        <div className="toast-stack">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

export default ToastList;
