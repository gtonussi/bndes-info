type LogValue = string | number | boolean | null | undefined;
type LogContext = Record<string, LogValue>;

const isDevelopment = import.meta.env.DEV;
const styles = {
  label:
    "color:#f4efe5;background:#30423c;font-weight:700;padding:2px 7px;border-radius:3px",
  info: "color:#557b62;font-weight:700",
  warn: "color:#bd4e35;font-weight:700",
  error:
    "color:#fff;background:#bd4e35;font-weight:700;padding:2px 7px;border-radius:3px",
  muted: "color:#89958d",
};

function write(
  level: "info" | "warn" | "error",
  event: string,
  context: LogContext = {},
) {
  if (!isDevelopment) return;
  const method =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  method(`%c BNDES INFO %c ${event}`, styles.label, styles[level], context);
}

export const frontendLogger = {
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) =>
    write("error", event, context),
};
