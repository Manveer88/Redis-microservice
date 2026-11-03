import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, Info, FileText } from "lucide-react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import useEventRefresh from "../hooks/useEventRefresh";
import { getSubscriptions, cancelSubscription } from "../services/subscriptionService";
import Pagination from "../components/common/Pagination";
import StatusBadge from "../components/common/StatusBadge";
import TableState from "../components/common/TableState";
import ConfirmModal from "../components/common/ConfirmModal";
import SubscriberPicker from "../components/common/SubscriberPicker";
import NewSubscriptionModal from "../components/subscriptions/NewSubscriptionModal";
import InvoiceModal from "../components/billing/InvoiceModal";
import { PAGE_SIZE, SUBSCRIPTION_STATUSES } from "../config/constants";
import { can } from "../utils/permissions";
import { formatCurrency, formatDate, formatLabel, formatNumber } from "../utils/format";

function Subscriptions() {
    const { user } = useAuth();
    const toast = useToast();
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("");
    const [subscriber, setSubscriber] = useState(null);
    const [creating, setCreating] = useState(false);
    const [cancelling, setCancelling] = useState(null);
    const [invoiceId, setInvoiceId] = useState(null);

    const { data, meta, loading, loaded, error, reload } = useApi(
        () =>
            getSubscriptions({
                page,
                limit: PAGE_SIZE,
                status: status || undefined,
                subscriber_id: subscriber?.id || undefined
            }),
        [page, status, subscriber?.id]
    );

    useEventRefresh(["subscription.*", "invoice.created", "invoice.paid", "invoice.voided"], reload);

    const canCreate = can(user, "subscriptions.create");
    const canCancel = can(user, "subscriptions.cancel");
    const rows = data || [];

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Subscriptions</h1>
                    <p>Plan purchases and renewals for your subscribers.</p>
                </div>

                <div className="heading-actions">
                    <button className="secondary-button" onClick={reload}>
                        <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
                    </button>
                    {canCreate && (
                        <button className="primary-button" onClick={() => setCreating(true)}>
                            <Plus size={16} /> New subscription
                        </button>
                    )}
                </div>
            </div>

            <div className="info-note banner">
                <Info size={17} />
                <span>
                    New subscriptions start as <strong>pending</strong> with an invoice issued automatically.
                    Activation happens automatically when the invoice is fully paid — record payments from Billing.
                </span>
            </div>

            <div className="table-card">
                <div className="table-toolbar">
                    <h3>All Subscriptions ({formatNumber(meta?.total ?? rows.length)})</h3>

                    <div className="toolbar-filters">
                        <div className="picker-inline">
                            <SubscriberPicker
                                value={subscriber}
                                onChange={(value) => {
                                    setSubscriber(value);
                                    setPage(1);
                                }}
                                placeholder="Filter by subscriber..."
                            />
                        </div>

                        <select
                            className="filter-select"
                            value={status}
                            onChange={(e) => {
                                setStatus(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All statuses</option>
                            {SUBSCRIPTION_STATUSES.map((s) => (
                                <option key={s} value={s}>{formatLabel(s)}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={`table-responsive ${loading && loaded ? "refreshing" : ""}`}>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Subscriber</th>
                                <th>Plan</th>
                                <th className="num">Amount</th>
                                <th>Period</th>
                                <th>Status</th>
                                <th>Invoice</th>
                                {canCancel && <th className="actions-col">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            <TableState
                                colSpan={canCancel ? 8 : 7}
                                loading={loading && !loaded}
                                error={error}
                                empty={!error && loaded && rows.length === 0}
                                emptyText="No subscriptions found."
                                onRetry={reload}
                            />
                            {!error && rows.map((s) => (
                                <tr key={s.id}>
                                    <td>#{s.id}</td>
                                    <td>
                                        <Link to={`/subscribers/${s.subscriber_id}`} className="cell-main link">
                                            {s.subscriber_name || `#${s.subscriber_id}`}
                                        </Link>
                                        {(s.subscriber_username || s.username) && <div className="cell-sub">@{s.subscriber_username || s.username}</div>}
                                    </td>
                                    <td>{s.plan_name || `#${s.plan_id}`}</td>
                                    <td className="num">{formatCurrency(s.amount)}</td>
                                    <td>
                                        {formatDate(s.start_date)} – {formatDate(s.end_date)}
                                        {s.status === "pending" && <div className="cell-sub">estimated</div>}
                                    </td>
                                    <td>
                                        <StatusBadge status={s.status} label={s.status === "pending" ? "Awaiting payment" : undefined} />
                                        {s.status === "cancelled" && s.cancel_reason && (
                                            <div className="cell-sub" title={s.cancel_reason}>{s.cancel_reason}</div>
                                        )}
                                    </td>
                                    <td>
                                        {s.invoice_id ? (
                                            <button className="link-button" onClick={() => setInvoiceId(s.invoice_id)}>
                                                <FileText size={14} /> View
                                            </button>
                                        ) : s.status === "pending" ? (
                                            <span className="cell-sub">Generating...</span>
                                        ) : (
                                            "-"
                                        )}
                                    </td>
                                    {canCancel && (
                                        <td className="actions-col">
                                            {["pending", "active"].includes(s.status) && (
                                                <button className="action-button text danger" onClick={() => setCancelling(s)}>
                                                    Cancel
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Pagination meta={meta} page={page} onChange={setPage} label="subscriptions" />
            </div>

            {creating && <NewSubscriptionModal onClose={() => setCreating(false)} onCreated={reload} />}

            {cancelling && (
                <ConfirmModal
                    title="Cancel subscription"
                    message={
                        <p>
                            Cancel subscription #{cancelling.id} for <strong>{cancelling.subscriber_name}</strong> ({cancelling.plan_name})?
                            {cancelling.status === "pending" && " Its invoice will be voided automatically if nothing has been paid."}
                        </p>
                    }
                    confirmLabel="Cancel subscription"
                    danger
                    reasonLabel="Reason (optional)"
                    onConfirm={async (reason) => {
                        const body = await cancelSubscription(cancelling.id, reason);
                        toast.success(body?.message || "Subscription cancelled");
                        reload();
                    }}
                    onClose={() => setCancelling(null)}
                />
            )}

            {invoiceId && <InvoiceModal invoiceId={invoiceId} onClose={() => setInvoiceId(null)} onChanged={reload} />}
        </div>
    );
}

export default Subscriptions;
