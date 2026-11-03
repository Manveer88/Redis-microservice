import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, Trash2, Mail, Phone, Calendar, Package } from "lucide-react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import useEventRefresh from "../hooks/useEventRefresh";
import { getSubscriber, updateSubscriberStatus, deleteSubscriber } from "../services/subscriberService";
import { getSubscriptions, cancelSubscription } from "../services/subscriptionService";
import { getInvoices } from "../services/billingService";
import { getSubscriberUsage } from "../services/usageService";
import StatusBadge from "../components/common/StatusBadge";
import StateMessage from "../components/common/StateMessage";
import TableState from "../components/common/TableState";
import Pagination from "../components/common/Pagination";
import ConfirmModal from "../components/common/ConfirmModal";
import ColumnChart from "../components/common/ColumnChart";
import QuotaBar from "../components/common/QuotaBar";
import SubscriberFormModal from "../components/subscribers/SubscriberFormModal";
import NewSubscriptionModal from "../components/subscriptions/NewSubscriptionModal";
import InvoiceModal from "../components/billing/InvoiceModal";
import { getStatusActions, resolveTargetStatus } from "../components/subscribers/statusActions";
import { getOutstanding } from "../components/billing/invoiceUtils";
import { can } from "../utils/permissions";
import { getErrorMessage } from "../utils/errors";
import { formatBytes, formatCurrency, formatDate, formatDateTime } from "../utils/format";

const HISTORY_LIMIT = 10;

const pickCurrent = (active, pending) => {
    const now = Date.now();
    const covering = active.find(
        (s) => new Date(s.start_date).getTime() <= now && new Date(s.end_date).getTime() > now
    );

    return { current: covering || active[0] || null, pending: pending[0] || null };
};

function SubscriberDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const [historyPage, setHistoryPage] = useState(1);
    const [invoicePage, setInvoicePage] = useState(1);
    const [editing, setEditing] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [invoiceId, setInvoiceId] = useState(null);
    const [confirm, setConfirm] = useState(null);

    const profile = useApi(() => getSubscriber(id), [id]);
    const current = useApi(
        () =>
            Promise.all([
                getSubscriptions({ subscriber_id: id, status: "active", limit: 20 }),
                getSubscriptions({ subscriber_id: id, status: "pending", limit: 5 })
            ]).then(([active, pending]) => ({ data: pickCurrent(active.data || [], pending.data || []) })),
        [id]
    );
    const history = useApi(
        () => getSubscriptions({ subscriber_id: id, page: historyPage, limit: HISTORY_LIMIT }),
        [id, historyPage]
    );
    const invoices = useApi(
        () => getInvoices({ subscriber_id: id, page: invoicePage, limit: HISTORY_LIMIT }),
        [id, invoicePage]
    );
    const usage = useApi(() => getSubscriberUsage(id, 30), [id]);

    const reloadAll = () => {
        profile.reload();
        current.reload();
        history.reload();
        invoices.reload();
        usage.reload();
    };

    useEventRefresh(
        ["subscriber.*", "subscription.*", "invoice.*", "payment.*", "usage.*"],
        reloadAll,
        {
            filter: (m) =>
                String(m.payload?.subscriber_id ?? m.data?.subscriber_id) === String(id)
        }
    );

    const subscriber = profile.data;
    const canWrite = can(user, "subscribers.write");
    const canStatus = can(user, "subscribers.status");
    const canDelete = can(user, "subscribers.delete");
    const canSubscribe = can(user, "subscriptions.create");
    const canCancel = can(user, "subscriptions.cancel");

    if (!subscriber) {
        return (
            <div>
                <Link to="/subscribers" className="back-link"><ArrowLeft size={16} /> Back to subscribers</Link>
                <div className="card">
                    <StateMessage loading={profile.loading} error={profile.error} onRetry={profile.reload} />
                </div>
            </div>
        );
    }

    const runStatus = async (action) => {
        const target = resolveTargetStatus(action, subscriber);
        const body = await updateSubscriberStatus(subscriber.id, target);
        toast.success(body?.message || `Subscriber is now ${target}`);
        reloadAll();
    };

    const handleStatus = async (action) => {
        if (action.confirm) {
            setConfirm({
                title: `${action.label} subscriber`,
                message: <p>{action.confirm}</p>,
                confirmLabel: action.label,
                danger: action.danger,
                onConfirm: () => runStatus(action)
            });
            return;
        }

        try {
            await runStatus(action);
        } catch (err) {
            toast.error(getErrorMessage(err, "Unable to update status"));
        }
    };

    const handleDelete = () => {
        setConfirm({
            title: "Delete subscriber",
            message: <p>Permanently delete <strong>{subscriber.name}</strong>? This cannot be undone.</p>,
            confirmLabel: "Delete",
            danger: true,
            onConfirm: async () => {
                const body = await deleteSubscriber(subscriber.id);
                toast.success(body?.message || "Subscriber deleted");
                navigate("/subscribers", { replace: true });
            }
        });
    };

    const handleCancel = (subscription) => {
        setConfirm({
            title: "Cancel subscription",
            message: (
                <p>
                    Cancel subscription #{subscription.id} ({subscription.plan_name})?
                    {subscription.status === "pending" && " Its unpaid invoice will be voided automatically."}
                </p>
            ),
            confirmLabel: "Cancel subscription",
            danger: true,
            reasonLabel: "Reason (optional)",
            onConfirm: async (reason) => {
                const body = await cancelSubscription(subscription.id, reason);
                toast.success(body?.message || "Subscription cancelled");
                reloadAll();
            }
        });
    };

    const currentSub = current.data?.current;
    const pendingSub = current.data?.pending;
    const usageData = usage.data;
    const daily = (usageData?.daily || []).map((day) => ({
        key: day.date,
        label: String(day.date).slice(8, 10),
        value: (Number(day.bytes_in) || 0) + (Number(day.bytes_out) || 0),
        title: `${formatDate(day.date)}: ${formatBytes((Number(day.bytes_in) || 0) + (Number(day.bytes_out) || 0))} (in ${formatBytes(day.bytes_in)}, out ${formatBytes(day.bytes_out)})`
    }));
    const usageTotal = daily.reduce((sum, d) => sum + d.value, 0);
    const period = usageData?.period;

    return (
        <div>
            <Link to="/subscribers" className="back-link"><ArrowLeft size={16} /> Back to subscribers</Link>

            <div className="page-heading">
                <div>
                    <h1>
                        {subscriber.name} <StatusBadge status={subscriber.status} />
                    </h1>
                    <p>@{subscriber.username} · Subscriber #{subscriber.id}</p>
                </div>

                <div className="heading-actions">
                    {canStatus && getStatusActions(subscriber).map((action) => (
                        <button
                            key={action.key}
                            className={action.danger ? "danger-outline-button" : "secondary-button"}
                            onClick={() => handleStatus(action)}
                        >
                            {action.label}
                        </button>
                    ))}
                    {canWrite && (
                        <button className="secondary-button" onClick={() => setEditing(true)}>
                            <Pencil size={15} /> Edit
                        </button>
                    )}
                    {canDelete && (
                        <button className="danger-outline-button" onClick={handleDelete}>
                            <Trash2 size={15} /> Delete
                        </button>
                    )}
                    {canSubscribe && (
                        <button
                            className="primary-button"
                            onClick={() => setSubscribing(true)}
                            disabled={subscriber.status === "suspended" || Boolean(pendingSub)}
                            title={
                                subscriber.status === "suspended"
                                    ? "Suspended subscribers cannot subscribe"
                                    : pendingSub
                                        ? "A subscription is already awaiting payment"
                                        : ""
                            }
                        >
                            <Plus size={16} /> New subscription
                        </button>
                    )}
                </div>
            </div>

            <div className="detail-columns">
                <div className="card">
                    <div className="card-header"><h3>Profile</h3></div>
                    <ul className="profile-list">
                        <li><Mail size={15} /> {subscriber.email || "No email"}</li>
                        <li><Phone size={15} /> {subscriber.mobile || "No mobile"}</li>
                        <li>
                            <Package size={15} />
                            {subscriber.plan_name
                                ? `${subscriber.plan_name}${subscriber.download_speed ? ` · ${subscriber.download_speed}/${subscriber.upload_speed} Mbps` : ""}`
                                : "No plan"}
                        </li>
                        <li><Calendar size={15} /> Expires {formatDate(subscriber.expires_at)}</li>
                        <li><Calendar size={15} /> Joined {formatDate(subscriber.created_at)}</li>
                    </ul>
                </div>

                <div className="card">
                    <div className="card-header"><h3>Current subscription</h3></div>
                    <StateMessage loading={current.loading && !current.loaded} error={current.error}>
                        {currentSub ? (
                            <div className="detail-grid">
                                <div><span>Plan</span><strong>{currentSub.plan_name}</strong></div>
                                <div><span>Status</span><StatusBadge status={currentSub.status} /></div>
                                <div><span>Start</span><strong>{formatDate(currentSub.start_date)}</strong></div>
                                <div><span>End</span><strong>{formatDate(currentSub.end_date)}</strong></div>
                                <div><span>Amount</span><strong>{formatCurrency(currentSub.amount)}</strong></div>
                            </div>
                        ) : (
                            <div className="state-message">No active subscription.</div>
                        )}
                        {pendingSub && (
                            <div className="info-note warning">
                                <span>
                                    Subscription #{pendingSub.id} ({pendingSub.plan_name}, {formatCurrency(pendingSub.amount)}) is
                                    <strong> awaiting payment</strong>. It activates automatically once its invoice is fully paid.
                                </span>
                                {pendingSub.invoice_id && (
                                    <button className="link-button" onClick={() => setInvoiceId(pendingSub.invoice_id)}>
                                        View invoice
                                    </button>
                                )}
                            </div>
                        )}
                    </StateMessage>
                </div>

                <div className="card">
                    <div className="card-header"><h3>Quota this period</h3></div>
                    <StateMessage loading={usage.loading && !usage.loaded} error={usage.error}>
                        {period ? (
                            <>
                                <QuotaBar used={period.used_bytes} limit={period.limit_bytes} percent={period.percent} />
                                <p className="muted small">
                                    {formatDate(period.start_date)} – {formatDate(period.end_date)}
                                </p>
                            </>
                        ) : (
                            <div className="state-message">No active subscription period.</div>
                        )}
                    </StateMessage>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>Usage — last 30 days</h3>
                    <span className="muted">{formatBytes(usageTotal)} total</span>
                </div>
                <StateMessage
                    loading={usage.loading && !usage.loaded}
                    error={usage.error}
                    empty={usage.loaded && daily.length === 0}
                    emptyText="No usage recorded in the last 30 days."
                >
                    <ColumnChart items={daily} format={formatBytes} height={160} />
                </StateMessage>
            </div>

            <div className="table-card spaced">
                <div className="table-toolbar"><h3>Subscription history ({history.meta?.total ?? 0})</h3></div>
                <div className="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Plan</th>
                                <th>Amount</th>
                                <th>Period</th>
                                <th>Status</th>
                                <th>Created</th>
                                {canCancel && <th className="actions-col">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            <TableState
                                colSpan={canCancel ? 7 : 6}
                                loading={history.loading && !history.loaded}
                                error={history.error}
                                empty={!history.error && history.loaded && (history.data || []).length === 0}
                                emptyText="No subscriptions yet."
                                onRetry={history.reload}
                            />
                            {!history.error && (history.data || []).map((s) => (
                                <tr key={s.id}>
                                    <td>#{s.id}</td>
                                    <td>{s.plan_name}</td>
                                    <td>{formatCurrency(s.amount)}</td>
                                    <td>
                                        {formatDate(s.start_date)} – {formatDate(s.end_date)}
                                        {s.status === "pending" && <span className="cell-sub"> (estimate)</span>}
                                    </td>
                                    <td>
                                        <StatusBadge status={s.status} label={s.status === "pending" ? "Awaiting payment" : undefined} />
                                    </td>
                                    <td>{formatDateTime(s.created_at)}</td>
                                    {canCancel && (
                                        <td className="actions-col">
                                            {["pending", "active"].includes(s.status) && (
                                                <button className="action-button text danger" onClick={() => handleCancel(s)}>
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
                <Pagination meta={history.meta} page={historyPage} onChange={setHistoryPage} label="subscriptions" />
            </div>

            <div className="table-card spaced">
                <div className="table-toolbar"><h3>Invoices ({invoices.meta?.total ?? 0})</h3></div>
                <div className="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice</th>
                                <th>Issued</th>
                                <th>Due</th>
                                <th className="num">Amount</th>
                                <th className="num">Outstanding</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <TableState
                                colSpan={6}
                                loading={invoices.loading && !invoices.loaded}
                                error={invoices.error}
                                empty={!invoices.error && invoices.loaded && (invoices.data || []).length === 0}
                                emptyText="No invoices yet."
                                onRetry={invoices.reload}
                            />
                            {!invoices.error && (invoices.data || []).map((invoice) => (
                                <tr key={invoice.id} className="clickable" onClick={() => setInvoiceId(invoice.id)}>
                                    <td className="cell-main">{invoice.invoice_number || `#${invoice.id}`}</td>
                                    <td>{formatDate(invoice.issued_at)}</td>
                                    <td>{formatDate(invoice.due_date)}</td>
                                    <td className="num">{formatCurrency(invoice.amount)}</td>
                                    <td className="num">{invoice.status === "void" ? "-" : formatCurrency(getOutstanding(invoice))}</td>
                                    <td><StatusBadge status={invoice.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination meta={invoices.meta} page={invoicePage} onChange={setInvoicePage} label="invoices" />
            </div>

            {editing && (
                <SubscriberFormModal
                    subscriber={subscriber}
                    onClose={() => setEditing(false)}
                    onSaved={reloadAll}
                />
            )}

            {subscribing && (
                <NewSubscriptionModal
                    subscriber={subscriber}
                    onClose={() => setSubscribing(false)}
                    onCreated={reloadAll}
                />
            )}

            {invoiceId && (
                <InvoiceModal invoiceId={invoiceId} onClose={() => setInvoiceId(null)} onChanged={reloadAll} />
            )}

            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
        </div>
    );
}

export default SubscriberDetail;
