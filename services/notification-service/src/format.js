const GB = 1024 ** 3;

const formatDate = (value) => {
  if (!value) return "unknown date";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const formatMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
};

const formatGb = (bytes) => {
  const number = Number(bytes);
  return Number.isFinite(number) ? (number / GB).toFixed(2) : "0.00";
};

const formatMethod = (method) => {
  const labels = { cash: "cash", upi: "UPI", bank_transfer: "bank transfer", card: "card", cheque: "cheque", other: "other" };
  return labels[method] || method || "unknown method";
};

const subscriberLabel = (subscriber, payload = {}) => {
  const name = (subscriber && subscriber.name) || payload.name;
  const username = (subscriber && subscriber.username) || payload.username;
  if (name && username) return `${name} (${username})`;
  if (name || username) return name || username;
  return payload.subscriber_id ? `Subscriber #${payload.subscriber_id}` : "Unknown subscriber";
};

const planLabel = (plan, payload = {}) => {
  if (plan && plan.name) return plan.name;
  if (payload.name) return payload.name;
  return payload.plan_id ? `Plan #${payload.plan_id}` : "unknown plan";
};

module.exports = { formatDate, formatMoney, formatGb, formatMethod, subscriberLabel, planLabel };
