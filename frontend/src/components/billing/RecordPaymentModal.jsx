import { useState } from "react";
import Modal from "../common/Modal";
import useToast from "../../hooks/useToast";
import { recordPayment } from "../../services/billingService";
import { PAYMENT_METHODS } from "../../config/constants";
import { getErrorMessage } from "../../utils/errors";
import { formatCurrency } from "../../utils/format";
import { getOutstanding } from "./invoiceUtils";

function RecordPaymentModal({ invoice, onClose, onRecorded }) {
    const toast = useToast();
    const outstanding = getOutstanding(invoice);
    const [form, setForm] = useState({
        amount: outstanding.toFixed(2),
        method: "cash",
        reference: "",
        notes: "",
        paid_at: ""
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
    const referenceRequired = form.method !== "cash";

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const amount = Math.round(Number(form.amount) * 100) / 100;

        if (!(amount > 0)) {
            setError("Amount must be greater than zero.");
            return;
        }

        if (amount > outstanding + 0.0001) {
            setError(`Amount cannot exceed the outstanding ${formatCurrency(outstanding)}.`);
            return;
        }

        if (referenceRequired && !form.reference.trim()) {
            setError("Reference is required for non-cash payments.");
            return;
        }

        const payload = { amount, method: form.method };

        if (form.reference.trim()) {
            payload.reference = form.reference.trim();
        }

        if (form.notes.trim()) {
            payload.notes = form.notes.trim();
        }

        if (form.paid_at) {
            payload.paid_at = new Date(form.paid_at).toISOString();
        }

        setBusy(true);

        try {
            const body = await recordPayment(invoice.id, payload);
            toast.success(
                body?.message ||
                (amount >= outstanding
                    ? "Payment recorded. Invoice fully paid — the subscription will activate shortly."
                    : "Payment recorded.")
            );
            onRecorded?.(body?.data);
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, "Unable to record payment"));
            setBusy(false);
        }
    };

    return (
        <Modal
            title="Record payment"
            subtitle={`${invoice.invoice_number || `Invoice #${invoice.id}`} · Outstanding ${formatCurrency(outstanding)}`}
            onClose={onClose}
            size="sm"
        >
            <form className="form-grid" onSubmit={handleSubmit}>
                <label className="field">
                    <span>Amount (₹) *</span>
                    <input
                        type="number"
                        name="amount"
                        value={form.amount}
                        onChange={handleChange}
                        min="0.01"
                        max={outstanding.toFixed(2)}
                        step="0.01"
                        required
                    />
                </label>

                <label className="field">
                    <span>Method *</span>
                    <select name="method" value={form.method} onChange={handleChange}>
                        {PAYMENT_METHODS.map((method) => (
                            <option key={method.value} value={method.value}>{method.label}</option>
                        ))}
                    </select>
                </label>

                <label className="field">
                    <span>Reference {referenceRequired ? "*" : "(optional)"}</span>
                    <input
                        name="reference"
                        value={form.reference}
                        onChange={handleChange}
                        maxLength={100}
                        placeholder={referenceRequired ? "Transaction / cheque number" : ""}
                        required={referenceRequired}
                    />
                </label>

                <label className="field">
                    <span>Paid at (optional)</span>
                    <input type="datetime-local" name="paid_at" value={form.paid_at} onChange={handleChange} />
                </label>

                <label className="field">
                    <span>Notes</span>
                    <textarea name="notes" rows={2} value={form.notes} onChange={handleChange} maxLength={255} />
                </label>

                {error && <div className="form-error">{error}</div>}

                <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="primary-button" disabled={busy}>
                        {busy ? "Recording..." : "Record payment"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default RecordPaymentModal;
