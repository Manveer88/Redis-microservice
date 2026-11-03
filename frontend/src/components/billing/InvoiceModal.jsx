import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Ban } from "lucide-react";
import Modal from "../common/Modal";
import ConfirmModal from "../common/ConfirmModal";
import StatusBadge from "../common/StatusBadge";
import StateMessage from "../common/StateMessage";
import RecordPaymentModal from "./RecordPaymentModal";
import useApi from "../../hooks/useApi";
import useAuth from "../../hooks/useAuth";
import useToast from "../../hooks/useToast";
import useEventRefresh from "../../hooks/useEventRefresh";
import { getInvoice, voidInvoice } from "../../services/billingService";
import { can } from "../../utils/permissions";
import { formatCurrency, formatDate, formatDateTime, formatLabel } from "../../utils/format";
import { canPayInvoice, canVoidInvoice, getOutstanding } from "./invoiceUtils";

function InvoiceModal({ invoiceId, onClose, onChanged }) {
    const { user } = useAuth();
    const toast = useToast();
    const [paying, setPaying] = useState(false);
    const [voiding, setVoiding] = useState(false);

    const { data: invoice, loading, loaded, error, reload } = useApi(() => getInvoice(invoiceId), [invoiceId]);

    useEventRefresh(["invoice.*", "payment.*"], reload, {
        filter: (m) => String(m.payload?.invoice_id) === String(invoiceId)
    });

    const handleChanged = () => {
        reload();
        onChanged?.();
    };

    const payments = invoice?.payments || [];
    const outstanding = getOutstanding(invoice);

    return (
        <>
            <Modal
                title={invoice?.invoice_number || `Invoice #${invoiceId}`}
                subtitle={invoice ? `Issued ${formatDate(invoice.issued_at)} · Due ${formatDate(invoice.due_date)}` : undefined}
                onClose={onClose}
                size="lg"
            >
                <StateMessage loading={loading && !loaded} error={!invoice ? error : ""} onRetry={reload}>
                    {invoice && (
                        <div className="invoice-detail">
                            <div className="detail-grid">
                                <div>
                                    <span>Subscriber</span>
                                    <strong>
                                        <Link to={`/subscribers/${invoice.subscriber_id}`} onClick={onClose}>
                                            {invoice.subscriber_name || `#${invoice.subscriber_id}`}
                                        </Link>
                                    </strong>
                                    {invoice.subscriber_username && <small>@{invoice.subscriber_username}</small>}
                                </div>
                                <div>
                                    <span>Status</span>
                                    <StatusBadge status={invoice.status} />
                                </div>
                                <div>
                                    <span>Subscription</span>
                                    <strong>#{invoice.subscription_id}</strong>
                                </div>
                                <div>
                                    <span>Amount</span>
                                    <strong>{formatCurrency(invoice.amount)}</strong>
                                </div>
                                <div>
                                    <span>Paid</span>
                                    <strong>{formatCurrency(invoice.amount_paid)}</strong>
                                </div>
                                <div>
                                    <span>Outstanding</span>
                                    <strong className={outstanding > 0 && invoice.status !== "void" ? "text-danger" : ""}>
                                        {invoice.status === "void" ? "-" : formatCurrency(outstanding)}
                                    </strong>
                                </div>
                                {invoice.paid_at && (
                                    <div>
                                        <span>Paid at</span>
                                        <strong>{formatDateTime(invoice.paid_at)}</strong>
                                    </div>
                                )}
                                {invoice.status === "void" && (
                                    <div>
                                        <span>Voided</span>
                                        <strong>{formatDateTime(invoice.voided_at)}</strong>
                                        {invoice.void_reason && <small>{invoice.void_reason}</small>}
                                    </div>
                                )}
                            </div>

                            <h4 className="section-title">Payments ({payments.length})</h4>
                            <div className="table-responsive bordered">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Method</th>
                                            <th>Reference</th>
                                            <th>Notes</th>
                                            <th className="num">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="empty-state">No payments recorded yet.</td>
                                            </tr>
                                        ) : (
                                            payments.map((payment) => (
                                                <tr key={payment.id}>
                                                    <td>{formatDateTime(payment.paid_at)}</td>
                                                    <td>{formatLabel(payment.method)}</td>
                                                    <td>{payment.reference || "-"}</td>
                                                    <td className="wrap">{payment.notes || "-"}</td>
                                                    <td className="num">{formatCurrency(payment.amount)}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {error && <div className="form-error">{error}</div>}

                            <div className="modal-actions">
                                {can(user, "invoices.void") && canVoidInvoice(invoice) && (
                                    <button type="button" className="danger-button" onClick={() => setVoiding(true)}>
                                        <Ban size={15} /> Void invoice
                                    </button>
                                )}
                                {can(user, "payments.record") && canPayInvoice(invoice) && (
                                    <button type="button" className="primary-button" onClick={() => setPaying(true)}>
                                        <CreditCard size={15} /> Record payment
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </StateMessage>
            </Modal>

            {paying && invoice && (
                <RecordPaymentModal
                    invoice={invoice}
                    onClose={() => setPaying(false)}
                    onRecorded={handleChanged}
                />
            )}

            {voiding && invoice && (
                <ConfirmModal
                    title="Void invoice"
                    message={`Void ${invoice.invoice_number || `invoice #${invoice.id}`}? This cannot be undone.`}
                    confirmLabel="Void invoice"
                    danger
                    reasonLabel="Reason (optional)"
                    onConfirm={async (reason) => {
                        const body = await voidInvoice(invoice.id, reason);
                        toast.success(body?.message || "Invoice voided");
                        handleChanged();
                    }}
                    onClose={() => setVoiding(false)}
                />
            )}
        </>
    );
}

export default InvoiceModal;
