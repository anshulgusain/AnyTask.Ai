import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import {
  runExecutorAgent,
  isDestructiveAction,
  ExecutionSummary,
} from './executorAgent.js';
import { TestPlan } from './journeyPlanner.js';
import { JobService } from '../services/jobService.js';
import type { TestStep } from './journeyPlanner.js';

/**
 * ---------------------------------------------------------------------------
 * Day 7 Verification: HITL Gate 2 (Destructive Action Interception)
 * ---------------------------------------------------------------------------
 * Verifies that the Agent execution loop halts before destructive actions
 * (placing orders, charging cards, submitting irreversible forms), takes a
 * pre-action milestone screenshot, and requires explicit engineer sign-off.
 *
 * Run with:
 *   npx tsx src/ai/testHitlGate2.ts
 */
async function testHitlGate2() {
  console.log('\n🛡️  --- Starting Day 7 HITL Gate 2 Verification ---\n');

  // =========================================================================
  // Part 1: Unit Verification of Heuristic & Explicit Destructive Detection
  // =========================================================================
  console.log('Testing Part 1: Heuristic and explicit destructive action detection...');

  const sampleSteps: Array<{ step: TestStep; expectedDestructive: boolean }> = [
    {
      step: {
        stepNumber: 1,
        action: 'NAVIGATE',
        description: 'Browse to catalog',
        targetUrl: 'http://localhost:3000/demo-store',
      },
      expectedDestructive: false,
    },
    {
      step: {
        stepNumber: 2,
        action: 'FILL',
        description: 'Fill card number',
        selector: '#card-number',
        value: '4242424242424242',
      },
      expectedDestructive: false,
    },
    {
      step: {
        stepNumber: 3,
        action: 'CLICK',
        description: 'Click button to place order',
        selector: '#submit-order-btn',
      },
      expectedDestructive: true,
    },
    {
      step: {
        stepNumber: 4,
        action: 'CLICK',
        description: 'Pay Now ($48.00)',
        selector: '.pay-button',
      },
      expectedDestructive: true,
    },
    {
      step: {
        stepNumber: 5,
        action: 'CLICK',
        description: 'Delete user account',
        selector: '#delete-account-btn',
      },
      expectedDestructive: true,
    },
    {
      step: {
        stepNumber: 6,
        action: 'CLICK',
        description: 'Custom flagged step',
        selector: '#custom-btn',
        isDestructive: true,
      },
      expectedDestructive: true,
    },
  ];

  for (const { step, expectedDestructive } of sampleSteps) {
    const res = isDestructiveAction(step);
    if (res.isDestructive !== expectedDestructive) {
      throw new Error(
        `isDestructiveAction mismatch on step ${step.stepNumber} [${step.description}]: Expected ${expectedDestructive}, got ${res.isDestructive}`
      );
    }
    console.log(
      `  ✓ Step ${step.stepNumber} [${step.action}] ("${step.description}"): Destructive=${res.isDestructive}${
        res.isDestructive ? ` [${res.riskLevel}: ${res.reason}]` : ''
      }`
    );
  }

  // =========================================================================
  // Part 2: End-to-End Rejection Flow (Destructive Action Intercepted & Denied)
  // =========================================================================
  console.log('\nTesting Part 2: End-to-end rejection flow (human denies destructive step)...');

  const mockHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>HITL Gate 2 Storefront</title></head>
      <body>
        <h1>Storefront</h1>
        <input id="email" type="email" />
        <button id="submit-order-btn" onclick="document.getElementById('status').textContent = 'ORDER_SUBMITTED';">
          Place Order
        </button>
        <div id="status">INITIAL</div>
      </body>
    </html>
  `;

  // Setup route interception for test
  const originalLaunch = chromium.launch.bind(chromium);
  chromium.launch = async (options) => {
    const realBrowser = await originalLaunch(options);
    const originalNewContext = realBrowser.newContext.bind(realBrowser);

    realBrowser.newContext = async (contextOptions) => {
      const realCtx = await originalNewContext(contextOptions);
      await realCtx.route('http://hitl2-test.local/**', async (route) => {
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

  const testPlan: TestPlan = {
    id: 'plan_hitl2_test',
    targetBaseUrl: 'http://hitl2-test.local/',
    generatedAt: new Date().toISOString(),
    summary: 'HITL Gate 2 Order Submission Verification',
    journeys: [
      {
        id: 'journey_checkout',
        title: 'Checkout Flow with Gate 2 Protection',
        description: 'Verify placing an order is intercepted by Gate 2.',
        priority: 'HIGH',
        steps: [
          {
            stepNumber: 1,
            action: 'NAVIGATE',
            description: 'Navigate to checkout page',
            targetUrl: 'http://hitl2-test.local/',
          },
          {
            stepNumber: 2,
            action: 'FILL',
            description: 'Fill customer email',
            selector: '#email',
            value: 'tester@anytask.ai',
          },
          {
            stepNumber: 3,
            action: 'CLICK',
            description: 'Submit order form (Destructive)',
            selector: '#submit-order-btn',
            isDestructive: true,
            riskLevel: 'CRITICAL',
          },
        ],
      },
    ],
  };

  const logs: Array<{ step: string; message: string; level?: string }> = [];
  const testLogger = async (step: string, msg: string, level = 'INFO') => {
    logs.push({ step, message: msg, level });
    console.log(`  [${level}] ${step}: ${msg}`);
  };

  // Rejection callback: simulate human reviewing pre-action screenshot and rejecting
  let gate2Triggered = false;
  let preScreenshotCaptured = false;

  const rejectionSummary: ExecutionSummary = await runExecutorAgent(
    testPlan,
    testLogger,
    {
      headless: true,
      stopOnFailure: false,
      onDestructiveAction: async (req) => {
        gate2Triggered = true;
        console.log(`\n  🛑 [HITL Gate 2 Interception Event]`);
        console.log(`     Action:       ${req.step.action} on ${req.step.selector}`);
        console.log(`     Risk Level:   ${req.riskLevel}`);
        console.log(`     Reason:       ${req.reason}`);
        console.log(`     Preview Shot: ${req.previewScreenshotPath}`);

        if (req.previewScreenshotPath && fs.existsSync(req.previewScreenshotPath)) {
          preScreenshotCaptured = true;
        }

        // Simulate human engineer rejecting the live order placement
        return {
          approved: false,
          notes: 'QA Engineer declined order placement in staging environment.',
        };
      },
    }
  );

  if (!gate2Triggered) {
    throw new Error('Gate 2 failed to intercept destructive step!');
  }
  if (!preScreenshotCaptured) {
    throw new Error('Pre-action preview screenshot was not captured by Gate 2!');
  }

  const rejectedStepResult = rejectionSummary.results[0].steps[2];
  if (rejectedStepResult.success) {
    throw new Error('Destructive step was executed despite rejection!');
  }
  console.log(`  ✓ Gate 2 prevented execution: "${rejectedStepResult.message}"`);

  // =========================================================================
  // Part 3: End-to-End Approval Flow (Destructive Action Intercepted & Approved)
  // =========================================================================
  console.log('\nTesting Part 3: End-to-end approval flow (human approves destructive step)...');

  let approvedGate2 = false;
  const approvalSummary: ExecutionSummary = await runExecutorAgent(
    testPlan,
    testLogger,
    {
      headless: true,
      onDestructiveAction: async (req) => {
        approvedGate2 = true;
        return {
          approved: true,
          notes: 'QA Lead signed off for test order verification.',
        };
      },
    }
  );

  if (!approvedGate2) {
    throw new Error('Gate 2 failed to trigger on approval flow!');
  }

  const approvedStepResult = approvalSummary.results[0].steps[2];
  if (!approvedStepResult.success) {
    throw new Error(`Approved step failed execution: ${approvedStepResult.message}`);
  }
  console.log(`  ✓ Approved step executed successfully: "${approvedStepResult.message}"`);

  // =========================================================================
  // Part 4: JobService State Machine & Double-Action Guard Verification
  // =========================================================================
  console.log('\nTesting Part 4: JobService Gate 2 lifecycle & double-action guard...');

  const job = await JobService.createJob({
    title: 'E2E Autonomous QA with Gate 2',
    type: 'AUTONOMOUS_QA',
    targetUrl: 'http://localhost:3000/demo-store',
  });

  // 1. Pause job at Gate 2
  const pendingActionData = {
    stepNumber: 3,
    journeyId: 'journey_checkout',
    action: 'CLICK',
    selector: '#submit-order-btn',
    description: 'Submit order and charge card',
    reason: 'Financial payment detected',
    screenshotPath: '/path/to/preview.png',
    timestamp: new Date().toISOString(),
  };

  const pausedJob = await JobService.setActionAwaitingApproval(job.id, pendingActionData);
  console.log(`  ✓ Job status: ${pausedJob.status} (Expected: AWAITING_ACTION_APPROVAL)`);
  console.log(`  ✓ Pending Action: [${pausedJob.pendingAction?.action}] on ${pausedJob.pendingAction?.selector}`);

  if (pausedJob.status !== 'AWAITING_ACTION_APPROVAL' || !pausedJob.pendingAction) {
    throw new Error('Failed to transition job to AWAITING_ACTION_APPROVAL');
  }

  // 2. Query pending action via API method
  const queriedAction = await JobService.getPendingAction(job.id);
  if (!queriedAction || queriedAction.stepNumber !== 3) {
    throw new Error('Failed to retrieve pending action from JobService');
  }
  console.log(`  ✓ Successfully queried pending action for Job ID ${job.id}`);

  // 3. Human approves destructive action
  const resumedJob = await JobService.approveAction(job.id, true, 'Approved by test suite');
  console.log(`  ✓ Job status after approval: ${resumedJob.status} (Expected: RUNNING)`);
  console.log(`  ✓ Pending action cleared: ${resumedJob.pendingAction === undefined}`);
  console.log(`  ✓ Recorded in history: ${resumedJob.actionApprovalHistory?.length} records`);

  if (resumedJob.status !== 'RUNNING' || resumedJob.pendingAction !== undefined) {
    throw new Error('Failed to resume job status after approval');
  }

  // 4. Double-action guard prevents invalid state transition
  let guardTriggered = false;
  try {
    await JobService.approveAction(job.id, true);
  } catch (err: any) {
    guardTriggered = true;
    console.log(`  ✓ Double-action guard caught invalid transition: "${err.message}"`);
  }

  if (!guardTriggered) {
    throw new Error('Guard failed: Allowed approving an action when not in AWAITING_ACTION_APPROVAL');
  }

  console.log('\n🎉 DAY 7 HITL GATE 2 VERIFIED AND PASSING SUCCESSFULLY!\n');
}

testHitlGate2().catch((err) => {
  console.error('❌ Day 7 HITL Gate 2 test failed:', err);
  process.exit(1);
});
