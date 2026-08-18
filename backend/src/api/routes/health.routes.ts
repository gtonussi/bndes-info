import { Router, type Request, type Response } from "express";
import type { AppConfig } from "../../core/config.js";
import { logger } from "../../core/logger.js";

export function createHealthRouter(config: AppConfig): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    const hasApiKey = config.openRouterApiKey.trim().length > 0;
    const status = hasApiKey ? 200 : 503;
    logger.info("Health check completed", {
      domain: "health",
      status,
      openRouterApiKey: hasApiKey ? "present" : "missing",
    });
    return res.status(status).json({
      status: hasApiKey ? "ok" : "degraded",
      uptime: process.uptime(),
      openRouterApiKey: hasApiKey ? "present" : "missing",
    });
  });

  return router;
}
