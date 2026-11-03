const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const numberFormatter = new Intl.NumberFormat("en-IN");

const GB = 1024 ** 3;

export const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

export const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

const toDate = (value) => {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value) => {
    const date = toDate(value);

    return date
        ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "-";
};

export const formatDateTime = (value) => {
    const date = toDate(value);

    return date
        ? date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })
        : "-";
};

export const formatTime = (value) => {
    const date = toDate(value);

    return date
        ? date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "-";
};

export const formatMonth = (value) => {
    if (!value) {
        return "-";
    }

    const [year, month] = String(value).split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);

    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

export const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let index = 0;
    let size = bytes;

    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
    }

    if (index < 2 && bytes > 0) {
        return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
    }

    return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

export const bytesToGB = (value) => ((Number(value) || 0) / GB).toFixed(2);

export const formatDataLimit = (gb) =>
    gb === null || gb === undefined || gb === "" || Number(gb) === 0
        ? "Unlimited"
        : `${Number(gb)} GB`;

export const formatLabel = (value) =>
    value ? String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";

export const toInputDate = (date) => {
    const d = toDate(date);

    if (!d) {
        return "";
    }

    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${d.getFullYear()}-${month}-${day}`;
};

export const toInputDateTime = (date) => {
    const d = toDate(date);

    if (!d) {
        return "";
    }

    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");

    return `${toInputDate(d)}T${hours}:${minutes}`;
};
