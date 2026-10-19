import { chromium } from 'playwright';
import { runDiscoveryAgent, SiteMap } from './discoveryAgent.js';

/**
 * ---------------------------------------------------------------------------
 * Day 3 Verification: Discovery Agent Test
 * ---------------------------------------------------------------------------
 * This script verifies that the Discovery Agent can autonomously crawl
 * internal links, navigate between pages, and build a structured SiteMap.
 *
 * It uses Playwright request route mocking so it runs 100% reliably
 * and offline in under 3 seconds without needing a live frontend server.
 *
 * Run with:
 *   npx tsx src/ai/testDiscovery.ts
 */
async function testDiscoveryAgent() {
  console.log('\n🕷️  --- Starting Day 3 Discovery Agent Test ---\n');

  // Launch a temporary browser to test mock multi-page routing
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Define 3 linked mock pages representing a mini web store
  const mockPages: Record<string, string> = {
    'http://mock-store.local/': `
      <!DOCTYPE html>
      <html>
        <head><title>Mock Store Home</title></head>
        <body>
          <h1>Welcome to Mock Store</h1>
          <a id="link-cart" href="/cart">Go to Cart</a>
          <a id="link-external" href="https://google.com">External Link (Should be ignored)</a>
          <button id="home-cta">Shop Deals</button>
        </body>
      </html>
    `,
    'http://mock-store.local/cart': `
      <!DOCTYPE html>
      <html>
        <head><title>Your Shopping Cart</title></head>
        <body>
          <h1>Shopping Cart</h1>
          <p>1x Mechanical Keyboard</p>
          <a id="link-checkout" href="/checkout">Proceed to Checkout</a>
          <a id="link-back" href="/">Continue Shopping</a>
          <button id="clear-cart-btn">Empty Cart</button>
        </body>
      </html>
    `,
    'http://mock-store.local/checkout': `
      <!DOCTYPE html>
      <html>
        <head><title>Secure Checkout</title></head>
        <body>
          <h1>Complete Your Purchase</h1>
          <form id="checkout-form">
            <label for="cust-email">Email Address</label>
            <input id="cust-email" name="email" type="email" required />

            <label for="cust-card">Card Number</label>
            <input id="cust-card" name="cardNumber" type="text" placeholder="4242..." required />

            <button id="pay-btn" type="submit">Pay Now ($49.00)</button>
          </form>
          <a href="/cart">Back to Cart</a>
        </body>
      </html>
    `,
  };

  await browser.close();

  // Test the actual runDiscoveryAgent against the simulated store
  // We temporarily mock chromium.launch to register route interceptions
  const originalLaunch = chromium.launch.bind(chromium);
  chromium.launch = async (options) => {
    const realBrowser = await originalLaunch(options);
    const originalNewContext = realBrowser.newContext.bind(realBrowser);

    realBrowser.newContext = async (contextOptions) => {
      const realCtx = await originalNewContext(contextOptions);

      // Route all http://mock-store.local/* requests to our mock HTML pages
      await realCtx.route('http://mock-store.local/**', async (route) => {
        const url = route.request().url();
        const html = mockPages[url] || mockPages[`${url}/`] || '<html><body>Not Found</body></html>';
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: html,
        });
      });

      return realCtx;
    };

    return realBrowser;
  };

  const logs: string[] = [];
  const testLogger = async (step: string, msg: string, level = 'INFO') => {
    logs.push(`[${step}] ${msg}`);
    console.log(`  [${level}] ${step}: ${msg}`);
  };

  const siteMap: SiteMap = await runDiscoveryAgent(
    'http://mock-store.local/',
    testLogger,
    { maxPages: 5, headless: true }
  );

  // Restore original launch
  chromium.launch = originalLaunch;

  console.log('\n📊 --- Discovered SiteMap Summary ---');
  console.log(`Total Pages Discovered: ${siteMap.totalPages}`);
  console.log(`Base URL: ${siteMap.baseUrl}\n`);

  for (const [pageUrl, snapshot] of Object.entries(siteMap.pages)) {
    console.log(`📍 Route: ${pageUrl}`);
    console.log(`   Title:   "${snapshot.title}"`);
    console.log(`   Inputs:  ${snapshot.inputs.length} (${snapshot.inputs.map((i) => i.selector).join(', ') || 'none'})`);
    console.log(`   Actions: ${snapshot.actions.length} (${snapshot.actions.map((a) => a.text).join(', ') || 'none'})`);
    console.log(`   Links:   ${snapshot.links.length} internal links\n`);
  }

  // Assertions
  const pageUrls = Object.keys(siteMap.pages);
  const hasHome = pageUrls.includes('http://mock-store.local/') || pageUrls.includes('http://mock-store.local');
  const hasCart = pageUrls.includes('http://mock-store.local/cart');
  const hasCheckout = pageUrls.includes('http://mock-store.local/checkout');

  if (!hasHome || !hasCart || !hasCheckout) {
    throw new Error(`Crawl failed: Expected all 3 routes, but got: ${pageUrls.join(', ')}`);
  }

  const checkoutSnapshot = siteMap.pages['http://mock-store.local/checkout'];
  if (checkoutSnapshot.inputs.length < 2) {
    throw new Error(`Expected at least 2 form inputs on /checkout, found ${checkoutSnapshot.inputs.length}`);
  }

  console.log('🎉 DAY 3 DISCOVERY AGENT VERIFIED AND PASSING SUCCESSFULLY!\n');
}

testDiscoveryAgent().catch((err) => {
  console.error('❌ Day 3 Discovery Agent test failed:', err);
  process.exit(1);
});
