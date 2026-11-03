function ColumnChart({ items, format = (v) => v, height = 180, emptyText = "No data" }) {
    const max = Math.max(0, ...items.map((item) => Number(item.value) || 0));

    if (items.length === 0) {
        return <div className="state-message">{emptyText}</div>;
    }

    return (
        <div className="column-chart" style={{ height }}>
            {items.map((item) => {
                const value = Number(item.value) || 0;
                const percent = max > 0 ? (value / max) * 100 : 0;

                return (
                    <div className="column" key={item.key ?? item.label} title={item.title || `${item.label}: ${format(value)}`}>
                        <div className="column-track">
                            <span className="column-value">{value > 0 ? format(value) : ""}</span>
                            <div
                                className={`column-bar ${item.tone || ""}`}
                                style={{ height: `${Math.max(percent, value > 0 ? 2 : 0)}%` }}
                            />
                        </div>
                        <span className="column-label">{item.label}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default ColumnChart;
