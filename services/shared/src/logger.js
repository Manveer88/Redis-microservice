const write = (level, service, message, meta) => {
  const entry = {
    ...(meta || {}),
    time: new Date().toISOString(),
    level,
    service,
    message,
  };

  if (meta && meta.error instanceof Error) {
    entry.error = { message: meta.error.message, stack: meta.error.stack };
  }

  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
};

const createLogger = (service) => ({
  info: (message, meta) => write("info", service, message, meta),
  warn: (message, meta) => write("warn", service, message, meta),
  error: (message, meta) => write("error", service, message, meta),
});

module.exports = { createLogger };
