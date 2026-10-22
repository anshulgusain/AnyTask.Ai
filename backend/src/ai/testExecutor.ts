import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { runExecutorAgent, ExecutionSummary } from './executorAgent.js';
import type { TestPlan } from './journeyPlanner.js';

/**
 * ---------------------------------------------------------------------------
 * Day 6 Verification: Executor Agent Test
 * ---------------------------------------------------------------------------
 * Verifies that the Executor Agent sequentially dispatches atomic actions
 * (NAVIGATE, CLICK, FILL, ASSERT_VISIBLE), captures milestone screenshots to disk,
 * and compiles structured execution metrics.
 *
 * Uses route interception for reliable, offline execution in < 3 seconds.
 *
 * Run with:
 *   npx tsx src/ai/testExecutor.ts
 */
async function testExecutorAgent() {
  console.log('\n🚀 --- Starting Day 6 Executor Agent Test ---\n');

  // Simulated application pages
  const mockPages: Record<string, string> = {
    'http://executor-test.local/': `
      <!DOCTYPE html>
      <html>
        <head><title>Executor Storefront</title></head>
        <body>
          <h1>Executor Test Store</h1>
          <button id="add-item-btn" onclick="document.getElementById('cart-badge').textContent = '1'">
            Add Product to Cart
          </button>
          <span id="cart-badge">0</span>
          <hr/>
          <form id="order-form" onsubmit="event.preventDefault(); document.getElementById('order-confirmed-banner').style.display = 'block';">
            <label for="customer-email">Email Address</label>
            <input id="customer-email" name="email" type="email" required />

            <button id="submit-order-btn" type="submit">Place Order</button>
          </form>
          <div id="order-confirmed-banner" style="display:none;">Order Successfully Placed!</div>
        </body>
      </html>
    `,
  };

  // Temporarily hook chromium.launch to inject our route interceptor
  const originalLaunch = chromium.launch.bind(chromium);
  chromium.launch = async (options) => {
    const realBrowser = await originalLaunch(options);
    const originalNewContext = realBrowser.newContext.bind(realBrowser);

    realBrowser.newContext = async (contextOptions) => {
      const realCtx = await originalNewContext(contextOptions);

      await realCtx.route('http://executor-test.local/**', async (route) => {
        const html = mockPages['http://executor-test.local/'];
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

  const testPlan: TestPlan = {
    id: 'plan_exec_test_01',
    targetBaseUrl: 'http://executor-test.local/',
    generatedAt: new Date().toISOString(),
    summary: 'Automated verification flow for store checkout',
    journeys: [
      {
        id: 'journey_checkout',
        title: 'Checkout & Place Order Flow',
        description: 'Validate adding an item, filling email, and submitting order.',
        priority: 'HIGH',
        steps: [
          {
            stepNumber: 1,
            description: 'Navigate to storefront',
            action: 'NAVIGATE',
            targetUrl: 'http://executor-test.local/',
          },
          {
            stepNumber: 2,
            description: 'Add product to cart',
            action: 'CLICK',
            selector: '#add-item-btn',
          },
          {
            stepNumber: 3,
            description: 'Fill customer email',
            action: 'FILL',
            selector: '#customer-email',
            value: 'qa.lead@anytask.ai',
          },
          {
            stepNumber: 4,
            description: 'Submit order form',
            action: 'CLICK',
            selector: '#submit-order-btn',
          },
          {
            stepNumber: 5,
            description: 'Verify order confirmed banner appears',
            action: 'ASSERT_VISIBLE',
            selector: '#order-confirmed-banner',
          },
        ],
      },
    ],
  };

  const testLogger = async (step: string, msg: string, level = 'INFO') => {
    console.log(`  [${level}] ${step}: ${msg}`);
  };

  const screenshotDir = path.resolve(process.cwd(), 'test-results', 'screenshots');

  const summary: ExecutionSummary = await runExecutorAgent(testPlan, testLogger, {
    headless: true,
    screenshotDir,
    stepDelayMs: 50,
  });

  // Restore launch
  chromium.launch = originalLaunch;

  console.log('\n📊 --- Execution Summary Report ---');
  console.log(`Plan ID:          ${summary.planId}`);
  console.log(`Total Journeys:   ${summary.totalJourneys}`);
  console.log(`Passed Journeys:  ${summary.passedJourneys}`);
  console.log(`Failed Journeys:  ${summary.failedJourneys}`);
  console.log(`Total Duration:   ${summary.totalDurationMs}ms\n`);

  for (const journey of summary.results) {
    console.log(`🎯 Journey "${journey.title}" (${journey.success ? 'PASSED' : 'FAILED'}):`);
    for (const step of journey.steps) {
      const statusIcon = step.success ? '✓' : '✗';
      console.log(`   ${statusIcon} Step ${step.stepNumber} [${step.action}]: ${step.description} (${step.durationMs}ms)`);
      if (step.screenshotPath) {
        const fileExists = fs.existsSync(step.screenshotPath);
        console.log(`      Screenshot: ${path.basename(step.screenshotPath)} (Exists on disk: ${fileExists})`);
      }
    }
  }

  // Assertions
  if (summary.passedJourneys !== 1) {
    throw new Error(`Expected 1 passed journey, got ${summary.passedJourneys}`);
  }

  const journeyRes = summary.results[0];
  if (journeyRes.passedSteps !== 5) {
    throw new Error(`Expected all 5 steps to pass, got ${journeyRes.passedSteps}`);
  }

  for (const step of journeyRes.steps) {
    if (!step.screenshotPath || !fs.existsSync(step.screenshotPath)) {
      throw new Error(`Missing screenshot on disk for step ${step.stepNumber}`);
    }
  }

  console.log('\n🎉 DAY 6 EXECUTOR AGENT VERIFIED AND PASSING WITH SCREENSHOTS!\n');
}

testExecutorAgent().catch((err) => {
  console.error('❌ Day 6 Executor Agent test failed:', err);
  process.exit(1);
});
