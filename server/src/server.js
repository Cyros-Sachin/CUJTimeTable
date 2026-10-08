import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool, waitForDb } from './db.js';
import { runSeed } from './services/seedService.js';
import { closeBrowser } from './services/pdfService.js';

async function main() {
  await waitForDb();
  await runSeed();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`API listening on port ${config.port}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => logger.info('HTTP server closed'));
    await closeBrowser();
    await pool.end().catch(() => {});
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
