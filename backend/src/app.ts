import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { logger } from "./core/logger.js";
import { ChatService } from "./services/ChatService.js";
import type { AppConfig } from "./core/config.js";

export function createApp(config: AppConfig): Express {
  const app = express();
  const chatService = new ChatService(config);

  // Middleware
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    const requestId = Math.random().toString(36).slice(2, 11);
    (req as any).requestId = requestId;
    logger.debug("Request", { requestId, method: req.method, path: req.path });
    next();
  });

  // POST /chat
  app.post("/chat", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message } = req.body as { message?: string };
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "message é obrigatório e deve ser uma string não-vazia" });
      }

      const response = await chatService.chat({ message: message.trim() });
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // GET /health
  app.get("/health", (req: Request, res: Response) => {
    const hasApiKey = process.env.OPENROUTER_API_KEY ? "present" : "missing";
    res.json({
      status: "ok",
      uptime: process.uptime(),
      openRouterApiKey: hasApiKey,
    });
  });

  // Error handler
  app.use((err: unknown, _req: Request, res: Response) => {
    logger.error("Unhandled error", { error: err });
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  });

  return app;
}

