import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, TrendingUp, CalendarClock, Gauge } from "lucide-react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import useEventRefresh from "../hooks/useEventRefresh";
import { getRevenue, getExpiring, getTopUsage, downloadExport } from "../services/reportService";
import StateMessage from "../components/common/StateMessage";
import ColumnChart from "../components/common/ColumnChart";
import BarList from "../components/common/BarList";
import Pagination from "../components/common/Pagination";
import TableState from "../components/common/TableState";
import { EXPORT_TYPES } from "../config/constants";
import { can } from "../utils/permissions";
import { getBlobErrorMessage } from "../utils/errors";
import { buildRevenueSeries } from "../utils/charts";
import { formatBytes, formatCurrency, formatDate, formatNumber } from "../utils/format";

const listOf = (data) => (Array.isArray(data) ? data : data?.items || data?.rows || []);

const usageTotal = (row) =>
    Number(row.total_bytes ?? (Number(row.bytes_in) || 0) + (Number(row.bytes_out) || 0)) || 0;

function Selector({ value, options, onChange, suffix }) {
    return (
        <select className="filter-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
            {options.map((option) => (
                <option key={option} value={option}>{option} {suffix}</option>
            ))}
        </select>
    );
}

function Reports() {
    const { user } = useAuth();
    const toast = useToast();
    const [months, setMonths] = useState(12);
    const [days, setDays] = useState(7);
    const [expiringPage, setExpiringPage] = useState(1);
    const [usageDays, setUsageDays] = useState(30);
    const [exporting, setExporting] = useState("");

    const revenue = useApi(() => getRevenue(months), [months]);
    const expiring = useApi(() => getExpiring(days, { page: expiringPage, limit: 10 }), [days, expiringPage]);
    const topUsage = useApi(() => getTopUsage(usageDays, 10), [usageDays]);

    useEventRefresh(["payment.*", "invoice.*"], revenue.reload, { delay: 1000 });
    useEventRefresh(["subscription.*"], expiring.reload, { delay: 1000 });
    useEventRefresh(["usage.*"], topUsage.reload, { delay: 3000 });

    const series = useMemo(() => buildRevenueSeries(revenue.data, months), [revenue.data, months]);
    const revenueTotal = series.reduce((sum, item) => sum + item.value, 0);
    const expiringRows = listOf(expiring.data);
    const usageItems = listOf(topUsage.data).map((row) => ({
        key: row.subscriber_id ?? row.username,
        label: `${row.name || row.subscriber_name || row.username}${row.username ? ` (@${row.username})` : ""}`,
        value: usageTotal(row)
    }));

    const handleExport = async (type) => {
        setExporting(type);

        try {
            const filename = await downloadExport(type);
            toast.success(`Downloaded ${filename}`);
        } catch (err) {
            toast.error(await getBlobErrorMessage(err, "Export failed"));
        } finally {
            setExporting("");
        }
    };

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Reports</h1>
                    <p>Revenue trends, expiring subscriptions and top data users.</p>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3><TrendingUp size={17} /> Revenue</h3>
                    <div className="heading-actions">
                        <span className="muted">Total {formatCurrency(revenueTotal)}</span>
                        <Selector value={months} options={[3, 6, 12, 24]} onChange={setMonths} suffix="months" />
                    </div>
                </div>
                <StateMessage
                    loading={revenue.loading && !revenue.loaded}
                    error={!revenue.data ? revenue.error : ""}
                    onRetry={revenue.reload}
                >
                    <ColumnChart items={series} format={(v) => formatCurrency(v).replace(/\.00$/, "")} height={220} />
                </StateMessage>
            </div>

            <div className="two-column-grid">
                <div className="table-card">
                    <div className="table-toolbar">
                        <h3><CalendarClock size={17} /> Expiring subscriptions</h3>
                        <Selector
                            value={days}
                            options={[3, 7, 14, 30]}
                            onChange={(value) => {
                                setDays(value);
                                setExpiringPage(1);
                            }}
                            suffix="days"
                        />
                    </div>
                    <div className="table-responsive">
                        <table>
                            <thead>
                                <tr>
                                    <th>Subscriber</th>
                                    <th>Plan</th>
                                    <th>Ends</th>
                                </tr>
                            </thead>
                            <tbody>
                                <TableState
                                    colSpan={3}
                                    loading={expiring.loading && !expiring.loaded}
                                    error={expiring.error}
                                    empty={!expiring.error && expiring.loaded && expiringRows.length === 0}
                                    emptyText={`Nothing expires in the next ${days} days.`}
                                    onRetry={expiring.reload}
                                />
                                {!expiring.error && expiringRows.map((row) => (
                                    <tr key={row.subscription_id ?? row.id ?? row.subscriber_id}>
                                        <td>
                                            <Link className="cell-main link" to={`/subscribers/${row.subscriber_id}`}>
                                                {row.subscriber_name || row.name || `#${row.subscriber_id}`}
                                            </Link>
                                            {(row.subscriber_username || row.username) && (
                                                <div className="cell-sub">@{row.subscriber_username || row.username}</div>
                                            )}
                                        </td>
                                        <td>{row.plan_name || "-"}</td>
                                        <td>{formatDate(row.end_date || row.expires_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination meta={expiring.meta} page={expiringPage} onChange={setExpiringPage} label="subscriptions" />
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3><Gauge size={17} /> Top usage</h3>
                        <Selector value={usageDays} options={[7, 30, 90]} onChange={setUsageDays} suffix="days" />
                    </div>
                    <StateMessage
                        loading={topUsage.loading && !topUsage.loaded}
                        error={topUsage.error}
                        empty={topUsage.loaded && !topUsage.error && usageItems.length === 0}
                        emptyText="No usage in this period."
                        onRetry={topUsage.reload}
                    >
                        <BarList items={usageItems} format={formatBytes} />
                    </StateMessage>
                </div>
            </div>

            {can(user, "reports.export") && (
                <div className="card">
                    <div className="card-header">
                        <h3><Download size={17} /> CSV exports</h3>
                    </div>
                    <div className="export-grid">
                        {EXPORT_TYPES.map((type) => (
                            <button
                                key={type.value}
                                className="secondary-button"
                                onClick={() => handleExport(type.value)}
                                disabled={Boolean(exporting)}
                            >
                                <Download size={15} />
                                {exporting === type.value ? "Preparing..." : type.label}
                            </button>
                        ))}
                    </div>
                    <p className="muted small">
                        Exports reflect current data. {formatNumber(EXPORT_TYPES.length)} datasets available.
                    </p>
                </div>
            )}
        </div>
    );
}

export default Reports;
