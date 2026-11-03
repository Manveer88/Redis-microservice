import { formatLabel } from "../../utils/format";

function StatusBadge({ status, label }) {
    return (
        <span className={`status-badge ${status || "unknown"}`}>
            {label || formatLabel(status)}
        </span>
    );
}

export default StatusBadge;
