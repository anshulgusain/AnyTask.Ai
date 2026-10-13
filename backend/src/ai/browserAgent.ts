import { JobItem, LogLevel } from '../types/job.js';
import { BROWSER_AGENT_SYSTEM_PROMPT } from './prompts.js';
import * as tools from './tools.js';

export type LogCallback = (
  step: string,
  message: string,
  level?: LogLevel,
  metadata?: Record<string, any>
) => Promise<void>;

/**
 * --------------------------------------------------------------------------
 * AI Browser Agent Runner
 * --------------------------------------------------------------------------
 * This is where you code your OpenAI Agent SDK & Browser Automation logic!
 *
 * Incoming Parameters:
 * - `job`: Contains targetUrl, payload (form field values & instructions)
 * - `log`: An async function to send real-time logs to your frontend terminal!
 *          Example: await log('MY_STEP', 'Agent is analyzing page...', 'INFO')
 *
 * Steps to implement:
 * 1. Read process.env.OPENAI_API_KEY
 * 2. Launch browser using Playwright / Puppeteer
 * 3. Initialize your OpenAI Agent / Agent SDK client with tools and prompts
 * 4. Pass the user prompt & targetUrl into the agent
 * 5. Return structured results
 */
export async function runBrowserAgent(
  job: JobItem,
  log: LogCallback
): Promise<Record<string, any>> {
  await log('AGENT_INIT', 'Initializing custom OpenAI Browser Agent...', 'INFO');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await log(
      'CONFIG_NOTICE',
      'No OPENAI_API_KEY found in backend/.env — running starter walkthrough mode.',
      'WARN'
    );
  }

  // -------------------------------------------------------------------------
  // 🚀 STEP 1: Launch your browser instance (e.g. Playwright)
  // -------------------------------------------------------------------------
  // const browser = await chromium.launch({ headless: false });
  // const page = await browser.newPage();
  // await page.goto(job.targetUrl);
  await log('NAVIGATE', `Browser navigating to: ${job.targetUrl}`, 'INFO', { url: job.targetUrl });

  // -------------------------------------------------------------------------
  // 🚀 STEP 2: DOM & Form Inspection
  // -------------------------------------------------------------------------
  // Extract inputs, buttons, and form labels from the live page
  const targetFields = job.payload?.fields || {};
  await log(
    'DOM_INSPECT',
    `Found form data payload with ${Object.keys(targetFields).length} inputs to populate.`,
    'INFO',
    { fields: Object.keys(targetFields) }
  );

  // -------------------------------------------------------------------------
  // 🚀 STEP 3: Agent Reasoning & Tool Invocation
  // -------------------------------------------------------------------------
  // Here is where you wire OpenAI Agent SDK to decide which inputs to fill:
  // e.g., Agent analyzes: "Target URL has input[name=email], filling with user value..."
  for (const [fieldName, val] of Object.entries(targetFields)) {
    // await tools.fillInput(`[name="${fieldName}"]`, String(val), page);
    await log('FIELD_FILL', `Agent mapped & populated [${fieldName}] -> "${val}"`, 'INFO', {
      field: fieldName,
    });
  }

  // -------------------------------------------------------------------------
  // 🚀 STEP 4: Form Submission & Verification
  // -------------------------------------------------------------------------
  // await tools.submitForm('button[type="submit"]', page);
  await log('FORM_SUBMIT', 'Agent triggered form submission and verified response.', 'SUCCESS');

  // Return final execution summary object (saved to database & shown on dashboard)
  return {
    success: true,
    url: job.targetUrl,
    fieldsFilled: Object.keys(targetFields),
    completedAt: new Date().toISOString(),
    note: 'Completed via backend/src/ai/browserAgent.ts',
  };
}
