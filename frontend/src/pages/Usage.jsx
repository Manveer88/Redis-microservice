import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Upload, FileUp, KeyRound, RefreshCw } from "lucide-react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import useDebounce from "../hooks/useDebounce";
import useEventRefresh from "../hooks/useEventRefresh";
import { getUsageSummary, importUsageCsv } from "../services/usageService";
import Pagination from "../components/common/Pagination";
import TableState from "../components/common/TableState";
import { API_BASE_URL, PAGE_SIZE } from "../config/constants";
import { can } from "../utils/permissions";
import { getErrorMessage } from "../utils/errors";
import { bytesToGB, formatBytes, formatNumber, toInputDate } from "../utils/format";

const CSV_HEADER = "username,bytes_in,bytes_out,recorded_at,session_id,record_key";

const defaultRange = () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);

    return { from: toInputDate(from), to: toInputDate(to) };
};

const totalBytes = (row) =>
    Number(row.total_bytes ?? (Number(row.bytes_in) || 0) + (Number(row.bytes_out) || 0)) || 0;

function ImportCard({ onImported }) {
    const toast = useToast();
    const inputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);

    const handleFile = (e) => {
        const selected = e.target.files?.[0];
        setResult(null);
        setError("");

        if (!selected) {
            setFile(null);
            return;
        }

        if (!/\.csv$/i.test(selected.name)) {
            setError("Please choose a .csv file.");
            setFile(null);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || "");
            const lines = text.split(/\r?\n/).filter((line) => line.trim());
            setFile({ name: selected.name, size: selected.size, text, rows: Math.max(0, lines.length - 1) });
        };
        reader.onerror = () => setError("Unable to read the file.");
        reader.readAsText(selected);
    };

    const handleImport = async () => {
        if (!file) {
            return;
        }

        setBusy(true);
        setError("");

        try {
            const body = await importUsageCsv(file.text);
            const data = body?.data || {};
            setResult(data);
            toast.success(`Imported ${formatNumber(data.accepted)} records`);
            setFile(null);

            if (inputRef.current) {
                inputRef.current.value = "";
            }

            onImported();
        } catch (err) {
            setError(getErrorMessage(err, "Import failed"));
        } finally {
            setBusy(false);
        }
    };

    const rejected = result?.rejected || [];

    return (
        <div className="card">
            <div className="card-header">
                <h3><FileUp size={17} /> Import CSV</h3>
            </div>

            <p className="muted small">
                Header: <code>{CSV_HEADER}</code> — the last three columns are optional.
            </p>

            <div className="import-row">
                <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFile} />
                <button className="primary-button" onClick={handleImport} disabled={!file || busy}>
                    <Upload size={16} /> {busy ? "Importing..." : "Import"}
                </button>
            </div>

            {file && (
                <p className="muted small">
                    {file.name} · {formatBytes(file.size)} · {formatNumber(file.rows)} data rows
                </p>
            )}

            {error && <div className="form-error">{error}</div>}

            {result && (
                <div className="import-result">
                    <div className="result-pill success">Accepted <strong>{formatNumber(result.accepted)}</strong></div>
                    <div className="result-pill">Duplicates <strong>{formatNumber(result.duplicates)}</strong></div>
                    <div className={`result-pill ${rejected.length ? "danger" : ""}`}>
                        Rejected <strong>{formatNumber(rejected.length)}</strong>
                    </div>

                    {rejected.length > 0 && (
                        <ul className="rejected-list">
                            {rejected.slice(0, 50).map((item) => (
                                <li key={`${item.index}-${item.reason}`}>
                                    Row {Number(item.index) + 1}: {item.reason}
                                </li>
                            ))}
                            {rejected.length > 50 && <li>…and {rejected.length - 50} more</li>}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

function IngestHelp() {
    const example = `POST ${API_BASE_URL || "/api"}/usage/ingest
Content-Type: application/json
x-api-key: <USAGE_INGEST_KEY>

{
  "records": [
    {
      "username": "john.doe",
      "bytes_in": 104857600,
      "bytes_out": 20971520,
      "recorded_at": "2026-11-03T10:15:00Z",
      "session_id": "acct-5f2c",
      "record_key": "nas1-acct-5f2c-0003"
    }
  ]
}`;

    return (
        <div className="card">
            <div className="card-header">
                <h3><KeyRound size={17} /> Ingest API</h3>
            </div>
            <p className="muted small">
                NAS / RADIUS accounting systems can push usage directly. Send up to 1000 records per request with the
                ingest API key in the <code>x-api-key</code> header (configured on the server, never shown here).
                <code>record_key</code> makes retries idempotent.
            </p>
            <pre className="code-block">{example}</pre>
            <p className="muted small">
                Response: <code>{"{ accepted, duplicates, rejected: [{ index, reason }] }"}</code>
            </p>
        </div>
    );
}

function Usage() {
    const { user } = useAuth();
    const [page, setPage] = useState(1);
    const [range, setRange] = useState(defaultRange);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search.trim());

    const { data, meta, loading, loaded, error, reload } = useApi(
        () =>
            getUsageSummary({
                page,
                limit: PAGE_SIZE,
                from: range.from || undefined,
                to: range.to || undefined,
                search: debouncedSearch || undefined
            }),
        [page, range, debouncedSearch]
    );

    useEventRefresh("usage.*", reload, { delay: 1500 });

    const rows = data || [];
    const pageTotal = rows.reduce((sum, row) => sum + totalBytes(row), 0);

    const changeRange = (key) => (e) => {
        setRange({ ...range, [key]: e.target.value });
        setPage(1);
    };

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Usage</h1>
                    <p>Per-subscriber data consumption.</p>
                </div>
            </div>

            <div className="table-card">
                <div className="table-toolbar">
                    <h3>Usage summary ({formatNumber(meta?.total ?? rows.length)})</h3>

                    <div className="toolbar-filters">
                        <div className="search-box">
                            <Search size={17} />
                            <input
                                type="text"
                                placeholder="Search subscriber..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                            />
                        </div>
                        <label className="date-filter">
                            From
                            <input type="date" value={range.from} max={range.to || undefined} onChange={changeRange("from")} />
                        </label>
                        <label className="date-filter">
                            To
                            <input type="date" value={range.to} min={range.from || undefined} onChange={changeRange("to")} />
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
                                <th>Subscriber</th>
                                <th className="num">Bytes in</th>
                                <th className="num">Bytes out</th>
                                <th className="num">Total</th>
                                <th className="num">Total (GB)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <TableState
                                colSpan={5}
                                loading={loading && !loaded}
                                error={error}
                                empty={!error && loaded && rows.length === 0}
                                emptyText="No usage recorded for this period."
                                onRetry={reload}
                            />
                            {!error && rows.map((row) => (
                                <tr key={row.subscriber_id ?? row.username}>
                                    <td>
                                        {row.subscriber_id ? (
                                            <Link to={`/subscribers/${row.subscriber_id}`} className="cell-main link">
                                                {row.name || row.subscriber_name || row.username}
                                            </Link>
                                        ) : (
                                            <span className="cell-main">{row.name || row.username}</span>
                                        )}
                                        {row.username && <div className="cell-sub">@{row.username}</div>}
                                    </td>
                                    <td className="num">{formatBytes(row.bytes_in)}</td>
                                    <td className="num">{formatBytes(row.bytes_out)}</td>
                                    <td className="num">{formatBytes(totalBytes(row))}</td>
                                    <td className="num cell-main">{bytesToGB(totalBytes(row))}</td>
                                </tr>
                            ))}
                            {!error && rows.length > 0 && (
                                <tr className="total-row">
                                    <td colSpan={3}>Page total</td>
                                    <td className="num">{formatBytes(pageTotal)}</td>
                                    <td className="num">{bytesToGB(pageTotal)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <Pagination meta={meta} page={page} onChange={setPage} label="subscribers" />
            </div>

            <div className="two-column-grid">
                {can(user, "usage.import") && <ImportCard onImported={reload} />}
                <IngestHelp />
            </div>
        </div>
    );
}

export default Usage;
