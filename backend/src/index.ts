// Must be the first import: other modules read process.env when they load.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { jobRoutes } from './routes/jobRoutes.js';
import { screenshotRouter } from './routes/screenshotRoutes.js';
import { checkDatabaseConnection } from './db.js';
import { JobService } from './services/jobService.js';
import { allowPrivateTargets, requireApiKey } from './security.js';

const app = express();
const PORT = process.env.PORT || 5001;

// Comma-separated list of allowed frontend origins; defaults to any origin for local development.
const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);

// Middlewares
app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 && !corsOrigins.includes('*') ? corsOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  })
);
app.use(express.json());

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'anytask-ai-backend',
    authRequired: Boolean(process.env.ANYTASK_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Job API Routes
app.use('/api/jobs', requireApiKey, jobRoutes);

// Screenshot serving (for Audit Report inline images)
app.use('/api/screenshots', requireApiKey, screenshotRouter);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Start Server
async function startServer() {
  await checkDatabaseConnection();
  const recovered = await JobService.recoverInterruptedJobs().catch(() => ({ failed: 0, requeued: 0 }));
  if (recovered.failed > 0) console.log(`♻️  Marked ${recovered.failed} interrupted job(s) as failed`);
  if (recovered.requeued > 0) console.log(`♻️  Re-queued ${recovered.requeued} waiting job(s)`);

  if (!process.env.ANYTASK_API_KEY) {
    console.warn('⚠️  ANYTASK_API_KEY is not set: anyone who can reach this server can start test runs.');
  }
  if (allowPrivateTargets()) {
    console.log('ℹ️  Private/localhost targets are allowed (development). Set ALLOW_PRIVATE_TARGETS=false to block them.');
  }

  app.listen(PORT, () => {
    console.log(`🚀 AnyTask AI Backend running on http://localhost:${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`📋 Jobs Endpoint: http://localhost:${PORT}/api/jobs`);
  });
}

startServer();
