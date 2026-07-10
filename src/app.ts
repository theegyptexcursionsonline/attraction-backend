import dns from 'dns';
// Use Google Public DNS to avoid local resolver issues with MongoDB Atlas SRV records
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import swaggerUi from 'swagger-ui-express';

import { env, connectDatabase, corsOptions, swaggerSpec } from './config';
import routes from './routes';
import { notFoundHandler, errorHandler, apiLimiter } from './middleware';
import { expireStaleCardHolds } from './services/bookingInventory.service';

export const createApp = (): express.Application => {
  const app = express();

  // Trust proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Security middleware - allow swagger UI assets
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          connectSrc: ["'self'", ...env.frontendUrl.split(',').map((u) => u.trim()).filter(Boolean)],
          fontSrc: ["'self'", 'https:', 'data:'],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS
  app.use(cors(corsOptions));

  // Request logging
  if (env.isDev) {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  // Stripe requires raw body for webhook signature validation.
  // This middleware must run before JSON/body parsing.
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cookie parsing
  app.use(cookieParser());

  // Sanitize MongoDB operators from user input
  app.use(mongoSanitize());

  // Compression
  app.use(compression());

  // Rate limiting
  app.use('/api', apiLimiter);

  // Swagger documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #3b82f6 }
    `,
    customSiteTitle: 'Attractions Network API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
    },
  }));

  // Swagger JSON endpoint
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // API routes
  app.use('/api', routes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
};

const app = createApp();

export const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    const sweepExpiredHolds = async (): Promise<void> => {
      try {
        const released = await expireStaleCardHolds();
        if (released > 0) console.log(`[booking-inventory] released ${released} expired card hold(s)`);
      } catch (error) {
        console.error('[booking-inventory] expired-hold sweep failed:', error);
      }
    };
    void sweepExpiredHolds();
    const inventorySweep = setInterval(sweepExpiredHolds, 5 * 60 * 1000);
    inventorySweep.unref();

    // Start listening
    app.listen(env.port, () => {
      console.log(`
🚀 Server started successfully!
📡 Environment: ${env.nodeEnv}
🌐 URL: http://localhost:${env.port}
📚 API: http://localhost:${env.port}/api
📖 Swagger: http://localhost:${env.port}/api/docs
❤️  Health: http://localhost:${env.port}/api/health
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
  });

  startServer();
}

export default app;
