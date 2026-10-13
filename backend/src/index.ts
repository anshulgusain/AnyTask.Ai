import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { jobRoutes } from './routes/jobRoutes.js';
import { checkDatabaseConnection } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'anytask-ai-backend',
    timestamp: new Date().toISOString(),
  });
});

// Job API Routes
app.use('/api/jobs', jobRoutes);

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

  app.listen(PORT, () => {
    console.log(`🚀 AnyTask AI Backend running on http://localhost:${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`📋 Jobs Endpoint: http://localhost:${PORT}/api/jobs`);
  });
}

startServer();
