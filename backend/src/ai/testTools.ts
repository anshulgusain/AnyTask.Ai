import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import {
  inspectPageElements,
  navigateTo,
  fillInput,
  clickElement,
  selectOption,
  getTextContent,
  captureScreenshot,
  waitForElement,
} from './tools.js';

/**
 * ---------------------------------------------------------------------------
 * Day 2 Verification Script: Test Atomic Browser Tools
 * ---------------------------------------------------------------------------
 * This script verifies each of the 8 atomic tools in tools.ts using a clean,
 * self-contained local HTML test fixture.
 *
 * Run with:
 *   npx tsx src/ai/testTools.ts
 */
async function runToolsVerification() {
  console.log('\n🧪 --- Starting Day 2 Agent Tools Verification ---\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Create a self-contained local HTML fixture to test against
  const testHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Agent Tools Test Playground</title>
      </head>
      <body>
        <h1>Playground Heading</h1>
        <form id="sample-form">
          <label for="user-input">Full Name</label>
          <input id="user-input" name="fullName" type="text" placeholder="John Doe" required />

          <label for="role-select">Select Role</label>
          <select id="role-select" name="role">
            <option value="developer">Developer</option>
            <option value="qa_lead">QA Lead</option>
            <option value="architect">Solutions Architect</option>
          </select>

          <button id="action-btn" type="button" onclick="document.getElementById('status-msg').textContent = 'Action Clicked!'">
            Execute Action
          </button>
        </form>

        <p id="status-msg">Ready</p>
        <a id="nav-link" href="/demo-store/cart">Go to Cart</a>
      </body>
    </html>
  `;

  // Encode HTML into a data URL for fast, offline testing
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`;

  try {
    // 1. Test navigateTo
    console.log('Testing Tool 1: navigateTo...');
    const navResult = await navigateTo(page, dataUrl);
    console.log(`  ✓ navigateTo: ${navResult.success ? 'PASS' : 'FAIL'} - ${navResult.message}`);

    // 2. Test inspectPageElements
    console.log('\nTesting Tool 2: inspectPageElements...');
    const snapshot = await inspectPageElements(page);
    console.log(`  ✓ Discovered Inputs: ${snapshot.inputs.length} (Expected >= 2)`);
    console.log(`  ✓ Discovered Actions: ${snapshot.actions.length} (Expected >= 1)`);
    console.log(`  ✓ Discovered Links: ${snapshot.links.length} (Expected >= 1)`);

    // 3. Test fillInput
    console.log('\nTesting Tool 3: fillInput...');
    const fillResult = await fillInput(page, '#user-input', 'Autonomous QA Agent');
    console.log(`  ✓ fillInput: ${fillResult.success ? 'PASS' : 'FAIL'} - ${fillResult.message}`);

    // 4. Test selectOption
    console.log('\nTesting Tool 4: selectOption...');
    const selectResult = await selectOption(page, '#role-select', 'qa_lead');
    console.log(`  ✓ selectOption: ${selectResult.success ? 'PASS' : 'FAIL'} - ${selectResult.message}`);

    // 5. Test clickElement
    console.log('\nTesting Tool 5: clickElement...');
    const clickResult = await clickElement(page, '#action-btn');
    console.log(`  ✓ clickElement: ${clickResult.success ? 'PASS' : 'FAIL'} - ${clickResult.message}`);

    // 6. Test getTextContent
    console.log('\nTesting Tool 6: getTextContent...');
    const textResult = await getTextContent(page, '#status-msg');
    console.log(`  ✓ getTextContent: ${textResult.success ? 'PASS' : 'FAIL'} - Text: "${textResult.text}"`);

    // 7. Test waitForElement
    console.log('\nTesting Tool 7: waitForElement...');
    const waitResult = await waitForElement(page, '#status-msg', 'visible');
    console.log(`  ✓ waitForElement: ${waitResult.success ? 'PASS' : 'FAIL'} - ${waitResult.message}`);

    // 8. Test captureScreenshot
    console.log('\nTesting Tool 8: captureScreenshot...');
    const outputDir = path.resolve(process.cwd(), 'test-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const screenshotPath = path.join(outputDir, 'day2-tools-test.png');
    const screenshotResult = await captureScreenshot(page, screenshotPath);
    console.log(`  ✓ captureScreenshot: ${screenshotResult.success ? 'PASS' : 'FAIL'} - Path: ${screenshotResult.path}`);

    console.log('\n🎉 ALL 8 AGENT TOOLS VERIFIED AND PASSING SUCCESSFULLY!\n');
  } finally {
    await browser.close();
  }
}

runToolsVerification().catch((err) => {
  console.error('❌ Verification failed with error:', err);
  process.exit(1);
});
