import { formatBytes } from "../../utils/format";

function QuotaBar({ used, limit, percent }) {
    const unlimited = !limit || Number(limit) === 0;
    const value = unlimited
        ? 0
        : Math.min(100, Number(percent ?? (Number(used) / Number(limit)) * 100) || 0);
    const tone = value >= 100 ? "danger" : value >= 80 ? "warning" : "";

    return (
        <div className="quota">
            <div className="quota-head">
                <span>
                    {formatBytes(used)} used
                    {unlimited ? " (Unlimited plan)" : ` of ${formatBytes(limit)}`}
                </span>
                {!unlimited && <strong>{value.toFixed(1)}%</strong>}
            </div>
            <div className="bar-track">
                <div className={`bar-fill ${tone}`} style={{ width: unlimited ? "100%" : `${value}%`, opacity: unlimited ? 0.25 : 1 }} />
            </div>
        </div>
    );
}

export default QuotaBar;
