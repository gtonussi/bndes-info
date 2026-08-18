export interface LogContext {
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

export function createLogger(
  logLevel: "debug" | "info" | "warn" | "error" = "info",
) {
  const level = { debug: 0, info: 1, warn: 2, error: 3 }[logLevel];
  const now = () => new Date().toISOString();

  return {
    debug: (msg: string, ctx?: LogContext) => {
      if (level <= 0)
        console.log(JSON.stringify({ ts: now(), level: "debug", msg, ...ctx }));
    },
    info: (msg: string, ctx?: LogContext) => {
      if (level <= 1)
        console.log(JSON.stringify({ ts: now(), level: "info", msg, ...ctx }));
    },
    warn: (msg: string, ctx?: LogContext) => {
      if (level <= 2)
        console.warn(JSON.stringify({ ts: now(), level: "warn", msg, ...ctx }));
    },
    error: (msg: string, ctx?: LogContext & { error?: unknown }) => {
      if (level <= 3) {
        const errorInfo =
          ctx?.error instanceof Error
            ? { errorName: ctx.error.name, errorMsg: ctx.error.message }
            : undefined;
        console.error(
          JSON.stringify({
            ts: now(),
            level: "error",
            msg,
            ...ctx,
            ...errorInfo,
          }),
        );
      }
    },
  };
}

export const logger = createLogger(process.env.LOG_LEVEL as any);
