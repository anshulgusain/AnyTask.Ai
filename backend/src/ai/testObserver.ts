import { chromium } from 'playwright';
import { navigateTo } from './tools.js';
import { observePage, formatObservation } from './pageObserver.js';

const url = process.argv[2] || 'https://go-trade-web.onrender.com/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    console.log(await navigateTo(page, url));
    const obs = await observePage(page);
    console.log(formatObservation(obs));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
