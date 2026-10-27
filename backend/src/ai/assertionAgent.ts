import { Page } from 'playwright';
import { getTextContent, waitForElement } from './tools.js';
import type { TestStep } from './journeyPlanner.js';
import type { LogCallback } from './browserAgent.js';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// TypeScript Interfaces & Types for Day 8 Assertion Agent
// ---------------------------------------------------------------------------

export type AssertionType =
  | 'TEXT_CONTAINS'
  | 'TEXT_EQUALS'
  | 'ELEMENT_VISIBLE'
  | 'ELEMENT_HIDDEN'
  | 'URL_CONTAINS'
  | 'URL_EQUALS'
  | 'ELEMENT_COUNT'
  | 'INPUT_VALUE'
  | 'ATTRIBUTE_VALUE'
  | 'SEMANTIC_MATCH';

export interface AssertionRule {
  id?: string;
  type: AssertionType;
  selector?: string;
  expected: any;
  attributeName?: string;
  description?: string;
  timeoutMs?: number;
}

export interface AssertionOutcome {
  id: string;
  type: AssertionType;
  status: 'PASS' | 'FAIL';
  target?: string;
  expected: any;
  actual: any;
  message: string;
  durationMs: number;
  domSnippet?: string;
  timestamp: string;
}

export interface StepAssertionReport {
  stepNumber: number;
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  outcomes: AssertionOutcome[];
}

export interface SemanticAssertionOptions {
  apiKey?: string;
  model?: string;
}

/**
 * ---------------------------------------------------------------------------
 * Day 8: Assertion Agent
 * ---------------------------------------------------------------------------
 * The Assertion Agent acts as the automated QA verification engine.
 * It inspects the live browser DOM, extracts runtime states, compares them
 * against expected assertions, and records comprehensive PASS / FAIL diagnostics.
 */

/**
 * Evaluates a single assertion rule against the active Playwright page.
 */
export async function evaluateAssertion(
  page: Page,
  rule: AssertionRule
): Promise<AssertionOutcome> {
  const startTime = Date.now();
  const ruleId = rule.id || `assert_${crypto.randomUUID().slice(0, 8)}`;
  const timeoutMs = rule.timeoutMs || 4000;

  try {
    switch (rule.type) {
      case 'TEXT_CONTAINS': {
        if (!rule.selector) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, rule.expected, null, 'Missing selector for TEXT_CONTAINS', startTime);
        }
        const res = await getTextContent(page, rule.selector);
        if (!res.success) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, rule.expected, null, `Target element not found: ${res.message}`, startTime);
        }
        const actualText = res.text || '';
        const expectedSubstring = String(rule.expected);
        const passed = actualText.toLowerCase().includes(expectedSubstring.toLowerCase());
        const snippet = await getElementSnippet(page, rule.selector);

        return createOutcome(
          ruleId,
          rule.type,
          passed ? 'PASS' : 'FAIL',
          rule.selector,
          expectedSubstring,
          actualText,
          passed
            ? `Text contains expected substring "${expectedSubstring}"`
            : `Text mismatch: Expected to contain "${expectedSubstring}", but got "${actualText.slice(0, 80)}"`,
          startTime,
          snippet
        );
      }

      case 'TEXT_EQUALS': {
        if (!rule.selector) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, rule.expected, null, 'Missing selector for TEXT_EQUALS', startTime);
        }
        const res = await getTextContent(page, rule.selector);
        if (!res.success) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, rule.expected, null, `Target element not found: ${res.message}`, startTime);
        }
        const actualText = (res.text || '').trim();
        const expectedText = String(rule.expected).trim();
        const passed = actualText === expectedText;
        const snippet = await getElementSnippet(page, rule.selector);

        return createOutcome(
          ruleId,
          rule.type,
          passed ? 'PASS' : 'FAIL',
          rule.selector,
          expectedText,
          actualText,
          passed
            ? `Text strictly equals "${expectedText}"`
            : `Text mismatch: Expected exact "${expectedText}", but got "${actualText}"`,
          startTime,
          snippet
        );
      }

      case 'ELEMENT_VISIBLE': {
        if (!rule.selector) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, true, false, 'Missing selector for ELEMENT_VISIBLE', startTime);
        }
        const res = await waitForElement(page, rule.selector, 'visible', timeoutMs);
        const snippet = res.success ? await getElementSnippet(page, rule.selector) : undefined;

        return createOutcome(
          ruleId,
          rule.type,
          res.success ? 'PASS' : 'FAIL',
          rule.selector,
          'visible',
          res.success ? 'visible' : 'hidden/detached',
          res.success
            ? `Element ${rule.selector} is visible in viewport`
            : `Element ${rule.selector} is not visible within ${timeoutMs}ms`,
          startTime,
          snippet
        );
      }

      case 'ELEMENT_HIDDEN': {
        if (!rule.selector) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, true, false, 'Missing selector for ELEMENT_HIDDEN', startTime);
        }
        const res = await waitForElement(page, rule.selector, 'hidden', timeoutMs);

        return createOutcome(
          ruleId,
          rule.type,
          res.success ? 'PASS' : 'FAIL',
          rule.selector,
          'hidden',
          res.success ? 'hidden' : 'visible',
          res.success
            ? `Element ${rule.selector} is hidden or absent as expected`
            : `Element ${rule.selector} remains visible`,
          startTime
        );
      }

      case 'URL_CONTAINS': {
        const currentUrl = page.url();
        const expectedFragment = String(rule.expected);
        const passed = currentUrl.toLowerCase().includes(expectedFragment.toLowerCase());

        return createOutcome(
          ruleId,
          rule.type,
          passed ? 'PASS' : 'FAIL',
          'window.location.href',
          expectedFragment,
          currentUrl,
          passed
            ? `URL contains expected fragment "${expectedFragment}"`
            : `URL mismatch: Expected URL to contain "${expectedFragment}", but current URL is "${currentUrl}"`,
          startTime
        );
      }

      case 'URL_EQUALS': {
        const currentUrl = page.url();
        const expectedUrl = String(rule.expected);
        const passed = currentUrl === expectedUrl;

        return createOutcome(
          ruleId,
          rule.type,
          passed ? 'PASS' : 'FAIL',
          'window.location.href',
          expectedUrl,
          currentUrl,
          passed
            ? `URL strictly equals "${expectedUrl}"`
            : `URL mismatch: Expected "${expectedUrl}", but got "${currentUrl}"`,
          startTime
        );
      }

      case 'ELEMENT_COUNT': {
        if (!rule.selector) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, rule.expected, 0, 'Missing selector for ELEMENT_COUNT', startTime);
        }
        const elements = await page.$$(rule.selector);
        const actualCount = elements.length;
        const expectedCount = Number(rule.expected);
        const passed = actualCount === expectedCount;

        return createOutcome(
          ruleId,
          rule.type,
          passed ? 'PASS' : 'FAIL',
          rule.selector,
          expectedCount,
          actualCount,
          passed
            ? `Element count for ${rule.selector} matches expected (${expectedCount})`
            : `Element count mismatch: Expected ${expectedCount} elements for ${rule.selector}, but found ${actualCount}`,
          startTime
        );
      }

      case 'INPUT_VALUE': {
        if (!rule.selector) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, rule.expected, null, 'Missing selector for INPUT_VALUE', startTime);
        }
        const actualValue = await page.$eval(
          rule.selector,
          (el: any) => el.value ?? el.getAttribute('value') ?? ''
        ).catch(() => null);

        if (actualValue === null) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, rule.expected, null, `Could not read value for ${rule.selector}`, startTime);
        }

        const expectedValue = String(rule.expected);
        const passed = String(actualValue) === expectedValue;
        const snippet = await getElementSnippet(page, rule.selector);

        return createOutcome(
          ruleId,
          rule.type,
          passed ? 'PASS' : 'FAIL',
          rule.selector,
          expectedValue,
          actualValue,
          passed
            ? `Input ${rule.selector} value matches expected "${expectedValue}"`
            : `Input value mismatch: Expected "${expectedValue}", got "${actualValue}"`,
          startTime,
          snippet
        );
      }

      case 'ATTRIBUTE_VALUE': {
        if (!rule.selector || !rule.attributeName) {
          return createOutcome(ruleId, rule.type, 'FAIL', rule.selector, rule.expected, null, 'Missing selector or attributeName for ATTRIBUTE_VALUE', startTime);
        }
        const attrVal = await page.$eval(
          rule.selector,
          (el: any, attr: string) => el.getAttribute(attr),
          rule.attributeName
        ).catch(() => null);

        const expectedVal = String(rule.expected);
        const passed = String(attrVal) === expectedVal;
        const snippet = await getElementSnippet(page, rule.selector);

        return createOutcome(
          ruleId,
          rule.type,
          passed ? 'PASS' : 'FAIL',
          `${rule.selector}[${rule.attributeName}]`,
          expectedVal,
          attrVal,
          passed
            ? `Attribute ${rule.attributeName} matches "${expectedVal}"`
            : `Attribute mismatch: Expected ${rule.attributeName}="${expectedVal}", but got "${attrVal}"`,
          startTime,
          snippet
        );
      }

      case 'SEMANTIC_MATCH': {
        return await evaluateSemanticAssertion(page, String(rule.expected), rule.description);
      }

      default:
        return createOutcome(
          ruleId,
          rule.type,
          'FAIL',
          rule.selector,
          rule.expected,
          null,
          `Unsupported assertion type: ${(rule as any).type}`,
          startTime
        );
    }
  } catch (err: any) {
    return createOutcome(
      ruleId,
      rule.type,
      'FAIL',
      rule.selector,
      rule.expected,
      null,
      `Assertion execution error: ${err.message}`,
      startTime
    );
  }
}

/**
 * Evaluates semantic/natural language assertions against the live page context.
 * Performs fast heuristic semantic analysis, or uses OpenAI LLM when configured.
 */
export async function evaluateSemanticAssertion(
  page: Page,
  expectedOutcome: string,
  contextHint?: string,
  options: SemanticAssertionOptions = {}
): Promise<AssertionOutcome> {
  const startTime = Date.now();
  const ruleId = `semantic_${crypto.randomUUID().slice(0, 8)}`;

  try {
    // Extract key page text signals
    const pageData = await page.evaluate(() => {
      const title = document.title || '';
      const h1s = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => h.textContent?.trim()).filter(Boolean);
      const alerts = Array.from(document.querySelectorAll('[role="alert"], .alert, .badge, [data-status], .success, .error, .confirmed'))
        .map((el) => el.textContent?.trim())
        .filter(Boolean);
      const bodyText = document.body?.innerText?.slice(0, 3000) || '';
      return { title, headings: h1s, alerts, bodyText };
    });

    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;

    // If OpenAI key is present, attempt LLM semantic reasoning
    if (apiKey) {
      try {
        const { OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey });

        const completion = await openai.chat.completions.create({
          model: options.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are an expert QA Assertion Agent. Evaluate whether the current web page state satisfies the expected outcome. Respond strictly with valid JSON: {"pass": boolean, "reason": "brief explanation"}',
            },
            {
              role: 'user',
              content: `Expected Outcome: "${expectedOutcome}"\nContext Hint: "${contextHint || ''}"\nPage Title: "${pageData.title}"\nHeadings: ${JSON.stringify(pageData.headings)}\nAlerts/Badges: ${JSON.stringify(pageData.alerts)}\nVisible Page Text Snippet:\n${pageData.bodyText.slice(0, 1500)}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        });

        const parsed = JSON.parse(completion.choices[0].message?.content || '{}');
        const passed = Boolean(parsed.pass);

        return createOutcome(
          ruleId,
          'SEMANTIC_MATCH',
          passed ? 'PASS' : 'FAIL',
          'semantic-dom-eval',
          expectedOutcome,
          pageData.title,
          passed
            ? `Semantic assertion passed (LLM verified): ${parsed.reason || 'Outcome confirmed'}`
            : `Semantic assertion failed (LLM verified): ${parsed.reason || 'Expected state not found'}`,
          startTime,
          pageData.bodyText.slice(0, 200)
        );
      } catch (err: any) {
        // Fall back to heuristic matching if LLM request fails
      }
    }

    // Heuristic semantic evaluation
    const normalizedExpectation = expectedOutcome.toLowerCase();
    const keywords = normalizedExpectation
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['and', 'the', 'for', 'with', 'has', 'been', 'appears', 'shown', 'verify'].includes(w));

    const combinedPageText = `${pageData.title} ${pageData.headings.join(' ')} ${pageData.alerts.join(' ')} ${pageData.bodyText}`.toLowerCase();

    // Check how many keywords match
    const matchedKeywords = keywords.filter((k) => combinedPageText.includes(k));
    const matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 1;

    // Also check for explicit negative indicators if testing success
    const hasNegativeAlert = /\b(failed|error|invalid|declined|unauthorized|denied)\b/i.test(pageData.alerts.join(' '));
    const expectsSuccess = /\b(success|confirmed|placed|complete|passed|thank)\b/i.test(normalizedExpectation);

    const passed = (matchRatio >= 0.6 || combinedPageText.includes(normalizedExpectation)) && !(expectsSuccess && hasNegativeAlert);

    return createOutcome(
      ruleId,
      'SEMANTIC_MATCH',
      passed ? 'PASS' : 'FAIL',
      'semantic-heuristic-eval',
      expectedOutcome,
      `Matched ${matchedKeywords.length}/${keywords.length} keywords (${Math.round(matchRatio * 100)}%)`,
      passed
        ? `Semantic assertion passed: DOM state matches expected outcome ("${expectedOutcome}")`
        : `Semantic assertion failed: Page state did not satisfy "${expectedOutcome}" (matched: ${matchedKeywords.join(', ') || 'none'})`,
      startTime,
      pageData.bodyText.slice(0, 200)
    );
  } catch (err: any) {
    return createOutcome(
      ruleId,
      'SEMANTIC_MATCH',
      'FAIL',
      'semantic-eval',
      expectedOutcome,
      null,
      `Semantic evaluation error: ${err.message}`,
      startTime
    );
  }
}

/**
 * Evaluates all assertions associated with a TestStep.
 * Automatically handles:
 * 1. Dedicated assertion steps (ASSERT_TEXT, ASSERT_VISIBLE, etc.)
 * 2. Explicit rule arrays defined in step.assertions
 * 3. Step expectedOutcome semantic assertions
 */
export async function evaluateStepAssertions(
  page: Page,
  step: TestStep,
  log?: LogCallback
): Promise<StepAssertionReport> {
  const outcomes: AssertionOutcome[] = [];

  // 1. If step is a dedicated assertion action, evaluate its primary rule
  const dedicatedRule = mapStepToAssertionRule(step);
  if (dedicatedRule) {
    const outcome = await evaluateAssertion(page, dedicatedRule);
    outcomes.push(outcome);

    if (log) {
      const level = outcome.status === 'PASS' ? 'SUCCESS' : 'ERROR';
      const icon = outcome.status === 'PASS' ? '✓' : '✗';
      await log(
        `ASSERTION_${outcome.status}`,
        `${icon} Assertion [${outcome.type}]: ${outcome.message}`,
        level,
        {
          stepNumber: step.stepNumber,
          type: outcome.type,
          expected: outcome.expected,
          actual: outcome.actual,
          status: outcome.status,
        }
      );
    }
  }

  // 2. If step contains an explicit assertions array
  if ((step as any).assertions && Array.isArray((step as any).assertions)) {
    for (const rule of (step as any).assertions) {
      const outcome = await evaluateAssertion(page, rule);
      outcomes.push(outcome);

      if (log) {
        const level = outcome.status === 'PASS' ? 'SUCCESS' : 'ERROR';
        const icon = outcome.status === 'PASS' ? '✓' : '✗';
        await log(
          `ASSERTION_${outcome.status}`,
          `${icon} Assertion [${outcome.type}]: ${outcome.message}`,
          level,
          {
            stepNumber: step.stepNumber,
            type: outcome.type,
            expected: outcome.expected,
            actual: outcome.actual,
            status: outcome.status,
          }
        );
      }
    }
  }

  // 3. If step is an action (CLICK/FILL/NAVIGATE) with an expectedOutcome and no dedicated assertion rule,
  // evaluate the expectedOutcome semantically
  if (!dedicatedRule && step.expectedOutcome) {
    const outcome = await evaluateSemanticAssertion(page, step.expectedOutcome, step.description);
    outcomes.push(outcome);

    if (log) {
      const level = outcome.status === 'PASS' ? 'SUCCESS' : 'ERROR';
      const icon = outcome.status === 'PASS' ? '✓' : '✗';
      await log(
        `ASSERTION_${outcome.status}`,
        `${icon} Expected Outcome: ${outcome.message}`,
        level,
        {
          stepNumber: step.stepNumber,
          type: outcome.type,
          expected: outcome.expected,
          status: outcome.status,
        }
      );
    }
  }

  const passedCount = outcomes.filter((o) => o.status === 'PASS').length;
  const failedCount = outcomes.filter((o) => o.status === 'FAIL').length;
  const passed = failedCount === 0;

  return {
    stepNumber: step.stepNumber,
    passed,
    total: outcomes.length,
    passedCount,
    failedCount,
    outcomes,
  };
}

/**
 * Maps a TestStep action to an AssertionRule if it represents an assertion.
 */
export function mapStepToAssertionRule(step: TestStep): AssertionRule | null {
  switch (step.action) {
    case 'ASSERT_TEXT':
      return {
        type: 'TEXT_CONTAINS',
        selector: step.selector,
        expected: step.value || step.expectedOutcome || '',
        description: step.description,
      };
    case 'ASSERT_VISIBLE':
      return {
        type: 'ELEMENT_VISIBLE',
        selector: step.selector,
        expected: 'visible',
        description: step.description,
      };
    case 'ASSERT_HIDDEN':
      return {
        type: 'ELEMENT_HIDDEN',
        selector: step.selector,
        expected: 'hidden',
        description: step.description,
      };
    case 'ASSERT_URL':
      return {
        type: 'URL_CONTAINS',
        expected: step.value || step.targetUrl || '',
        description: step.description,
      };
    case 'ASSERT_COUNT':
      return {
        type: 'ELEMENT_COUNT',
        selector: step.selector,
        expected: Number(step.value || 1),
        description: step.description,
      };
    case 'ASSERT_VALUE':
      return {
        type: 'INPUT_VALUE',
        selector: step.selector,
        expected: step.value || '',
        description: step.description,
      };
    case 'ASSERT_SEMANTIC':
      return {
        type: 'SEMANTIC_MATCH',
        expected: step.expectedOutcome || step.value || step.description,
        description: step.description,
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createOutcome(
  id: string,
  type: AssertionType,
  status: 'PASS' | 'FAIL',
  target: string | undefined,
  expected: any,
  actual: any,
  message: string,
  startTime: number,
  domSnippet?: string
): AssertionOutcome {
  return {
    id,
    type,
    status,
    target,
    expected,
    actual,
    message,
    durationMs: Date.now() - startTime,
    domSnippet,
    timestamp: new Date().toISOString(),
  };
}

async function getElementSnippet(page: Page, selector: string): Promise<string | undefined> {
  try {
    const snippet = await page.$eval(selector, (el) => {
      const outer = el.outerHTML || '';
      return outer.length > 250 ? outer.slice(0, 250) + '...' : outer;
    });
    return snippet;
  } catch {
    return undefined;
  }
}
