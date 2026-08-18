import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { AppConfig } from "./core/config.js";
import { logger } from "./core/logger.js";
import { ChatService } from "./services/ChatService.js";

export function createApp(config: AppConfig): Express {
  const app = express();
  const chatService = new ChatService(config);

  // Middleware
  app.use(express.json({ limit: "1mb" }));
  app.use((_req, res, next) => {
    res.setHeader(
      "Access-Control-Allow-Origin",
      process.env.CORS_ORIGIN ?? "*",
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    next();
  });
  app.use((req, _res, next) => {
    const requestId = Math.random().toString(36).slice(2, 11);
    (req as any).requestId = requestId;
    logger.debug("Request", { requestId, method: req.method, path: req.path });
    next();
  });

  // POST /chat
  app.post("/chat", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, conversationId, conversationHistory } = req.body as {
        message?: string;
        conversationId?: string;
        conversationHistory?: Array<{
          role: "user" | "assistant";
          content: string;
        }>;
      };
      if (
        !message ||
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        return res.status(400).json({
          error: "message é obrigatório e deve ser uma string não-vazia",
        });
      }

      if (conversationId !== undefined && typeof conversationId !== "string") {
        return res
          .status(400)
          .json({ error: "conversationId deve ser uma string" });
      }
      if (
        conversationHistory !== undefined &&
        (!Array.isArray(conversationHistory) ||
          conversationHistory.some(
            (turn) =>
              !turn ||
              !["user", "assistant"].includes(turn.role) ||
              typeof turn.content !== "string",
          ))
      ) {
        return res
          .status(400)
          .json({ error: "conversationHistory possui formato inválido" });
      }

      const response = await chatService.chat({
        message: message.trim(),
        conversationId,
        conversationHistory,
      });
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // GET /health
  app.get("/health", (_req: Request, res: Response) => {
    const hasApiKey = process.env.OPENROUTER_API_KEY ? "present" : "missing";
    res.status(hasApiKey === "present" ? 200 : 503).json({
      status: hasApiKey === "present" ? "ok" : "degraded",
      uptime: process.uptime(),
      openRouterApiKey: hasApiKey,
    });
  });

  // Error handler
  app.use((err: unknown, _req: Request, res: Response) => {
    logger.error("Unhandled error", { error: err });
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
