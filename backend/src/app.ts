import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  createChatRouter,
  type ChatServiceLike,
} from "./api/routes/chat.routes.js";
import { createHealthRouter } from "./api/routes/health.routes.js";
import type { AppConfig } from "./core/config.js";
import { logger } from "./core/logger.js";
import { ChatService } from "./services/ChatService.js";

export function createApp(
  config: AppConfig,
  chatService: ChatServiceLike = new ChatService(config),
): Express {
  const app = express();

  // Middleware
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    res.setHeader(
      "Access-Control-Allow-Origin",
      process.env.CORS_ORIGIN ?? "*",
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use((req, _res, next) => {
    const requestId = Math.random().toString(36).slice(2, 11);
    const startedAt = performance.now();
    const requestPath = req.path;
    (req as any).requestId = requestId;
    logger.request("request started", {
      domain: "http",
      requestId,
      method: req.method,
      path: requestPath,
    });
    req.res?.on("finish", () => {
      logger.request("request finished", {
        domain: "http",
        requestId,
        method: req.method,
        path: requestPath,
        status: req.res?.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    next();
  });

  app.use("/chat", createChatRouter(chatService));
  app.use("/health", createHealthRouter(config));

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error", { domain: "server", error: err });
    const errorMessage =
      err instanceof Error ? err.message : "Internal server error";
    const isProviderUnavailable = errorMessage.startsWith(
      "OpenRouter indisponível",
    );
    res.status(isProviderUnavailable ? 503 : 500).json({
      error: isProviderUnavailable
        ? "O serviço de recomendação está temporariamente indisponível. Tente novamente mais tarde."
        : "Internal server error",
    });
  });

  return app;
}
