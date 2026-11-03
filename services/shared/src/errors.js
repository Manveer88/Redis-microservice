class AppError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const badRequest = (message, code = "VALIDATION_ERROR") => new AppError(400, message, code);
const unauthorized = (message = "Authentication required", code = "UNAUTHORIZED") =>
  new AppError(401, message, code);
const forbidden = (message = "You do not have permission to do this", code = "FORBIDDEN") =>
  new AppError(403, message, code);
const notFound = (message = "Not found", code = "NOT_FOUND") => new AppError(404, message, code);
const conflict = (message, code = "CONFLICT") => new AppError(409, message, code);
const tooMany = (message = "Too many requests", code = "RATE_LIMITED") =>
  new AppError(429, message, code);

const createErrorHandler = (logger) => (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON body", code: "INVALID_JSON" });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request body too large", code: "PAYLOAD_TOO_LARGE" });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
  }

  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ success: false, message: "A record with these details already exists", code: "DUPLICATE" });
  }

  if (err.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({ success: false, message: "Record is in use and cannot be deleted", code: "IN_USE" });
  }

  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({ success: false, message: "Referenced record does not exist", code: "INVALID_REFERENCE" });
  }

  logger.error("Unhandled error", {
    error: err,
    method: req.method,
    path: req.originalUrl,
    requestId: req.requestId,
  });

  return res.status(500).json({ success: false, message: "Internal server error" });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: "Route not found", code: "ROUTE_NOT_FOUND" });
};

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooMany,
  createErrorHandler,
  notFoundHandler,
};
