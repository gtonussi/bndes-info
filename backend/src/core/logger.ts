export type LogDomain =
  | "server"
  | "http"
  | "config"
  | "health"
  | "chat"
  | "prompt"
  | "openrouter"
  | "recommendation"
  | "validation"
  | "knowledge_base";

export interface LogContext {
  domain?: LogDomain;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function serializeContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) return "";
  return ` ${ANSI.dim}${JSON.stringify(context)}${ANSI.reset}`;
}

export function createLogger(
  logLevel: "debug" | "info" | "warn" | "error" = "info",
) {
  const level = { debug: 0, info: 1, warn: 2, error: 3 }[logLevel];
  const now = () => new Date().toISOString();
  const write = (
    method: "log" | "warn" | "error",
    color: string,
    levelName: string,
    msg: string,
    ctx?: LogContext,
  ) => {
    const domain = ctx?.domain ?? "server";
    const line = `${color}[${levelName.toUpperCase()}]${ANSI.reset} ${ANSI.dim}${now()}${ANSI.reset} [${domain}] ${msg}${serializeContext(ctx)}`;
    console[method](line);
  };

  return {
    debug: (msg: string, ctx?: LogContext) => {
      if (level <= 0) write("log", ANSI.cyan, "debug", msg, ctx);
    },
    info: (msg: string, ctx?: LogContext) => {
      if (level <= 1) write("log", ANSI.green, "info", msg, ctx);
    },
    warn: (msg: string, ctx?: LogContext) => {
      if (level <= 2) write("warn", ANSI.yellow, "warn", msg, ctx);
    },
    error: (msg: string, ctx?: LogContext & { error?: unknown }) => {
      if (level <= 3) {
        const errorInfo =
          ctx?.error instanceof Error
            ? { errorName: ctx.error.name, errorMsg: ctx.error.message }
            : undefined;
        write("error", ANSI.red, "error", msg, { ...ctx, ...errorInfo });
      }
    },
    request: (msg: string, ctx?: LogContext) =>
      write("log", ANSI.magenta, "http", msg, ctx),
  };
}

export const logger = createLogger(process.env.LOG_LEVEL as any);
