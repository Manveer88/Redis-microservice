import { AlertCircle, Inbox, Loader2 } from "lucide-react";

function TableState({ colSpan, loading, error, empty, emptyText = "No records found.", onRetry }) {
    if (loading) {
        return (
            <tr>
                <td colSpan={colSpan} className="table-message">
                    <span className="inline-loader">
                        <Loader2 size={16} className="spin" /> Loading...
                    </span>
                </td>
            </tr>
        );
    }

    if (error) {
        return (
            <tr>
                <td colSpan={colSpan} className="error-message">
                    <span className="inline-loader">
                        <AlertCircle size={16} /> {error}
                    </span>
                    {onRetry && (
                        <button type="button" className="link-button retry" onClick={onRetry}>
                            Retry
                        </button>
                    )}
                </td>
            </tr>
        );
    }

    if (empty) {
        return (
            <tr>
                <td colSpan={colSpan} className="empty-state">
                    <span className="inline-loader">
                        <Inbox size={16} /> {emptyText}
                    </span>
                </td>
            </tr>
        );
    }

    return null;
}

export default TableState;
