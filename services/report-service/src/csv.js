const pad = (value) => String(value).padStart(2, "0");

const formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatDateTime = (date) =>
  `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

const cell = (value, kind) => {
  if (value === null || value === undefined) return "";

  let text;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    text = kind === "date" ? formatDate(value) : formatDateTime(value);
  } else if (kind === "money" && Number.isFinite(Number(value))) {
    text = Number(value).toFixed(2);
  } else if (typeof value === "number" || typeof value === "bigint") {
    text = String(value);
  } else {
    text = String(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
  }

  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (columns, rows) => {
  const lines = [columns.map((column) => cell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(row[column.key], column.kind)).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
};

const exportFilename = (type) => {
  const now = new Date();
  return `${type}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
};

module.exports = { toCsv, exportFilename, cell };
