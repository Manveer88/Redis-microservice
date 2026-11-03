
import { useEffect, useMemo, useState } from "react";
import {
    Users,
    UserCheck,
    UserX,
    UserMinus,
    Clock,
    Repeat,
    CalendarClock,
    FileWarning,
    IndianRupee,
    Wallet,
    Gauge,
    HardDrive,
    Radio
} from "lucide-react";
import useApi from "../hooks/useApi";
import useRealtime from "../hooks/useRealtime";
import useEventRefresh from "../hooks/useEventRefresh";
import { getDashboard, getRevenue } from "../services/reportService";
import StateMessage from "../components/common/StateMessage";
import ColumnChart from "../components/common/ColumnChart";
import BarList from "../components/common/BarList";
import { formatBytes, formatCurrency, formatNumber, formatTime } from "../utils/format";
import { buildRevenueSeries } from "../utils/charts";
import { describeEvent, eventTone } from "../utils/events";

const FEED_SIZE = 20;

function Dashboard() {
    const dashboard = useApi(() => getDashboard(), []);
    const revenue = useApi(() => getRevenue(12), []);
    const { subscribe, getRecentEvents, status } = useRealtime();
    const [feed, setFeed] = useState(() =>
        getRecentEvents().filter((m) => m.kind === "event").slice(0, FEED_SIZE)
    );

    useEffect(
        () =>
            subscribe("*", (message) => {
                if (message.kind !== "event") {
                    return;
                }

                setFeed((items) =>
                    [message, ...items.filter((item) => item.id !== message.id)].slice(0, FEED_SIZE)
                );
            }),
        [subscribe]
    );

    useEventRefresh(
        "*",
        () => {
            dashboard.reload();
            revenue.reload();
        },
        { filter: (m) => m.kind !== "local" }
    );

    const d = dashboard.data;
    const revenueSeries = useMemo(() => buildRevenueSeries(revenue.data, 12), [revenue.data]);

    const stats = d
        ? [
            { title: "Total Subscribers", value: formatNumber(d.subscribers?.total), icon: Users },
            { title: "Active Subscribers", value: formatNumber(d.subscribers?.active), icon: UserCheck, tone: "green" },
            { title: "Inactive Subscribers", value: formatNumber(d.subscribers?.inactive), icon: UserMinus, tone: "grey" },
            { title: "Suspended Subscribers", value: formatNumber(d.subscribers?.suspended), icon: UserX, tone: "red" },
            { title: "Pending Subscriptions", value: formatNumber(d.subscriptions?.pending), icon: Clock, tone: "amber", hint: "Awaiting payment" },
            { title: "Active Subscriptions", value: formatNumber(d.subscriptions?.active), icon: Repeat, tone: "green" },
            { title: "Expiring in 7 Days", value: formatNumber(d.subscriptions?.expiring_7d), icon: CalendarClock, tone: "amber" },
            {
                title: "Unpaid Invoices",
                value: formatNumber(d.invoices?.unpaid_count),
                icon: FileWarning,
                tone: "red",
                hint: `${formatCurrency(d.invoices?.unpaid_amount)} outstanding`
            },
            { title: "Revenue Today", value: formatCurrency(d.revenue?.today), icon: IndianRupee, tone: "green" },
            {
                title: "Revenue This Month",
                value: formatCurrency(d.revenue?.month),
                icon: Wallet,
                tone: "green",
                hint: d.revenue?.total !== undefined ? `${formatCurrency(d.revenue.total)} all time` : undefined
            },
            { title: "Usage Today", value: formatBytes(d.usage?.today_bytes), icon: Gauge },
            { title: "Usage This Month", value: formatBytes(d.usage?.month_bytes), icon: HardDrive }
        ]
        : [];

    const planItems = (d?.plans || []).map((plan) => ({
        key: plan.plan_id ?? plan.name,
        label: plan.name || "No plan",
        value: Number(plan.subscribers) || 0
    }));

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Dashboard</h1>
                    <p>Overview of subscribers, billing and network usage.</p>
                </div>
            </div>

            <StateMessage
                loading={dashboard.loading && !dashboard.loaded}
                error={!d ? dashboard.error : ""}
                onRetry={dashboard.reload}
            >
                <div className="stats-grid">
                    {stats.map((stat) => {
                        const Icon = stat.icon;

                        return (
                            <div className="stat-card" key={stat.title}>
                                <div className={`stat-icon ${stat.tone || ""}`}>
                                    <Icon size={22} />
                                </div>

                                <p>{stat.title}</p>
                                <h2>{stat.value}</h2>
                                {stat.hint && <small className="stat-hint">{stat.hint}</small>}
                            </div>
                        );
                    })}
                </div>
            </StateMessage>

            <div className="dashboard-grid">
                <div className="card">
                    <div className="card-header">
                        <h3>Revenue — last 12 months</h3>
                        <span className="muted">
                            {formatCurrency(revenueSeries.reduce((sum, item) => sum + item.value, 0))}
                        </span>
                    </div>
                    <StateMessage
                        loading={revenue.loading && !revenue.loaded}
                        error={!revenue.data ? revenue.error : ""}
                        onRetry={revenue.reload}
                    >
                        <ColumnChart items={revenueSeries} format={(v) => formatCurrency(v).replace(/\.00$/, "")} />
                    </StateMessage>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Plan distribution</h3>
                        <span className="muted">subscribers per plan</span>
                    </div>
                    <StateMessage loading={dashboard.loading && !dashboard.loaded} error={!d ? dashboard.error : ""}>
                        <BarList items={planItems} format={formatNumber} emptyText="No plans yet." />
                    </StateMessage>
                </div>
            </div>

            <div className="card activity-card">
                <div className="card-header">
                    <h3><Radio size={17} /> Live activity</h3>
                    <span className={`live-pill ${status}`}>{status === "live" ? "Live" : "Offline"}</span>
                </div>

                {feed.length === 0 ? (
                    <div className="state-message">
                        {status === "live"
                            ? "Waiting for activity... new events will appear here instantly."
                            : "Realtime connection is offline. Activity will appear once connected."}
                    </div>
                ) : (
                    <ul className="activity-feed">
                        {feed.map((event) => (
                            <li key={event.id} className={`activity-item ${eventTone(event.type)}`}>
                                <span className="activity-dot" />
                                <div>
                                    <p>{describeEvent(event)}</p>
                                    <small>{event.type} · {formatTime(event.occurredAt)}</small>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
