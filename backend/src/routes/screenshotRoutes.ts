import express from 'express';
import path from 'path';
import { screenshotStore } from '../storage.js';

// ---------------------------------------------------------------------------
// Screenshot Serving Route
// Serves PNG screenshots captured during test runs from the configured store
// (local disk or S3-compatible bucket, see src/storage.ts).
// ---------------------------------------------------------------------------

export const screenshotRouter = express.Router();

screenshotRouter.get('/:filename', async (req, res) => {
  // Sanitize: only allow basename — no path traversal
  const filename = path.basename(req.params.filename);

  if (!filename.endsWith('.png')) {
    return res.status(400).send('Only .png files are served');
  }

  const data = await screenshotStore().read(filename);
  if (!data) {
    return res.status(404).send('Screenshot not found');
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.send(data);
});
