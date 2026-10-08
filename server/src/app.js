import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { apiRouter } from './routes/index.js';
import { auth } from './middleware/auth.js';
import { csrf } from './middleware/csrf.js';
import { apiLimiter } from './middleware/limits.js';
import { notFoundApi, errorHandler } from './middleware/errors.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.use('/api', apiLimiter, csrf, auth, apiRouter);
  app.use('/api', notFoundApi);

  app.use(errorHandler);

  return app;
}
