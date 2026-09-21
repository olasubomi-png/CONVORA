type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, string | number | boolean | null | undefined>;

const SECRET_KEY_PATTERN =
  /(password|secret|token|authorization|api[_-]?key|cookie|session|credential)/i;

function sanitizeFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...sanitizeFields(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
