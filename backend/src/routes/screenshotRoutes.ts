import express from 'express';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Screenshot Serving Route
// Serves PNG screenshots captured during Playwright test execution.
// Files are stored at: backend/test-results/screenshots/<filename>.png
// ---------------------------------------------------------------------------

export const screenshotRouter = express.Router();

screenshotRouter.get('/:filename', (req, res) => {
  // Sanitize: only allow basename — no path traversal
  const filename = path.basename(req.params.filename);

  // Only allow .png files
  if (!filename.endsWith('.png')) {
    return res.status(400).send('Only .png files are served');
  }

  const filePath = path.resolve(process.cwd(), 'test-results', 'screenshots', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Screenshot not found');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(filePath);
});

