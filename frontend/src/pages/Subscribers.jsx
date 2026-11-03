
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import useDebounce from "../hooks/useDebounce";
import useEventRefresh from "../hooks/useEventRefresh";
import { getSubscribers, updateSubscriberStatus, deleteSubscriber } from "../services/subscriberService";
import { getPlans } from "../services/planService";
import Pagination from "../components/common/Pagination";
import StatusBadge from "../components/common/StatusBadge";
import TableState from "../components/common/TableState";
import ConfirmModal from "../components/common/ConfirmModal";
import SubscriberFormModal from "../components/subscribers/SubscriberFormModal";
import { getStatusActions, resolveTargetStatus } from "../components/subscribers/statusActions";
import { PAGE_SIZE, SUBSCRIBER_STATUSES } from "../config/constants";
import { can } from "../utils/permissions";
import { getErrorMessage } from "../utils/errors";
import { formatDate, formatLabel, formatNumber } from "../utils/format";

function Subscribers() {
    const { user } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [planId, setPlanId] = useState("");
    const [editing, setEditing] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const debouncedSearch = useDebounce(search.trim());

    const { data, meta, loading, loaded, error, reload } = useApi(
        () =>
            getSubscribers({
                page,
                limit: PAGE_SIZE,
                search: debouncedSearch || undefined,
                status: status || undefined,
                plan_id: planId || undefined
            }),
        [page, debouncedSearch, status, planId]
    );

    const plansState = useApi(() => getPlans({ limit: 100 }), []);

    useEventRefresh(["subscriber.*", "subscription.activated", "subscription.cancelled", "subscription.expired", "plan.*"], reload);

    const canWrite = can(user, "subscribers.write");
    const canStatus = can(user, "subscribers.status");
    const canDelete = can(user, "subscribers.delete");
    const subscribers = data || [];

    const applyStatus = async (subscriber, action) => {
        const target = resolveTargetStatus(action, subscriber);
        const body = await updateSubscriberStatus(subscriber.id, target);
        toast.success(body?.message || `${subscriber.name} is now ${target}`);
        reload();
    };

    const handleStatus = async (subscriber, action) => {
        if (action.confirm) {
            setConfirm({
                title: `${action.label} subscriber`,
                message: (
                    <>
                        <p>{action.label} <strong>{subscriber.name}</strong> (@{subscriber.username})?</p>
                        <p className="muted">{action.confirm}</p>
                    </>
                ),
                confirmLabel: action.label,
                danger: action.danger,
                onConfirm: () => applyStatus(subscriber, action)
            });
            return;
        }

        try {
            await applyStatus(subscriber, action);
        } catch (err) {
            toast.error(getErrorMessage(err, "Unable to update status"));
        }
    };

    const handleDelete = (subscriber) => {
        setConfirm({
            title: "Delete subscriber",
            message: (
                <p>
                    Permanently delete <strong>{subscriber.name}</strong> (@{subscriber.username})?
                    Subscribers with subscriptions or invoices cannot be deleted.
                </p>
            ),
            confirmLabel: "Delete",
            danger: true,
            onConfirm: async () => {
                const body = await deleteSubscriber(subscriber.id);
                toast.success(body?.message || "Subscriber deleted");
                reload();
            }
        });
    };

    const changeFilter = (setter) => (e) => {
        setter(e.target.value);
        setPage(1);
    };

    const colSpan = canStatus || canWrite || canDelete ? 7 : 6;

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Subscribers</h1>
                    <p>Manage your network subscribers.</p>
                </div>

                <div className="heading-actions">
                    <button className="secondary-button" onClick={reload}>
                        <RefreshCw size={16} className={loading ? "spin" : ""} />
                        Refresh
                    </button>

                    {canWrite && (
                        <button className="primary-button" onClick={() => setEditing({})}>
                            <Plus size={16} />
                            New Subscriber
                        </button>
                    )}
                </div>
            </div>

            <div className="table-card">
                <div className="table-toolbar">
                    <h3>All Subscribers ({formatNumber(meta?.total ?? subscribers.length)})</h3>

                    <div className="toolbar-filters">
                        <div className="search-box">
                            <Search size={17} />

                            <input
                                type="text"
                                placeholder="Search name, username, email, mobile..."
                                value={search}
                                onChange={changeFilter(setSearch)}
                            />
                        </div>

                        <select className="filter-select" value={status} onChange={changeFilter(setStatus)}>
                            <option value="">All statuses</option>
                            {SUBSCRIBER_STATUSES.map((s) => (
                                <option key={s} value={s}>{formatLabel(s)}</option>
                            ))}
                        </select>

                        <select className="filter-select" value={planId} onChange={changeFilter(setPlanId)}>
                            <option value="">All plans</option>
                            {(plansState.data || []).map((plan) => (
                                <option key={plan.id} value={String(plan.id)}>{plan.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={`table-responsive ${loading && loaded ? "refreshing" : ""}`}>
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Contact</th>
                                <th>Plan</th>
                                <th>Speed</th>
                                <th>Expires</th>
                                <th>Status</th>
                                {colSpan === 7 && <th className="actions-col">Actions</th>}
                            </tr>
                        </thead>

                        <tbody>
                            <TableState
                                colSpan={colSpan}
                                loading={loading && !loaded}
                                error={error}
                                empty={!error && loaded && subscribers.length === 0}
                                emptyText="No subscribers found."
                                onRetry={reload}
                            />

                            {!error && subscribers.map((subscriber) => (
                                <tr
                                    key={subscriber.id}
                                    className="clickable"
                                    onClick={() => navigate(`/subscribers/${subscriber.id}`)}
                                >
                                    <td>
                                        <div className="cell-main">{subscriber.name}</div>
                                        <div className="cell-sub">@{subscriber.username}</div>
                                    </td>
                                    <td>
                                        <div>{subscriber.email || "-"}</div>
                                        <div className="cell-sub">{subscriber.mobile || ""}</div>
                                    </td>
                                    <td>{subscriber.plan_name || "-"}</td>
                                    <td>
                                        {subscriber.download_speed
                                            ? `${subscriber.download_speed}/${subscriber.upload_speed} Mbps`
                                            : "-"}
                                    </td>
                                    <td>{formatDate(subscriber.expires_at)}</td>
                                    <td>
                                        <StatusBadge status={subscriber.status} />
                                    </td>
                                    {colSpan === 7 && (
                                        <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                                            <div className="table-actions">
                                                {canWrite && (
                                                    <button
                                                        className="action-button"
                                                        title="Edit"
                                                        onClick={() => setEditing(subscriber)}
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                                {canStatus && getStatusActions(subscriber).map((action) => (
                                                    <button
                                                        key={action.key}
                                                        className={`action-button text ${action.danger ? "danger" : action.tone || ""}`}
                                                        onClick={() => handleStatus(subscriber, action)}
                                                    >
                                                        {action.label}
                                                    </button>
                                                ))}
                                                {canDelete && (
                                                    <button
                                                        className="action-button danger"
                                                        title="Delete"
                                                        onClick={() => handleDelete(subscriber)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Pagination meta={meta} page={page} onChange={setPage} label="subscribers" />
            </div>

            {editing && (
                <SubscriberFormModal
                    subscriber={editing.id ? editing : null}
                    onClose={() => setEditing(null)}
                    onSaved={reload}
                />
            )}

            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
        </div>
    );
}

export default Subscribers;
