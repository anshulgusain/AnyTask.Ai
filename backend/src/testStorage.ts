import 'dotenv/config';
import { screenshotStore } from './storage.js';

// Round-trips a 1x1 PNG through the configured screenshot store.
// Usage: SCREENSHOT_STORAGE=cloudinary npm run test:storage
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  const kind = process.env.SCREENSHOT_STORAGE || 'local';
  const filename = `storage_check_${Date.now()}.png`;
  console.log(`Storage: ${kind}. Saving ${filename}...`);

  await screenshotStore().save(filename, PNG_1X1);
  const back = await screenshotStore().read(filename);

  if (!back) throw new Error('Saved, but reading it back returned nothing');
  console.log(`OK: read back ${back.length} bytes (${back.subarray(1, 4).toString()} image).`);
}

main().catch((err) => {
  console.error('Storage check failed:', err.message ?? err);
  process.exit(1);
});
