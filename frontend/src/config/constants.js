export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

export const PAGE_SIZE = 20;

export const PAYMENT_METHODS = [
    { value: "cash", label: "Cash" },
    { value: "upi", label: "UPI" },
    { value: "bank_transfer", label: "Bank transfer" },
    { value: "card", label: "Card" },
    { value: "cheque", label: "Cheque" },
    { value: "other", label: "Other" }
];

export const SUBSCRIBER_STATUSES = ["active", "inactive", "suspended"];

export const SUBSCRIPTION_STATUSES = ["pending", "active", "expired", "cancelled"];

export const INVOICE_STATUSES = ["unpaid", "partial", "paid", "void"];

export const EXPORT_TYPES = [
    { value: "subscribers", label: "Subscribers" },
    { value: "subscriptions", label: "Subscriptions" },
    { value: "invoices", label: "Invoices" },
    { value: "payments", label: "Payments" },
    { value: "usage", label: "Usage" }
];

export const HTTP_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
