import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "../../config/constants";
import { formatNumber } from "../../utils/format";

const buildPages = (current, totalPages) => {
    const pages = new Set([1, totalPages, current - 1, current, current + 1]);
    const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const result = [];

    sorted.forEach((page, index) => {
        if (index > 0 && page - sorted[index - 1] > 1) {
            result.push(`gap-${page}`);
        }
        result.push(page);
    });

    return result;
};

function Pagination({ meta, page, onChange, label = "records" }) {
    if (!meta) {
        return null;
    }

    const total = Number(meta.total) || 0;
    const limit = Number(meta.limit) || PAGE_SIZE;
    const current = Number(meta.page) || page || 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const from = total === 0 ? 0 : (current - 1) * limit + 1;
    const to = Math.min(total, current * limit);

    return (
        <div className="pagination">
            <span className="pagination-info">
                {total === 0
                    ? `0 ${label}`
                    : `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)} ${label}`}
            </span>

            {totalPages > 1 && (
                <div className="pagination-controls">
                    <button
                        type="button"
                        className="page-button"
                        disabled={current <= 1}
                        onClick={() => onChange(current - 1)}
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={15} />
                    </button>

                    {buildPages(current, totalPages).map((item) =>
                        typeof item === "string" ? (
                            <span key={item} className="page-gap">…</span>
                        ) : (
                            <button
                                type="button"
                                key={item}
                                className={`page-button ${item === current ? "active" : ""}`}
                                onClick={() => onChange(item)}
                            >
                                {item}
                            </button>
                        )
                    )}

                    <button
                        type="button"
                        className="page-button"
                        disabled={current >= totalPages}
                        onClick={() => onChange(current + 1)}
                        aria-label="Next page"
                    >
                        <ChevronRight size={15} />
                    </button>
                </div>
            )}
        </div>
    );
}

export default Pagination;
