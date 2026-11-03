import { useState } from "react";
import Modal from "./Modal";
import { getErrorMessage } from "../../utils/errors";

function ConfirmModal({
    title = "Are you sure?",
    message,
    confirmLabel = "Confirm",
    danger = false,
    reasonLabel,
    reasonRequired = false,
    onConfirm,
    onClose
}) {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const handleConfirm = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");

        try {
            await onConfirm(reason.trim());
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, "Action failed"));
            setBusy(false);
        }
    };

    return (
        <Modal
            title={title}
            onClose={busy ? undefined : onClose}
            size="sm"
        >
            <form onSubmit={handleConfirm} className="form-grid">
                {message && <div className="confirm-message">{message}</div>}

                {reasonLabel && (
                    <label className="field">
                        <span>{reasonLabel}</span>
                        <textarea
                            rows={3}
                            value={reason}
                            maxLength={255}
                            onChange={(e) => setReason(e.target.value)}
                            required={reasonRequired}
                        />
                    </label>
                )}

                {error && <div className="form-error">{error}</div>}

                <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className={danger ? "danger-button" : "primary-button"} disabled={busy}>
                        {busy ? "Please wait..." : confirmLabel}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default ConfirmModal;
