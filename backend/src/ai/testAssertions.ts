import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import {
  evaluateAssertion,
  evaluateSemanticAssertion,
  evaluateStepAssertions,
  AssertionRule,
} from './assertionAgent.js';
import { runExecutorAgent, ExecutionSummary } from './executorAgent.js';
import type { TestPlan, TestStep } from './journeyPlanner.js';

/**
 * ---------------------------------------------------------------------------
 * Day 8 Verification Suite: Assertion Agent
 * ---------------------------------------------------------------------------
 * Verifies DOM & state inspection, atomic assertions (TEXT, VISIBLE, HIDDEN,
 * URL, COUNT, VALUE, ATTRIBUTE), negative assertion diffing, post-action
 * outcome verification, semantic validation, and end-to-end QA metrics.
 *
 * Run with:
 *   npx tsx src/ai/testAssertions.ts
 */
async function testAssertionAgent() {
  console.log('\n🔍 --- Starting Day 8 Assertion Agent Verification ---\n');

  const mockHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>AnyTask QA Test Store - Order Confirmation</title>
        <style>
          .hidden { display: none; }
          .badge { padding: 4px 8px; border-radius: 4px; }
          .success { background: #d4edda; color: #155724; }
        </style>
      </head>
      <body>
        <header>
          <h1 id="store-title">AnyTask Autonomous Store</h1>
          <nav>
            <span id="cart-counter">3</span> items in cart
          </nav>
        </header>

        <main id="main-content">
          <div id="order-banner" class="badge success" data-order-status="CONFIRMED" data-order-id="ORD-9842">
            Order #ORD-9842 Confirmed! Thank you for your purchase.
          </div>

          <section id="customer-details">
            <h2>Customer Information</h2>
            <input id="email-field" type="email" value="qa.lead@anytask.ai" />
            <input id="promo-code" type="text" value="AUTONOMOUS2026" />
          </section>

          <section id="order-items">
            <h3>Purchased Items</h3>
            <ul id="items-list">
              <li class="item-row">Item 1: Wireless Headset ($99.00)</li>
              <li class="item-row">Item 2: Mechanical Keyboard ($129.00)</li>
              <li class="item-row">Item 3: USB-C Hub ($39.00)</li>
            </ul>
          </section>

          <button id="toggle-details-btn" onclick="
            var el = document.getElementById('debug-details');
            el.style.display = (el.style.display === 'none' ? 'block' : 'none');
          ">Toggle Details</button>

          <div id="debug-details" style="display:none;">Transaction hash: 0x88924fca12</div>
          <div id="hidden-element" class="hidden">This is hidden</div>
        </main>
      </body>
    </html>
  `;

  // Hook chromium.launch to serve our mock page offline
  const originalLaunch = chromium.launch.bind(chromium);
  chromium.launch = async (options) => {
    const realBrowser = await originalLaunch(options);
    const originalNewContext = realBrowser.newContext.bind(realBrowser);

    realBrowser.newContext = async (contextOptions) => {
      const realCtx = await originalNewContext(contextOptions);

      await realCtx.route('http://assertion-test.local/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: mockHtml,
        });
      });

      return realCtx;
    };

    return realBrowser;
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://assertion-test.local/order-confirmed');

  // =========================================================================
  // Part 1: Atomic Assertion Evaluators (All Core Types)
  // =========================================================================
  console.log('Testing Part 1: Atomic Assertion Evaluator on live DOM...');

  // 1. TEXT_CONTAINS
  const textContainsRes = await evaluateAssertion(page, {
    type: 'TEXT_CONTAINS',
    selector: '#order-banner',
    expected: 'Confirmed!',
  });
  console.log(`  ✓ TEXT_CONTAINS: ${textContainsRes.status} (${textContainsRes.message})`);
  if (textContainsRes.status !== 'PASS') throw new Error('TEXT_CONTAINS failed');

  // 2. TEXT_EQUALS
  const textEqualsRes = await evaluateAssertion(page, {
    type: 'TEXT_EQUALS',
    selector: '#store-title',
    expected: 'AnyTask Autonomous Store',
  });
  console.log(`  ✓ TEXT_EQUALS: ${textEqualsRes.status} (${textEqualsRes.message})`);
  if (textEqualsRes.status !== 'PASS') throw new Error('TEXT_EQUALS failed');

  // 3. ELEMENT_VISIBLE
  const visibleRes = await evaluateAssertion(page, {
    type: 'ELEMENT_VISIBLE',
    selector: '#order-banner',
    expected: 'visible',
  });
  console.log(`  ✓ ELEMENT_VISIBLE: ${visibleRes.status} (${visibleRes.message})`);
  if (visibleRes.status !== 'PASS') throw new Error('ELEMENT_VISIBLE failed');

  // 4. ELEMENT_HIDDEN
  const hiddenRes = await evaluateAssertion(page, {
    type: 'ELEMENT_HIDDEN',
    selector: '#hidden-element',
    expected: 'hidden',
  });
  console.log(`  ✓ ELEMENT_HIDDEN: ${hiddenRes.status} (${hiddenRes.message})`);
  if (hiddenRes.status !== 'PASS') throw new Error('ELEMENT_HIDDEN failed');

  // 5. URL_CONTAINS
  const urlRes = await evaluateAssertion(page, {
    type: 'URL_CONTAINS',
    expected: 'assertion-test.local/order-confirmed',
  });
  console.log(`  ✓ URL_CONTAINS: ${urlRes.status} (${urlRes.message})`);
  if (urlRes.status !== 'PASS') throw new Error('URL_CONTAINS failed');

  // 6. ELEMENT_COUNT
  const countRes = await evaluateAssertion(page, {
    type: 'ELEMENT_COUNT',
    selector: '.item-row',
    expected: 3,
  });
  console.log(`  ✓ ELEMENT_COUNT: ${countRes.status} (${countRes.message})`);
  if (countRes.status !== 'PASS') throw new Error('ELEMENT_COUNT failed');

  // 7. INPUT_VALUE
  const valueRes = await evaluateAssertion(page, {
    type: 'INPUT_VALUE',
    selector: '#email-field',
    expected: 'qa.lead@anytask.ai',
  });
  console.log(`  ✓ INPUT_VALUE: ${valueRes.status} (${valueRes.message})`);
  if (valueRes.status !== 'PASS') throw new Error('INPUT_VALUE failed');

  // 8. ATTRIBUTE_VALUE
  const attrRes = await evaluateAssertion(page, {
    type: 'ATTRIBUTE_VALUE',
    selector: '#order-banner',
    attributeName: 'data-order-status',
    expected: 'CONFIRMED',
  });
  console.log(`  ✓ ATTRIBUTE_VALUE: ${attrRes.status} (${attrRes.message})`);
  if (attrRes.status !== 'PASS') throw new Error('ATTRIBUTE_VALUE failed');

  // =========================================================================
  // Part 2: Negative Assertion Failure Handling & Diagnostics
  // =========================================================================
  console.log('\nTesting Part 2: Negative assertion handling & diagnostics diffing...');

  const failedTextRes = await evaluateAssertion(page, {
    type: 'TEXT_CONTAINS',
    selector: '#order-banner',
    expected: 'Order Cancelled',
  });
  console.log(`  ✓ Expected failure caught: ${failedTextRes.status} - "${failedTextRes.message}"`);
  if (failedTextRes.status !== 'FAIL') {
    throw new Error('Expected failure was not flagged as FAIL');
  }
  if (!failedTextRes.actual || !failedTextRes.expected) {
    throw new Error('Missing expected vs actual diagnostic diff in failed assertion');
  }

  const failedCountRes = await evaluateAssertion(page, {
    type: 'ELEMENT_COUNT',
    selector: '.item-row',
    expected: 99,
  });
  console.log(`  ✓ Count mismatch caught: ${failedCountRes.status} - "${failedCountRes.message}"`);
  if (failedCountRes.status !== 'FAIL') throw new Error('Expected count mismatch was not flagged');

  const missingElemRes = await evaluateAssertion(page, {
    type: 'TEXT_CONTAINS',
    selector: '#non-existent-selector',
    expected: 'Any Text',
  });
  console.log(`  ✓ Missing element caught gracefully: ${missingElemRes.status} - "${missingElemRes.message}"`);
  if (missingElemRes.status !== 'FAIL') throw new Error('Missing element must return FAIL');

  // =========================================================================
  // Part 3: Post-Action State Verification
  // =========================================================================
  console.log('\nTesting Part 3: Post-Action Step Assertion Verification...');

  // Step that triggers a state change and has post-step assertions
  await page.click('#toggle-details-btn');

  const stepWithAssertions: TestStep = {
    stepNumber: 1,
    description: 'Toggle and verify transaction details',
    action: 'ASSERT_VISIBLE',
    selector: '#debug-details',
    expectedOutcome: 'Debug details panel visible with transaction hash',
  };

  const stepReport = await evaluateStepAssertions(page, stepWithAssertions);
  console.log(`  ✓ Step Report: ${stepReport.passedCount}/${stepReport.total} passed (Overall: ${stepReport.passed ? 'PASS' : 'FAIL'})`);
  if (!stepReport.passed || stepReport.passedCount === 0) {
    throw new Error('Post-action step assertion failed');
  }

  // =========================================================================
  // Part 4: Semantic Assertion Verification
  // =========================================================================
  console.log('\nTesting Part 4: Semantic Natural Language Outcome Verification...');

  const semanticPass = await evaluateSemanticAssertion(
    page,
    'Order confirmed thank you message shown with order number'
  );
  console.log(`  ✓ Semantic Match [Positive]: ${semanticPass.status} - "${semanticPass.message}"`);
  if (semanticPass.status !== 'PASS') {
    throw new Error('Positive semantic assertion failed');
  }

  const semanticFail = await evaluateSemanticAssertion(
    page,
    'User account deleted confirmation'
  );
  console.log(`  ✓ Semantic Match [Negative]: ${semanticFail.status} - "${semanticFail.message}"`);
  if (semanticFail.status !== 'FAIL') {
    throw new Error('Negative semantic assertion should have failed');
  }

  await browser.close();

  // =========================================================================
  // Part 5: Full Executor Integration & QA Assertion Metrics
  // =========================================================================
  console.log('\nTesting Part 5: End-to-end Executor Agent with Assertion QA Metrics...');

  const testPlan: TestPlan = {
    id: 'plan_assertion_day8',
    targetBaseUrl: 'http://assertion-test.local/order-confirmed',
    generatedAt: new Date().toISOString(),
    summary: 'Day 8 Assertion Agent End-to-End Test Plan',
    journeys: [
      {
        id: 'journey_order_validation',
        title: 'Order Status & Elements Validation',
        description: 'Validate order confirmation, elements count, and text contents.',
        priority: 'HIGH',
        steps: [
          {
            stepNumber: 1,
            description: 'Navigate to confirmation screen',
            action: 'NAVIGATE',
            targetUrl: 'http://assertion-test.local/order-confirmed',
          },
          {
            stepNumber: 2,
            description: 'Verify order banner is visible',
            action: 'ASSERT_VISIBLE',
            selector: '#order-banner',
          },
          {
            stepNumber: 3,
            description: 'Verify order confirmation text',
            action: 'ASSERT_TEXT',
            selector: '#order-banner',
            value: 'Confirmed!',
          },
          {
            stepNumber: 4,
            description: 'Verify 3 items displayed in order summary',
            action: 'ASSERT_COUNT',
            selector: '.item-row',
            value: '3',
          },
          {
            stepNumber: 5,
            description: 'Verify customer email input value',
            action: 'ASSERT_VALUE',
            selector: '#email-field',
            value: 'qa.lead@anytask.ai',
          },
        ],
      },
    ],
  };

  const logs: string[] = [];
  const testLogger = async (step: string, msg: string, level = 'INFO') => {
    logs.push(`[${level}] ${step}: ${msg}`);
  };

  const screenshotDir = path.resolve(process.cwd(), 'test-results', 'screenshots');
  const summary: ExecutionSummary = await runExecutorAgent(testPlan, testLogger, {
    headless: true,
    screenshotDir,
    stepDelayMs: 30,
  });

  // Restore launch
  chromium.launch = originalLaunch;

  console.log(`\n📊 --- Day 8 QA Execution Metrics ---`);
  console.log(`Total Journeys:     ${summary.totalJourneys}`);
  console.log(`Passed Journeys:    ${summary.passedJourneys}`);
  console.log(`Total Assertions:   ${summary.totalAssertions}`);
  console.log(`Passed Assertions:  ${summary.passedAssertions}`);
  console.log(`Failed Assertions:  ${summary.failedAssertions}`);
  console.log(`Total Duration:     ${summary.totalDurationMs}ms\n`);

  if (summary.passedJourneys !== 1) {
    throw new Error(`Expected 1 passed journey, got ${summary.passedJourneys}`);
  }

  if (summary.totalAssertions !== 4) {
    throw new Error(`Expected 4 total assertions, got ${summary.totalAssertions}`);
  }

  if (summary.passedAssertions !== 4) {
    throw new Error(`Expected 4 passed assertions, got ${summary.passedAssertions}`);
  }

  if (summary.failedAssertions !== 0) {
    throw new Error(`Expected 0 failed assertions, got ${summary.failedAssertions}`);
  }

  // Verify step level assertion report presence
  const journey = summary.results[0];
  const assertStep = journey.steps.find((s) => s.action === 'ASSERT_TEXT');
  if (!assertStep?.assertionReport || assertStep.assertionReport.passedCount !== 1) {
    throw new Error('Step assertion report missing or invalid for ASSERT_TEXT');
  }

  console.log('🎉 DAY 8 ASSERTION AGENT VERIFIED AND PASSING WITH FULL QA METRICS!\n');
}

testAssertionAgent().catch((err) => {
  console.error('❌ Day 8 Assertion Agent test failed:', err);
  process.exit(1);
});
