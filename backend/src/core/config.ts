import { logger } from "./logger.js";

export interface AppConfig {
  openRouterApiKey: string;
  openRouterModelPrimary: string;
  openRouterModelFallback?: string;
  openRouterBaseUrl: string;
  requestTimeoutMs: number;
  corsOrigin: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const openRouterApiKey = env.OPENROUTER_API_KEY?.trim();
  const openRouterModelPrimary = env.OPENROUTER_MODEL_PRIMARY?.trim();

  if (!openRouterApiKey) throw new Error("OPENROUTER_API_KEY não configurada.");
  if (!openRouterModelPrimary)
    throw new Error("OPENROUTER_MODEL_PRIMARY não configurado.");

  const requestTimeoutMs = Number(env.OPENROUTER_TIMEOUT_MS ?? "15000");
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error("OPENROUTER_TIMEOUT_MS deve ser um número positivo.");
  }

  const corsOrigin = env.CORS_ORIGIN?.trim() || "*";
  if (env.NODE_ENV === "production" && corsOrigin === "*") {
    throw new Error("CORS_ORIGIN deve ser configurada em produção.");
  }

  const config = {
    openRouterApiKey,
    openRouterModelPrimary,
    openRouterModelFallback: env.OPENROUTER_MODEL_FALLBACK?.trim() || undefined,
    openRouterBaseUrl:
      env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
    requestTimeoutMs,
    corsOrigin,
  };

  logger.info("Configuration loaded", {
    domain: "config",
    modelPrimary: config.openRouterModelPrimary,
    hasFallbackModel: Boolean(config.openRouterModelFallback),
    requestTimeoutMs: config.requestTimeoutMs,
    baseUrl: config.openRouterBaseUrl,
    corsOrigin: config.corsOrigin,
  });

  return config;
}
