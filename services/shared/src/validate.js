const { badRequest } = require("./errors");

const parseId = (value, label = "ID") => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw badRequest(`Invalid ${label}`);
  }
  return id;
};

const optionalId = (value, label) =>
  value === undefined || value === null || value === "" ? null : parseId(value, label);

const parsePagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
};

const pageMeta = ({ page, limit }, total) => ({ page, limit, total: Number(total) });

const requireString = (value, label, { min = 1, max = 255 } = {}) => {
  if (typeof value !== "string" || value.trim().length < min) {
    throw badRequest(`${label} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw badRequest(`${label} must be at most ${max} characters`);
  }
  return trimmed;
};

const optionalString = (value, label, { max = 255 } = {}) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw badRequest(`${label} must be text`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw badRequest(`${label} must be at most ${max} characters`);
  }
  return trimmed || null;
};

const requireNumber = (value, label, { min, max, integer = false } = {}) => {
  const number = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(number)) {
    throw badRequest(`${label} must be a number`);
  }
  if (integer && !Number.isInteger(number)) {
    throw badRequest(`${label} must be a whole number`);
  }
  if (min !== undefined && number < min) {
    throw badRequest(`${label} must be at least ${min}`);
  }
  if (max !== undefined && number > max) {
    throw badRequest(`${label} must be at most ${max}`);
  }
  return number;
};

const requireEnum = (value, label, allowed) => {
  if (!allowed.includes(value)) {
    throw badRequest(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return value;
};

const optionalEnum = (value, label, allowed) =>
  value === undefined || value === null || value === "" ? null : requireEnum(value, label, allowed);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalEmail = (value, label = "Email") => {
  const email = optionalString(value, label, { max: 150 });
  if (email && !EMAIL_PATTERN.test(email)) {
    throw badRequest(`${label} is not valid`);
  }
  return email ? email.toLowerCase() : null;
};

const requireEmail = (value, label = "Email") => {
  const email = optionalEmail(value, label);
  if (!email) {
    throw badRequest(`${label} is required`);
  }
  return email;
};

const optionalDate = (value, label) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw badRequest(`${label} is not a valid date`);
  }
  return date;
};

const toMoney = (value) => Math.round(Number(value) * 100) / 100;

module.exports = {
  parseId,
  optionalId,
  parsePagination,
  pageMeta,
  requireString,
  optionalString,
  requireNumber,
  requireEnum,
  optionalEnum,
  optionalEmail,
  requireEmail,
  optionalDate,
  toMoney,
};
