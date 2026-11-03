import { useState } from "react";
import { Search, X } from "lucide-react";
import useApi from "../../hooks/useApi";
import useDebounce from "../../hooks/useDebounce";
import { getSubscribers } from "../../services/subscriberService";

function SubscriberPicker({ value, onChange, placeholder = "Search subscriber by name, username...", disabled }) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const search = useDebounce(query.trim(), 300);

    const { data, loading, error } = useApi(
        () => getSubscribers({ search, limit: 8 }),
        [search],
        { enabled: open && search.length > 0 }
    );

    if (value) {
        return (
            <div className="picker-selected">
                <div>
                    <strong>{value.name}</strong>
                    <span>@{value.username}{value.status ? ` · ${value.status}` : ""}</span>
                </div>
                {!disabled && (
                    <button type="button" className="icon-button small" onClick={() => onChange(null)} aria-label="Clear">
                        <X size={14} />
                    </button>
                )}
            </div>
        );
    }

    const results = data || [];

    return (
        <div className="picker">
            <div className="search-box">
                <Search size={16} />
                <input
                    type="text"
                    value={query}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                />
            </div>

            {open && search.length > 0 && (
                <div className="picker-menu">
                    {loading && <div className="picker-item muted">Searching...</div>}
                    {!loading && error && <div className="picker-item error">{error}</div>}
                    {!loading && !error && results.length === 0 && (
                        <div className="picker-item muted">No subscribers match "{search}"</div>
                    )}
                    {!loading && !error && results.map((subscriber) => (
                        <button
                            type="button"
                            key={subscriber.id}
                            className="picker-item"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                onChange(subscriber);
                                setQuery("");
                                setOpen(false);
                            }}
                        >
                            <strong>{subscriber.name}</strong>
                            <span>@{subscriber.username} · {subscriber.status}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SubscriberPicker;
