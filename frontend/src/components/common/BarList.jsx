function BarList({ items, format = (v) => v, emptyText = "No data" }) {
    const max = Math.max(0, ...items.map((item) => Number(item.value) || 0));

    if (items.length === 0) {
        return <div className="state-message">{emptyText}</div>;
    }

    return (
        <div className="bar-list">
            {items.map((item) => {
                const value = Number(item.value) || 0;
                const percent = max > 0 ? (value / max) * 100 : 0;

                return (
                    <div className="bar-row" key={item.key ?? item.label}>
                        <div className="bar-row-head">
                            <span>{item.label}</span>
                            <strong>{format(value)}</strong>
                        </div>
                        <div className="bar-track">
                            <div className="bar-fill" style={{ width: `${percent}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default BarList;
