import { chromium, Browser, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import {
  navigateTo,
  fillInput,
  clickElement,
  selectOption,
  getTextContent,
  captureScreenshot,
  waitForElement,
} from './tools.js';
import type { TestPlan, TestJourney, TestStep, TestStepAction } from './journeyPlanner.js';
import type { LogCallback } from './browserAgent.js';

// ---------------------------------------------------------------------------
// Execution Result Types
// ---------------------------------------------------------------------------

export interface StepExecutionResult {
  stepNumber: number;
  action: TestStepAction;
  description: string;
  success: boolean;
  message: string;
  durationMs: number;
  screenshotPath?: string;
  timestamp: string;
}

export interface JourneyExecutionResult {
  journeyId: string;
  title: string;
  success: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  durationMs: number;
  steps: StepExecutionResult[];
}

export interface ExecutionSummary {
  planId: string;
  targetBaseUrl: string;
  totalJourneys: number;
  passedJourneys: number;
  failedJourneys: number;
  totalDurationMs: number;
  executedAt: string;
  results: JourneyExecutionResult[];
}

export interface DestructiveCheckResult {
  isDestructive: boolean;
  reason?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface DestructiveActionRequest {
  step: TestStep;
  journeyId: string;
  reason: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  previewScreenshotPath?: string;
}

export type ActionApprovalCallback = (
  req: DestructiveActionRequest,
  page: Page
) => Promise<{ approved: boolean; notes?: string }>;

export interface ExecutorOptions {
  headless?: boolean;
  screenshotDir?: string;
  stopOnFailure?: boolean;
  stepDelayMs?: number;
  onDestructiveAction?: ActionApprovalCallback;
  autoApproveDestructive?: boolean;
  requireActionApproval?: boolean;
}

/**
 * Evaluates whether a test step performs an irreversible or high-risk operation
 * (e.g. submitting financial transactions, checkout, deleting data, confirming destructive state).
 */
export function isDestructiveAction(step: TestStep): DestructiveCheckResult {
  if (step.isDestructive) {
    return {
      isDestructive: true,
      reason: 'Step explicitly flagged as destructive in TestPlan',
      riskLevel: step.riskLevel || 'HIGH',
    };
  }

  if (step.riskLevel === 'HIGH' || step.riskLevel === 'CRITICAL') {
    return {
      isDestructive: true,
      reason: `Step has elevated risk classification: ${step.riskLevel}`,
      riskLevel: step.riskLevel,
    };
  }

  // Pure navigation or read-only assertions are non-destructive by default
  if (step.action === 'NAVIGATE' || step.action === 'ASSERT_TEXT' || step.action === 'ASSERT_VISIBLE') {
    return {
      isDestructive: false,
      riskLevel: 'LOW',
    };
  }

  const combinedText = `${step.action} ${step.selector || ''} ${step.description || ''} ${step.value || ''}`.toLowerCase();

  // Financial / Checkout / Order Placement Patterns on CLICK
  if (
    step.action === 'CLICK' &&
    /\b(pay|payment|purchase|checkout|buy|charge|place\s*order|submit-order)\b/i.test(combinedText)
  ) {
    return {
      isDestructive: true,
      reason: 'Financial payment or order placement transaction detected',
      riskLevel: 'CRITICAL',
    };
  }

  // Irreversible Submission / Deletion Patterns
  if (
    step.action === 'CLICK' &&
    /\b(submit|delete|remove|destroy|terminate|drop|purge|reset)\b/i.test(combinedText)
  ) {
    return {
      isDestructive: true,
      reason: 'Irreversible action or form submission detected',
      riskLevel: 'HIGH',
    };
  }

  return {
    isDestructive: false,
    riskLevel: 'LOW',
  };
}

/**
 * ---------------------------------------------------------------------------
 * Executor Agent (Day 6)
 * ---------------------------------------------------------------------------
 * The execution engine of AnyTask.AI.
 * Takes an approved TestPlan and executes each journey and step sequentially
 * using the atomic tools in tools.ts.
 *
 * For each step:
 * 1. Dispatches the corresponding Playwright action.
 * 2. Captures milestone screenshot evidence to disk.
 * 3. Records step execution latency and pass/fail diagnostics.
 * 4. Streams real-time progress via the LogCallback.
 */
export async function runExecutorAgent(
  plan: TestPlan,
  log?: LogCallback,
  options: ExecutorOptions = {}
): Promise<ExecutionSummary> {
  const isHeadless = options.headless ?? true;
  const screenshotDir =
    options.screenshotDir || path.resolve(process.cwd(), 'test-results', 'screenshots');
  const stopOnFailure = options.stopOnFailure ?? false;
  const stepDelayMs = options.stepDelayMs ?? 200;

  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const emitLog: LogCallback = async (step, msg, level = 'INFO', meta) => {
    if (log) {
      await log(step, msg, level, meta);
    } else {
      console.log(`[${step}] (${level}) ${msg}`);
    }
  };

  await emitLog(
    'EXECUTION_START',
    `Starting execution of TestPlan "${plan.id}" with ${plan.journeys.length} journeys...`,
    'INFO',
    { planId: plan.id, journeysCount: plan.journeys.length }
  );

  const startTime = Date.now();
  const journeyResults: JourneyExecutionResult[] = [];

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: isHeadless });
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    for (const journey of plan.journeys) {
      const journeyStart = Date.now();
      await emitLog(
        'JOURNEY_START',
        `Starting Journey: "${journey.title}" (${journey.steps.length} steps)`,
        'INFO',
        { journeyId: journey.id, priority: journey.priority }
      );

      const stepResults: StepExecutionResult[] = [];
      let journeySuccess = true;

      for (const step of journey.steps) {
        const stepStart = Date.now();
        await emitLog(
          'STEP_DISPATCH',
          `Step ${step.stepNumber}/${journey.steps.length} [${step.action}]: ${step.description}`,
          'INFO',
          { stepNumber: step.stepNumber, action: step.action }
        );

        let actionSuccess = false;
        let actionMessage = '';

        // -------------------------------------------------------------------
        // 🛡️ HITL Gate 2: Intercept Destructive / High-Risk Actions
        // -------------------------------------------------------------------
        const destructiveCheck = isDestructiveAction(step);
        let actionApproved = true;
        let approvalNotes: string | undefined;

        const hasApprovalHandler = Boolean(options.onDestructiveAction);
        const shouldIntercept =
          destructiveCheck.isDestructive &&
          !options.autoApproveDestructive &&
          (hasApprovalHandler || options.requireActionApproval);

        if (shouldIntercept) {
          // Capture pre-action preview screenshot
          const previewFileName = `${plan.id}_${journey.id}_step_${step.stepNumber}_gate2_preview.png`;
          const previewFilePath = path.join(screenshotDir, previewFileName);
          const previewRes = await captureScreenshot(page, previewFilePath);

          await emitLog(
            'HITL_GATE2_INTERCEPT',
            `⚠️ HITL Gate 2: Destructive action intercepted at Step ${step.stepNumber} [${step.action}]: ${destructiveCheck.reason}`,
            'WARN',
            {
              stepNumber: step.stepNumber,
              riskLevel: destructiveCheck.riskLevel,
              reason: destructiveCheck.reason,
              previewScreenshot: previewRes.path,
            }
          );

          if (options.onDestructiveAction) {
            const decision = await options.onDestructiveAction(
              {
                step,
                journeyId: journey.id,
                reason: destructiveCheck.reason || 'Destructive action detected',
                riskLevel: destructiveCheck.riskLevel,
                previewScreenshotPath: previewRes.success ? previewRes.path : undefined,
              },
              page
            );

            actionApproved = decision.approved;
            approvalNotes = decision.notes;
          } else {
            actionApproved = false;
            approvalNotes = 'Destructive action blocked: human engineer approval required.';
          }

          if (actionApproved) {
            await emitLog(
              'HITL_GATE2_APPROVED',
              `✓ HITL Gate 2: Engineer APPROVED step ${step.stepNumber}.${approvalNotes ? ` Notes: ${approvalNotes}` : ''}`,
              'SUCCESS',
              { stepNumber: step.stepNumber, notes: approvalNotes }
            );
          } else {
            await emitLog(
              'HITL_GATE2_REJECTED',
              `⛔ HITL Gate 2: Engineer REJECTED step ${step.stepNumber}.${approvalNotes ? ` Reason: ${approvalNotes}` : ''}`,
              'WARN',
              { stepNumber: step.stepNumber, notes: approvalNotes }
            );
          }
        } else if (destructiveCheck.isDestructive) {
          await emitLog(
            'DESTRUCTIVE_NOTICE',
            `Step ${step.stepNumber} [${step.action}] is classified as ${destructiveCheck.riskLevel} risk (${destructiveCheck.reason}) - executing in automated mode.`,
            'INFO',
            { stepNumber: step.stepNumber, riskLevel: destructiveCheck.riskLevel }
          );
        }

        if (!actionApproved) {
          actionSuccess = false;
          actionMessage = `Skipped by engineer at HITL Gate 2: ${approvalNotes || 'Destructive action rejected'}`;
        } else {
          try {
            switch (step.action) {
            case 'NAVIGATE': {
              const url = step.targetUrl || plan.targetBaseUrl;
              const res = await navigateTo(page, url);
              actionSuccess = res.success;
              actionMessage = res.message;
              break;
            }
            case 'CLICK': {
              if (!step.selector) throw new Error('Missing selector for CLICK action');
              const res = await clickElement(page, step.selector);
              actionSuccess = res.success;
              actionMessage = res.message;
              break;
            }
            case 'FILL': {
              if (!step.selector) throw new Error('Missing selector for FILL action');
              const val = step.value ?? '';
              const res = await fillInput(page, step.selector, val);
              actionSuccess = res.success;
              actionMessage = res.message;
              break;
            }
            case 'SELECT': {
              if (!step.selector) throw new Error('Missing selector for SELECT action');
              const val = step.value ?? '';
              const res = await selectOption(page, step.selector, val);
              actionSuccess = res.success;
              actionMessage = res.message;
              break;
            }
            case 'ASSERT_TEXT': {
              if (!step.selector) throw new Error('Missing selector for ASSERT_TEXT action');
              const res = await getTextContent(page, step.selector);
              if (res.success && step.value) {
                const matches = res.text?.includes(step.value);
                actionSuccess = Boolean(matches);
                actionMessage = matches
                  ? `Text matches expected substring: "${step.value}"`
                  : `Text mismatch. Got: "${res.text}", expected: "${step.value}"`;
              } else {
                actionSuccess = res.success;
                actionMessage = res.message;
              }
              break;
            }
            case 'ASSERT_VISIBLE': {
              if (!step.selector) throw new Error('Missing selector for ASSERT_VISIBLE action');
              const res = await waitForElement(page, step.selector, 'visible', 5000);
              actionSuccess = res.success;
              actionMessage = res.message;
              break;
            }
            default:
              throw new Error(`Unsupported action type: ${(step as any).action}`);
          }
        } catch (err: any) {
          actionSuccess = false;
          actionMessage = `Execution error: ${err.message}`;
        }
      }

        const durationMs = Date.now() - stepStart;

        // Capture milestone screenshot evidence
        const screenshotFileName = `${plan.id}_${journey.id}_step_${step.stepNumber}.png`;
        const screenshotFilePath = path.join(screenshotDir, screenshotFileName);
        const screenshotRes = await captureScreenshot(page, screenshotFilePath);

        const stepResult: StepExecutionResult = {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          success: actionSuccess,
          message: actionMessage,
          durationMs,
          screenshotPath: screenshotRes.success ? screenshotRes.path : undefined,
          timestamp: new Date().toISOString(),
        };

        stepResults.push(stepResult);

        if (actionSuccess) {
          await emitLog(
            'STEP_PASS',
            `✓ Step ${step.stepNumber} PASSED (${durationMs}ms): ${actionMessage}`,
            'SUCCESS',
            { stepNumber: step.stepNumber, screenshot: screenshotRes.path }
          );
        } else {
          journeySuccess = false;
          await emitLog(
            'STEP_FAIL',
            `✗ Step ${step.stepNumber} FAILED (${durationMs}ms): ${actionMessage}`,
            'ERROR',
            { stepNumber: step.stepNumber, screenshot: screenshotRes.path }
          );

          if (stopOnFailure) {
            await emitLog('JOURNEY_ABORT', `Aborting journey due to step failure.`, 'WARN');
            break;
          }
        }

        if (stepDelayMs > 0) {
          await page.waitForTimeout(stepDelayMs);
        }
      }

      const journeyDuration = Date.now() - journeyStart;
      const passedSteps = stepResults.filter((s) => s.success).length;
      const failedSteps = stepResults.filter((s) => !s.success).length;

      journeyResults.push({
        journeyId: journey.id,
        title: journey.title,
        success: journeySuccess,
        totalSteps: stepResults.length,
        passedSteps,
        failedSteps,
        durationMs: journeyDuration,
        steps: stepResults,
      });

      await emitLog(
        journeySuccess ? 'JOURNEY_PASS' : 'JOURNEY_FAIL',
        `Journey "${journey.title}" finished: ${passedSteps}/${stepResults.length} steps passed (${journeyDuration}ms).`,
        journeySuccess ? 'SUCCESS' : 'WARN'
      );
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const passedJourneys = journeyResults.filter((j) => j.success).length;
  const failedJourneys = journeyResults.filter((j) => !j.success).length;

  const summary: ExecutionSummary = {
    planId: plan.id,
    targetBaseUrl: plan.targetBaseUrl,
    totalJourneys: journeyResults.length,
    passedJourneys,
    failedJourneys,
    totalDurationMs,
    executedAt: new Date().toISOString(),
    results: journeyResults,
  };

  await emitLog(
    'EXECUTION_COMPLETE',
    `Execution complete: ${passedJourneys}/${journeyResults.length} journeys passed in ${totalDurationMs}ms.`,
    failedJourneys === 0 ? 'SUCCESS' : 'WARN',
    { passedJourneys, failedJourneys, totalDurationMs }
  );

  return summary;
}
