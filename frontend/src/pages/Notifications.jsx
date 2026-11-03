import { useEffect, useState } from "react";
import { CheckCheck, Check, Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import useApi from "../hooks/useApi";
import useToast from "../hooks/useToast";
import useRealtime from "../hooks/useRealtime";
import useEventRefresh from "../hooks/useEventRefresh";
import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead
} from "../services/notificationService";
import Pagination from "../components/common/Pagination";
import StateMessage from "../components/common/StateMessage";
import { PAGE_SIZE } from "../config/constants";
import { getErrorMessage } from "../utils/errors";
import { formatDateTime } from "../utils/format";

const ICONS = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle
};

function Notifications() {
    const toast = useToast();
    const { subscribe, emitLocal } = useRealtime();
    const [filter, setFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [live, setLive] = useState([]);
    const [busyId, setBusyId] = useState(null);

    const { data, meta, loading, loaded, error, reload } = useApi(
        () =>
            getNotifications({
                page,
                limit: PAGE_SIZE,
                unread: filter === "unread" ? true : undefined
            }),
        [page, filter]
    );

    useEffect(
        () =>
            subscribe("notification.created", (message) => {
                if (message.kind !== "live" || !message.data) {
                    return;
                }

                setLive((items) => [
                    {
                        ...message.data,
                        created_at: message.at || new Date().toISOString(),
                        read_at: null
                    },
                    ...items.filter((item) => item.id !== message.data.id)
                ].slice(0, PAGE_SIZE));
            }),
        [subscribe]
    );

    useEventRefresh("notification.created", reload, { delay: 3000 });

    const fetched = data || [];
    const fetchedIds = new Set(fetched.map((item) => item.id));
    const items = page === 1
        ? [...live.filter((item) => !fetchedIds.has(item.id)), ...fetched]
        : fetched;

    const changeFilter = (value) => {
        setFilter(value);
        setPage(1);
        setLive([]);
    };

    const markRead = async (item) => {
        setBusyId(item.id);

        try {
            await markNotificationRead(item.id);
            setLive((list) => list.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
            emitLocal("notifications.changed");
            reload();
        } catch (err) {
            toast.error(getErrorMessage(err, "Unable to mark as read"));
        } finally {
            setBusyId(null);
        }
    };

    const markAll = async () => {
        setBusyId("all");

        try {
            const body = await markAllNotificationsRead();
            setLive([]);
            toast.success(body?.message || "All notifications marked as read");
            emitLocal("notifications.changed");
            reload();
        } catch (err) {
            toast.error(getErrorMessage(err, "Unable to mark all as read"));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Notifications</h1>
                    <p>Shared activity feed for all administrators.</p>
                </div>

                <button className="primary-button" onClick={markAll} disabled={busyId === "all"}>
                    <CheckCheck size={16} /> Mark all read
                </button>
            </div>

            <div className="tabs">
                <button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => changeFilter("all")}>
                    All
                </button>
                <button className={`tab ${filter === "unread" ? "active" : ""}`} onClick={() => changeFilter("unread")}>
                    Unread
                </button>
            </div>

            <div className="table-card">
                <StateMessage
                    loading={loading && !loaded}
                    error={error}
                    empty={loaded && !error && items.length === 0}
                    emptyText={filter === "unread" ? "You're all caught up." : "No notifications yet."}
                    onRetry={reload}
                >
                    <ul className="notification-list">
                        {items.map((item) => {
                            const Icon = ICONS[item.severity] || Info;
                            const unread = !item.read_at;

                            return (
                                <li key={item.id} className={`notification-item ${item.severity || "info"} ${unread ? "unread" : ""}`}>
                                    <div className="notification-icon">
                                        <Icon size={18} />
                                    </div>
                                    <div className="notification-body">
                                        <div className="notification-head">
                                            <strong>{item.title}</strong>
                                            <small>{formatDateTime(item.created_at)}</small>
                                        </div>
                                        <p>{item.message}</p>
                                        {item.type && <small className="muted">{item.type}</small>}
                                    </div>
                                    {unread && (
                                        <button
                                            className="action-button text"
                                            onClick={() => markRead(item)}
                                            disabled={busyId === item.id}
                                            title="Mark as read"
                                        >
                                            <Check size={14} /> Read
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </StateMessage>

                <Pagination meta={meta} page={page} onChange={setPage} label="notifications" />
            </div>
        </div>
    );
}

export default Notifications;
