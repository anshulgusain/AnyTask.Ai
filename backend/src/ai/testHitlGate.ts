import { JobService } from '../services/jobService.js';
import { generateDeterministicPlan } from './journeyPlanner.js';
import type { SiteMap } from './discoveryAgent.js';

/**
 * ---------------------------------------------------------------------------
 * Day 5 Verification: HITL Gate 1 (Plan Approval Workflow)
 * ---------------------------------------------------------------------------
 * Verifies that the agent pipeline enforces a human approval checkpoint
 * between plan generation and execution.
 *
 * Run with:
 *   npx tsx src/ai/testHitlGate.ts
 */
async function testHitlGate() {
  console.log('\n🛡️  --- Starting Day 5 HITL Gate 1 Verification ---\n');

  // 1. Prepare sample SiteMap and TestPlan
  const mockSiteMap: SiteMap = {
    baseUrl: 'http://localhost:3000/demo-store',
    totalPages: 2,
    discoveredAt: new Date().toISOString(),
    pages: {
      'http://localhost:3000/demo-store': {
        url: 'http://localhost:3000/demo-store',
        title: 'Catalog',
        inputs: [],
        actions: [{ selector: '#add-btn', text: 'Add to Cart', type: 'button' }],
        links: [{ text: 'Checkout', href: '/demo-store/checkout', isInternal: true }],
      },
    },
  };

  const plan = generateDeterministicPlan(mockSiteMap, 'Test primary checkout');

  // 2. Test Transition: Job Creation -> AWAITING_PLAN_APPROVAL
  console.log('Testing Step 1: Pausing execution at HITL Gate 1...');
  const job = await JobService.createJob({
    title: 'Autonomous E2E Store Test',
    type: 'AUTONOMOUS_QA',
    targetUrl: 'http://localhost:3000/demo-store',
  });

  const pausedJob = await JobService.setPlanAwaitingApproval(job.id, plan);
  console.log(`  ✓ Job status: ${pausedJob.status} (Expected: AWAITING_PLAN_APPROVAL)`);
  console.log(`  ✓ Attached Plan ID: ${pausedJob.plan?.id}`);

  if (pausedJob.status !== 'AWAITING_PLAN_APPROVAL') {
    throw new Error(`Expected AWAITING_PLAN_APPROVAL, got ${pausedJob.status}`);
  }

  // 3. Test Rejection flow
  console.log('\nTesting Step 2: Human rejects the plan...');
  const rejectionNotes = 'Need to verify empty cart validation before purchasing.';
  const rejectedJob = await JobService.approvePlan(job.id, false, rejectionNotes);
  console.log(`  ✓ Job status after rejection: ${rejectedJob.status} (Expected: CANCELLED)`);
  console.log(`  ✓ Plan approved flag: ${rejectedJob.planApproved} (Expected: false)`);

  if (rejectedJob.status !== 'CANCELLED' || rejectedJob.planApproved !== false) {
    throw new Error('Rejection handling failed');
  }

  // 4. Test Approval flow with a new job
  console.log('\nTesting Step 3: Human approves the plan for execution...');
  const job2 = await JobService.createJob({
    title: 'Autonomous Store Test 2',
    type: 'AUTONOMOUS_QA',
    targetUrl: 'http://localhost:3000/demo-store',
  });

  await JobService.setPlanAwaitingApproval(job2.id, plan);
  const approvedJob = await JobService.approvePlan(
    job2.id,
    true,
    'Plan reviewed and approved by QA Lead'
  );

  console.log(`  ✓ Job status after approval: ${approvedJob.status} (Expected: RUNNING)`);
  console.log(`  ✓ Plan approved flag: ${approvedJob.planApproved} (Expected: true)`);
  console.log(`  ✓ Approval notes: "${approvedJob.planApprovalNotes}"`);

  if (approvedJob.status !== 'RUNNING' || approvedJob.planApproved !== true) {
    throw new Error('Approval handling failed');
  }

  // 5. Test Double-Approval Guard (Prevent race condition)
  console.log('\nTesting Step 4: Double-action guard prevents invalid transitions...');
  let guardTriggered = false;
  try {
    await JobService.approvePlan(job2.id, true);
  } catch (err: any) {
    guardTriggered = true;
    console.log(`  ✓ Guard successfully caught invalid state: "${err.message}"`);
  }

  if (!guardTriggered) {
    throw new Error('Guard failed: Allowed re-approving a job that was not in AWAITING_PLAN_APPROVAL');
  }

  // 6. Review Job Logs to confirm audit trail
  const finalJob = await JobService.getJobById(job2.id);
  const logSteps = (finalJob?.logs || []).map((l) => l.step);
  console.log(`\n  ✓ Audit log trail: [${logSteps.join(' -> ')}]`);

  console.log('\n🎉 DAY 5 HITL GATE 1 VERIFIED AND PASSING SUCCESSFULLY!\n');
}

testHitlGate().catch((err) => {
  console.error('❌ Day 5 HITL Gate verification failed:', err);
  process.exit(1);
});
