import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import useApi from "../hooks/useApi";
import { getAuditLogs, getUsers } from "../services/userService";
import Pagination from "../components/common/Pagination";
import TableState from "../components/common/TableState";
import { HTTP_METHODS, PAGE_SIZE } from "../config/constants";
import { formatDateTime, formatNumber } from "../utils/format";

const statusTone = (code) => {
    const value = Number(code);

    if (value >= 500) {
        return "danger";
    }

    if (value >= 400) {
        return "warning";
    }

    return "success";
};

function AuditLog() {
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState({ method: "", from: "", to: "", admin_id: "" });

    const { data, meta, loading, loaded, error, reload } = useApi(
        () =>
            getAuditLogs({
                page,
                limit: PAGE_SIZE,
                method: filters.method || undefined,
                from: filters.from || undefined,
                to: filters.to || undefined,
                admin_id: filters.admin_id || undefined
            }),
        [page, filters]
    );

    const admins = useApi(() => getUsers({ limit: 100 }), []);
    const rows = data || [];
    const hasFilters = Object.values(filters).some(Boolean);

    const change = (key) => (e) => {
        setFilters({ ...filters, [key]: e.target.value });
        setPage(1);
    };

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Audit Log</h1>
                    <p>Every change request made by an authenticated administrator.</p>
                </div>
            </div>

            <div className="table-card">
                <div className="table-toolbar">
                    <h3>Entries ({formatNumber(meta?.total ?? rows.length)})</h3>
                    <div className="toolbar-filters">
                        <select className="filter-select" value={filters.admin_id} onChange={change("admin_id")}>
                            <option value="">All admins</option>
                            {(admins.data || []).map((admin) => (
                                <option key={admin.id} value={String(admin.id)}>{admin.name}</option>
                            ))}
                        </select>
                        <select className="filter-select" value={filters.method} onChange={change("method")}>
                            <option value="">All methods</option>
                            {HTTP_METHODS.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <label className="date-filter">
                            From
                            <input type="date" value={filters.from} max={filters.to || undefined} onChange={change("from")} />
                        </label>
                        <label className="date-filter">
                            To
                            <input type="date" value={filters.to} min={filters.from || undefined} onChange={change("to")} />
                        </label>
                        {hasFilters && (
                            <button
                                className="icon-button"
                                title="Clear filters"
                                onClick={() => {
                                    setFilters({ method: "", from: "", to: "", admin_id: "" });
                                    setPage(1);
                                }}
                            >
                                <X size={16} />
                            </button>
                        )}
                        <button className="icon-button" onClick={reload} title="Refresh">
                            <RefreshCw size={16} className={loading ? "spin" : ""} />
                        </button>
                    </div>
                </div>

                <div className={`table-responsive ${loading && loaded ? "refreshing" : ""}`}>
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Admin</th>
                                <th>Method</th>
                                <th>Path</th>
                                <th>Status</th>
                                <th>IP</th>
                                <th>Request ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            <TableState
                                colSpan={7}
                                loading={loading && !loaded}
                                error={error}
                                empty={!error && loaded && rows.length === 0}
                                emptyText="No audit entries found."
                                onRetry={reload}
                            />
                            {!error && rows.map((row) => (
                                <tr key={row.id}>
                                    <td>{formatDateTime(row.created_at)}</td>
                                    <td>{row.admin_name || (row.admin_id ? `#${row.admin_id}` : "-")}</td>
                                    <td><span className={`method-tag ${String(row.method).toLowerCase()}`}>{row.method}</span></td>
                                    <td className="mono">{row.path}</td>
                                    <td><span className={`code-tag ${statusTone(row.status_code)}`}>{row.status_code}</span></td>
                                    <td className="mono">{row.ip || "-"}</td>
                                    <td className="mono muted">{row.request_id || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Pagination meta={meta} page={page} onChange={setPage} label="entries" />
            </div>
        </div>
    );
}

export default AuditLog;
