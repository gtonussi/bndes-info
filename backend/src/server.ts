import { loadConfig } from "./core/config.js";
import { logger } from "./core/logger.js";
import { createApp } from "./app.js";

const config = loadConfig();
const app = createApp(config);
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  logger.info(`Server started`, { port, nodeEnv: process.env.NODE_ENV });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

