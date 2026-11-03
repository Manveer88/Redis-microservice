import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, CreditCard, RefreshCw } from "lucide-react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import useEventRefresh from "../hooks/useEventRefresh";
import { getInvoices, getPayments } from "../services/billingService";
import Pagination from "../components/common/Pagination";
import StatusBadge from "../components/common/StatusBadge";
import TableState from "../components/common/TableState";
import SubscriberPicker from "../components/common/SubscriberPicker";
import InvoiceModal from "../components/billing/InvoiceModal";
import RecordPaymentModal from "../components/billing/RecordPaymentModal";
import { canPayInvoice, getOutstanding } from "../components/billing/invoiceUtils";
import { INVOICE_STATUSES, PAGE_SIZE, PAYMENT_METHODS } from "../config/constants";
import { can } from "../utils/permissions";
import { formatCurrency, formatDate, formatDateTime, formatLabel, formatNumber } from "../utils/format";

function InvoicesTab({ onOpen, onPay, canPay }) {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("");
    const [subscriber, setSubscriber] = useState(null);
    const [now] = useState(() => Date.now());

    const { data, meta, loading, loaded, error, reload } = useApi(
        () =>
            getInvoices({
                page,
                limit: PAGE_SIZE,
                status: status || undefined,
                subscriber_id: subscriber?.id || undefined
            }),
        [page, status, subscriber?.id]
    );

    useEventRefresh(["invoice.*", "payment.*"], reload);

    const rows = data || [];
    const colSpan = canPay ? 9 : 8;

    return (
        <div className="table-card">
            <div className="table-toolbar">
                <h3>Invoices ({formatNumber(meta?.total ?? rows.length)})</h3>

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
                        {INVOICE_STATUSES.map((s) => (
                            <option key={s} value={s}>{formatLabel(s)}</option>
                        ))}
                    </select>

                    <button className="icon-button" onClick={reload} title="Refresh">
                        <RefreshCw size={16} className={loading ? "spin" : ""} />
                    </button>
                </div>
            </div>

            <div className={`table-responsive ${loading && loaded ? "refreshing" : ""}`}>
                <table>
                    <thead>
                        <tr>
                            <th>Invoice</th>
                            <th>Subscriber</th>
                            <th>Issued</th>
                            <th>Due</th>
                            <th className="num">Amount</th>
                            <th className="num">Paid</th>
                            <th className="num">Outstanding</th>
                            <th>Status</th>
                            {canPay && <th className="actions-col">Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        <TableState
                            colSpan={colSpan}
                            loading={loading && !loaded}
                            error={error}
                            empty={!error && loaded && rows.length === 0}
                            emptyText="No invoices found."
                            onRetry={reload}
                        />
                        {!error && rows.map((invoice) => {
                            const overdue =
                                ["unpaid", "partial"].includes(invoice.status) &&
                                new Date(invoice.due_date).getTime() < now;

                            return (
                                <tr key={invoice.id} className="clickable" onClick={() => onOpen(invoice.id)}>
                                    <td className="cell-main">{invoice.invoice_number || `#${invoice.id}`}</td>
                                    <td>
                                        <div>{invoice.subscriber_name || `#${invoice.subscriber_id}`}</div>
                                        {invoice.subscriber_username && <div className="cell-sub">@{invoice.subscriber_username}</div>}
                                    </td>
                                    <td>{formatDate(invoice.issued_at)}</td>
                                    <td className={overdue ? "text-danger" : ""}>
                                        {formatDate(invoice.due_date)}
                                        {overdue && <div className="cell-sub text-danger">Overdue</div>}
                                    </td>
                                    <td className="num">{formatCurrency(invoice.amount)}</td>
                                    <td className="num">{formatCurrency(invoice.amount_paid)}</td>
                                    <td className="num">{invoice.status === "void" ? "-" : formatCurrency(getOutstanding(invoice))}</td>
                                    <td><StatusBadge status={invoice.status} /></td>
                                    {canPay && (
                                        <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                                            {canPayInvoice(invoice) && (
                                                <button className="action-button text success" onClick={() => onPay(invoice)}>
                                                    Record payment
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <Pagination meta={meta} page={page} onChange={setPage} label="invoices" />
        </div>
    );
}

function PaymentsTab({ onOpen }) {
    const [page, setPage] = useState(1);
    const [method, setMethod] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    const { data, meta, loading, loaded, error, reload } = useApi(
        () =>
            getPayments({
                page,
                limit: PAGE_SIZE,
                method: method || undefined,
                from: from || undefined,
                to: to || undefined
            }),
        [page, method, from, to]
    );

    useEventRefresh("payment.*", reload);

    const rows = data || [];
    const total = rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const change = (setter) => (e) => {
        setter(e.target.value);
        setPage(1);
    };

    return (
        <div className="table-card">
            <div className="table-toolbar">
                <h3>Payments ({formatNumber(meta?.total ?? rows.length)})</h3>

                <div className="toolbar-filters">
                    <select className="filter-select" value={method} onChange={change(setMethod)}>
                        <option value="">All methods</option>
                        {PAYMENT_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                    <label className="date-filter">
                        From
                        <input type="date" value={from} max={to || undefined} onChange={change(setFrom)} />
                    </label>
                    <label className="date-filter">
                        To
                        <input type="date" value={to} min={from || undefined} onChange={change(setTo)} />
                    </label>
                    <button className="icon-button" onClick={reload} title="Refresh">
                        <RefreshCw size={16} className={loading ? "spin" : ""} />
                    </button>
                </div>
            </div>

            <div className={`table-responsive ${loading && loaded ? "refreshing" : ""}`}>
                <table>
                    <thead>
                        <tr>
                            <th>Paid at</th>
                            <th>Invoice</th>
                            <th>Subscriber</th>
                            <th>Method</th>
                            <th>Reference</th>
                            <th>Notes</th>
                            <th className="num">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <TableState
                            colSpan={7}
                            loading={loading && !loaded}
                            error={error}
                            empty={!error && loaded && rows.length === 0}
                            emptyText="No payments found."
                            onRetry={reload}
                        />
                        {!error && rows.map((payment) => (
                            <tr key={payment.id}>
                                <td>{formatDateTime(payment.paid_at)}</td>
                                <td>
                                    <button className="link-button" onClick={() => onOpen(payment.invoice_id)}>
                                        {payment.invoice_number || `#${payment.invoice_id}`}
                                    </button>
                                </td>
                                <td>
                                    <Link className="link" to={`/subscribers/${payment.subscriber_id}`}>
                                        {payment.subscriber_name || `#${payment.subscriber_id}`}
                                    </Link>
                                </td>
                                <td><span className="method-tag">{formatLabel(payment.method)}</span></td>
                                <td>{payment.reference || "-"}</td>
                                <td className="wrap">{payment.notes || "-"}</td>
                                <td className="num">{formatCurrency(payment.amount)}</td>
                            </tr>
                        ))}
                        {!error && rows.length > 0 && (
                            <tr className="total-row">
                                <td colSpan={6}>Page total</td>
                                <td className="num">{formatCurrency(total)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination meta={meta} page={page} onChange={setPage} label="payments" />
        </div>
    );
}

function Billing() {
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const tab = params.get("tab") === "payments" ? "payments" : "invoices";
    const [invoiceId, setInvoiceId] = useState(null);
    const [paying, setPaying] = useState(null);

    const setTab = (value) => setParams(value === "invoices" ? {} : { tab: value }, { replace: true });

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Billing</h1>
                    <p>Invoices are generated automatically for every new subscription.</p>
                </div>
            </div>

            <div className="tabs">
                <button className={`tab ${tab === "invoices" ? "active" : ""}`} onClick={() => setTab("invoices")}>
                    <FileText size={16} /> Invoices
                </button>
                <button className={`tab ${tab === "payments" ? "active" : ""}`} onClick={() => setTab("payments")}>
                    <CreditCard size={16} /> Payments
                </button>
            </div>

            {tab === "invoices" ? (
                <InvoicesTab
                    onOpen={setInvoiceId}
                    onPay={setPaying}
                    canPay={can(user, "payments.record")}
                />
            ) : (
                <PaymentsTab onOpen={setInvoiceId} />
            )}

            {invoiceId && <InvoiceModal invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />}

            {paying && <RecordPaymentModal invoice={paying} onClose={() => setPaying(null)} />}
        </div>
    );
}

export default Billing;
