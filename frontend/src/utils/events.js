import { formatCurrency, formatBytes, formatDate, formatLabel } from "./format";

export const matchesPattern = (pattern, type) => {
    if (Array.isArray(pattern)) {
        return pattern.some((item) => matchesPattern(item, type));
    }

    if (!pattern || pattern === "*") {
        return true;
    }

    if (pattern.endsWith(".*")) {
        return String(type).startsWith(pattern.slice(0, -1));
    }

    return pattern === type;
};

const who = (p) => p.name || p.username || (p.subscriber_id ? `subscriber #${p.subscriber_id}` : "a subscriber");

const sub = (p) => (p.subscriber_id ? `subscriber #${p.subscriber_id}` : "a subscriber");

const DESCRIBERS = {
    "plan.created": (p) => `Plan "${p.name}" was created`,
    "plan.updated": (p) => `Plan "${p.name}" was updated`,
    "plan.status_changed": (p) => `Plan "${p.name}" is now ${p.status}`,
    "plan.deleted": (p) => `Plan "${p.name}" was deleted`,
    "subscriber.created": (p) => `New subscriber ${who(p)} added`,
    "subscriber.updated": (p) => `Subscriber ${who(p)} was updated`,
    "subscriber.status_changed": (p) =>
        `Subscriber ${who(p)} changed from ${p.previous_status || "?"} to ${p.status}`,
    "subscriber.deleted": (p) => `Subscriber ${who(p)} was deleted`,
    "subscription.created": (p) =>
        `Subscription #${p.subscription_id} created for ${sub(p)} (${formatCurrency(p.amount)})`,
    "subscription.activated": (p) =>
        `Subscription #${p.subscription_id} activated until ${formatDate(p.end_date)}`,
    "subscription.activation_failed": (p) =>
        `Subscription #${p.subscription_id} could not be activated: ${p.reason || "unknown reason"}`,
    "subscription.cancelled": (p) =>
        `Subscription #${p.subscription_id} was cancelled${p.reason ? `: ${p.reason}` : ""}`,
    "subscription.expired": (p) => `Subscription #${p.subscription_id} expired`,
    "invoice.created": (p) => `Invoice ${p.invoice_number || `#${p.invoice_id}`} issued for ${formatCurrency(p.amount)}`,
    "payment.recorded": (p) =>
        `Payment of ${formatCurrency(p.amount)} via ${formatLabel(p.method)} for ${p.invoice_number || `invoice #${p.invoice_id}`}`,
    "invoice.paid": (p) => `Invoice ${p.invoice_number || `#${p.invoice_id}`} fully paid`,
    "invoice.voided": (p) => `Invoice ${p.invoice_number || `#${p.invoice_id}`} was voided`,
    "usage.quota_exceeded": (p) =>
        `${sub(p)} exceeded quota (${formatBytes(p.used_bytes)} of ${formatBytes(p.limit_bytes)})`,
    "admin.created": (p) => `Admin user ${p.name} was created`,
    "admin.updated": (p) => `Admin user ${p.name} was updated`
};

export const describeEvent = (event) => {
    const payload = event?.payload || {};
    const describe = DESCRIBERS[event?.type];

    if (describe) {
        try {
            return describe(payload);
        } catch {
            return formatLabel(event.type);
        }
    }

    return formatLabel(String(event?.type || "event").replace(/\./g, " "));
};

export const eventTone = (type = "") => {
    if (/failed|exceeded|voided|deleted|cancelled|expired/.test(type)) {
        return "warning";
    }

    if (/paid|activated|recorded|created/.test(type)) {
        return "success";
    }

    return "info";
};
