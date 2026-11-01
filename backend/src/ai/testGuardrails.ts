// ---------------------------------------------------------------------------
// Day 9: Guardrails Verification Test
// ---------------------------------------------------------------------------
// Unit-style tests for the GuardrailsChecker. No real browser required.
// Run with: npm run test:guardrails
// ---------------------------------------------------------------------------

import {
  GuardrailsChecker,
  createGuardrailsConfig,
  type StepFingerprint,
  type GuardrailStepResult,
} from './guardrails.js';

// ---------------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Part 1: Loop Detection
// ---------------------------------------------------------------------------

async function testLoopDetection(): Promise<void> {
  console.log('\nTesting Part 1: Loop Detection...');

  const checker = new GuardrailsChecker(
    createGuardrailsConfig({ loopDetectionThreshold: 3 })
  );

  const fp: StepFingerprint = {
    url: 'https://example.com/login',
    selector: '#submit-btn',
    action: 'CLICK',
  };
  const domain = 'example.com';
  const okResult: GuardrailStepResult = { success: true, durationMs: 100, pageUrlAfter: 'https://example.com/login', isNavigation: false };

  const v1 = await checker.checkBeforeStep(fp, domain);
  assert(v1.allowed && v1.code === 'ALLOW', 'First visit allowed (no loop)');
  checker.recordStepResult(okResult);

  const v2 = await checker.checkBeforeStep(fp, domain);
  assert(v2.allowed && v2.code === 'ALLOW', 'Second visit allowed (within threshold)');
  checker.recordStepResult(okResult);

  const v3 = await checker.checkBeforeStep(fp, domain);
  assert(v3.allowed && v3.code === 'ALLOW', 'Third visit allowed (at threshold)');
  checker.recordStepResult(okResult);

  const v4 = await checker.checkBeforeStep(fp, domain);
  assert(!v4.allowed && v4.code === 'LOOP_DETECTED', 'Fourth visit detected as LOOP (threshold exceeded)');
}

// ---------------------------------------------------------------------------
// Part 2: Step Budget Enforcement
// ---------------------------------------------------------------------------

async function testStepBudget(): Promise<void> {
  console.log('\nTesting Part 2: Step Budget Enforcement...');

  const checker = new GuardrailsChecker(
    createGuardrailsConfig({ maxSteps: 50 })
  );

  const domain = 'example.com';
  const okResult: GuardrailStepResult = { success: true, durationMs: 50, pageUrlAfter: 'https://example.com', isNavigation: false };

  let allAllowed = true;
  for (let i = 1; i <= 50; i++) {
    const fp: StepFingerprint = { url: `https://example.com/step/${i}`, selector: '', action: 'NAVIGATE' };
    const v = await checker.checkBeforeStep(fp, domain);
    if (!v.allowed) { allAllowed = false; break; }
    checker.recordStepResult(okResult);
  }
  assert(allAllowed, 'Step 1-50: within budget');

  // Step 51 should be blocked
  const fp51: StepFingerprint = { url: 'https://example.com/step/51', selector: '', action: 'NAVIGATE' };
  const v51 = await checker.checkBeforeStep(fp51, domain);
  assert(!v51.allowed && v51.code === 'STEP_BUDGET_EXCEEDED', 'Step 51: over-budget correctly blocked');
}

// ---------------------------------------------------------------------------
// Part 3: Consecutive Error Budget
// ---------------------------------------------------------------------------

async function testErrorBudget(): Promise<void> {
  console.log('\nTesting Part 3: Consecutive Error Budget...');

  const checker = new GuardrailsChecker(
    createGuardrailsConfig({ maxConsecutiveErrors: 5 })
  );

  const domain = 'example.com';
  const failResult: GuardrailStepResult = { success: false, durationMs: 100, pageUrlAfter: 'https://example.com', isNavigation: false };

  // Pump in 4 failures
  for (let i = 1; i <= 4; i++) {
    const fp: StepFingerprint = { url: `https://example.com/fail/${i}`, selector: '#btn', action: 'CLICK' };
    const v = await checker.checkBeforeStep(fp, domain);
    checker.recordStepResult(failResult);
    // should still be allowed
    if (i === 4) {
      assert(v.allowed, '4 consecutive failures: still running');
    }
  }

  // 5th failure attempt — check BEFORE recording (consecutiveErrors is still 4 here)
  const fp5: StepFingerprint = { url: 'https://example.com/fail/5', selector: '#btn', action: 'CLICK' };
  const v5 = await checker.checkBeforeStep(fp5, domain);
  // Record 5th failure so consecutiveErrors becomes 5
  checker.recordStepResult(failResult);

  // Now the 6th attempt should be halted
  const fp6: StepFingerprint = { url: 'https://example.com/fail/6', selector: '#btn', action: 'CLICK' };
  const v6 = await checker.checkBeforeStep(fp6, domain);
  assert(!v6.allowed && v6.code === 'ERROR_BUDGET_EXCEEDED', '5th consecutive failure: HALTED correctly');
}

// ---------------------------------------------------------------------------
// Part 4: Rate Limiter Timing
// ---------------------------------------------------------------------------

async function testRateLimiter(): Promise<void> {
  console.log('\nTesting Part 4: Rate Limiter (Timing)...');

  const minInterval = 200; // Use a short interval so the test stays fast
  const checker = new GuardrailsChecker(
    createGuardrailsConfig({ minActionIntervalMs: minInterval })
  );

  const domain = 'target.com';
  const fp: StepFingerprint = { url: 'https://target.com/page', selector: '#btn', action: 'CLICK' };
  const okResult: GuardrailStepResult = { success: true, durationMs: 10, pageUrlAfter: 'https://target.com/page', isNavigation: false };

  // First request — no previous action on this domain
  const v1 = await checker.checkBeforeStep(fp, domain);
  assert(v1.allowed && v1.delayMs === 0, 'First request allowed immediately');
  checker.recordStepResult(okResult);

  // Second request — immediately after; should produce a non-zero delay
  const v2 = await checker.checkBeforeStep(fp, domain);
  assert(v2.allowed && v2.delayMs > 0, 'Second request on same domain throttled correctly');
}

// ---------------------------------------------------------------------------
// Part 5: Idle Page Detection
// ---------------------------------------------------------------------------

async function testIdlePageDetection(): Promise<void> {
  console.log('\nTesting Part 5: Idle Page Detection...');

  const checker = new GuardrailsChecker(
    createGuardrailsConfig({ idlePageThreshold: 3 })
  );

  const domain = 'example.com';
  const okResult: GuardrailStepResult = { success: true, durationMs: 80, pageUrlAfter: 'https://example.com/a', isNavigation: true };

  // Navigate to different URLs — should be fine
  const fpA: StepFingerprint = { url: 'https://example.com/a', selector: '', action: 'NAVIGATE' };
  const fpB: StepFingerprint = { url: 'https://example.com/b', selector: '', action: 'NAVIGATE' };
  const fpC: StepFingerprint = { url: 'https://example.com/c', selector: '', action: 'NAVIGATE' };

  const vA = await checker.checkBeforeStep(fpA, domain);
  checker.recordStepResult(okResult);
  const vB = await checker.checkBeforeStep(fpB, domain);
  checker.recordStepResult(okResult);
  const vC = await checker.checkBeforeStep(fpC, domain);
  checker.recordStepResult(okResult);

  assert(
    vA.allowed && vB.allowed && vC.allowed,
    'Different URLs: not stuck'
  );

  // Now navigate to the SAME URL 3 times in a row
  const checker2 = new GuardrailsChecker(
    createGuardrailsConfig({ idlePageThreshold: 3 })
  );

  const fpSame: StepFingerprint = { url: 'https://example.com/stuck', selector: '', action: 'NAVIGATE' };

  await checker2.checkBeforeStep(fpSame, domain);
  checker2.recordStepResult(okResult);
  await checker2.checkBeforeStep(fpSame, domain);
  checker2.recordStepResult(okResult);
  const vStuck = await checker2.checkBeforeStep(fpSame, domain);

  assert(!vStuck.allowed && vStuck.code === 'IDLE_PAGE_DETECTED', 'Same URL repeated 3 times: STUCK detected');
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n🛡️  --- Starting Day 9 Guardrails Verification ---');

  await testLoopDetection();
  await testStepBudget();
  await testErrorBudget();
  await testRateLimiter();
  await testIdlePageDetection();

  console.log(`\n${'─'.repeat(60)}`);
  if (failed === 0) {
    console.log(`🎉 DAY 9 GUARDRAILS VERIFIED AND PASSING! (${passed} tests passed)`);
    process.exit(0);
  } else {
    console.error(`❌ ${failed} test(s) FAILED, ${passed} passed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
