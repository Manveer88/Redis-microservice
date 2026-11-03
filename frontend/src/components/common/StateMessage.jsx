import { AlertCircle, Inbox, Loader2 } from "lucide-react";

function StateMessage({ loading, error, empty, emptyText = "Nothing to show yet.", onRetry, children }) {
    if (loading) {
        return (
            <div className="state-message">
                <Loader2 size={18} className="spin" /> Loading...
            </div>
        );
    }

    if (error) {
        return (
            <div className="state-message error">
                <AlertCircle size={18} /> {error}
                {onRetry && (
                    <button type="button" className="link-button retry" onClick={onRetry}>
                        Retry
                    </button>
                )}
            </div>
        );
    }

    if (empty) {
        return (
            <div className="state-message">
                <Inbox size={18} /> {emptyText}
            </div>
        );
    }

    return children ?? null;
}

export default StateMessage;
