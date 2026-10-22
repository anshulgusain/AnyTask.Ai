import { runJourneyPlanner, TestPlan, TestPlanSchema } from './journeyPlanner.js';
import type { SiteMap } from './discoveryAgent.js';

/**
 * ---------------------------------------------------------------------------
 * Day 4 Verification: Journey Planner Agent Test
 * ---------------------------------------------------------------------------
 * This script verifies that the Journey Planner Agent can take a SiteMap JSON
 * and formulate a structured, executable TestPlan with multi-step journeys.
 *
 * Run with:
 *   npx tsx src/ai/testPlanner.ts
 */
async function testJourneyPlanner() {
  console.log('\n🧠 --- Starting Day 4 Journey Planner Agent Test ---\n');

  // Realistic mock SiteMap representing the Demo Store (from Day 1 & Day 3)
  const mockSiteMap: SiteMap = {
    baseUrl: 'http://localhost:3000/demo-store',
    totalPages: 3,
    discoveredAt: new Date().toISOString(),
    pages: {
      'http://localhost:3000/demo-store': {
        url: 'http://localhost:3000/demo-store',
        title: 'AnyTask Demo Store - Products',
        inputs: [],
        actions: [
          {
            selector: '#add-to-cart-prod_001',
            id: 'add-to-cart-prod_001',
            text: 'Add to Cart',
            type: 'button',
          },
        ],
        links: [
          { text: 'View Cart', href: '/demo-store/cart', isInternal: true },
        ],
      },
      'http://localhost:3000/demo-store/cart': {
        url: 'http://localhost:3000/demo-store/cart',
        title: 'Shopping Cart - AnyTask Store',
        inputs: [],
        actions: [
          {
            selector: '#proceed-to-checkout-btn',
            id: 'proceed-to-checkout-btn',
            text: 'Proceed to Checkout',
            type: 'button',
          },
        ],
        links: [
          { text: 'Continue Shopping', href: '/demo-store', isInternal: true },
          { text: 'Checkout', href: '/demo-store/checkout', isInternal: true },
        ],
      },
      'http://localhost:3000/demo-store/checkout': {
        url: 'http://localhost:3000/demo-store/checkout',
        title: 'Checkout - AnyTask Store',
        inputs: [
          {
            selector: '#full-name',
            id: 'full-name',
            name: 'fullName',
            type: 'text',
            label: 'Full Name',
            required: true,
          },
          {
            selector: '#email',
            id: 'email',
            name: 'email',
            type: 'email',
            label: 'Email Address',
            required: true,
          },
          {
            selector: '#card-number',
            id: 'card-number',
            name: 'cardNumber',
            type: 'text',
            label: 'Card Number',
            required: true,
          },
          {
            selector: '#cvv',
            id: 'cvv',
            name: 'cvv',
            type: 'text',
            label: 'Security Code (CVV)',
            required: true,
          },
        ],
        actions: [
          {
            selector: '#submit-order-btn',
            id: 'submit-order-btn',
            text: 'Place Order ($48.00)',
            type: 'submit',
          },
        ],
        links: [
          { text: 'Back to Cart', href: '/demo-store/cart', isInternal: true },
        ],
      },
    },
  };

  const testLogger = async (step: string, msg: string, level = 'INFO') => {
    console.log(`  [${level}] ${step}: ${msg}`);
  };

  const plan: TestPlan = await runJourneyPlanner(mockSiteMap, testLogger, {
    userIntent: 'Complete checkout flow from product catalog to order confirmation',
  });

  // Validate Zod Schema compliance
  TestPlanSchema.parse(plan);

  console.log('\n📋 --- Generated Test Plan Summary ---');
  console.log(`Plan ID:     ${plan.id}`);
  console.log(`Base URL:    ${plan.targetBaseUrl}`);
  console.log(`Summary:     ${plan.summary}`);
  console.log(`Total Flows: ${plan.journeys.length}\n`);

  for (const journey of plan.journeys) {
    console.log(`🎯 Journey [${journey.priority}]: "${journey.title}"`);
    console.log(`   Description: ${journey.description}`);
    console.log(`   Steps (${journey.steps.length}):`);
    for (const step of journey.steps) {
      console.log(`     ${step.stepNumber}. [${step.action}] ${step.description}`);
      if (step.selector) console.log(`        Target: ${step.selector}`);
      if (step.value) console.log(`        Value:  "${step.value}"`);
    }
    console.log('');
  }

  // Assertions
  if (plan.journeys.length === 0) {
    throw new Error('TestPlan generation failed: zero journeys generated.');
  }

  const primaryJourney = plan.journeys[0];
  if (primaryJourney.steps.length < 4) {
    throw new Error(`Expected at least 4 test steps, but got ${primaryJourney.steps.length}`);
  }

  console.log('🎉 DAY 4 JOURNEY PLANNER VERIFIED AND PASSING SUCCESSFULLY!\n');
}

testJourneyPlanner().catch((err) => {
  console.error('❌ Day 4 Journey Planner test failed:', err);
  process.exit(1);
});
