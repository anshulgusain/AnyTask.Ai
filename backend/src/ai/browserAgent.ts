import { JobItem, LogLevel } from '../types/job.js';
import { runDiscoveryAgent } from './discoveryAgent.js';
import { runJourneyPlanner } from './journeyPlanner.js';
import { runExecutorAgent, ExecutionSummary } from './executorAgent.js';
import { GuardrailsChecker, createGuardrailsConfig } from './guardrails.js';
import { waitForSiteReady, discoverBackendOrigins } from './tools.js';
import { generateTestIdentity, identityToFields } from './testIdentity.js';

export type LogCallback = (
  step: string,
  message: string,
  level?: LogLevel,
  metadata?: Record<string, any>
) => Promise<void>;

/**
 * ---------------------------------------------------------------------------
 * AI Browser Agent Runner — Full Pipeline
 * ---------------------------------------------------------------------------
 * Orchestrates the complete autonomous agent pipeline for any target URL:
 *
 *   1. Discovery Agent  → crawls the live page, builds a SiteMap
 *   2. Journey Planner  → generates an executable TestPlan (OpenAI or fallback)
 *   3. Executor Agent   → runs each step with Playwright + Assertion Agent
 *   4. Guardrails       → enforces safety limits throughout execution
 *
 * The returned ExecutionSummary is saved as the job result and rendered
 * in the Audit Report UI at /report?jobId=<id>.
 */
export async function runBrowserAgent(
  job: JobItem,
  log: LogCallback
): Promise<Record<string, any>> {
  await log('AGENT_INIT', '🤖 AnyTask.AI Full Pipeline starting...', 'INFO', {
    targetUrl: job.targetUrl,
  });

  const headless = job.payload?.headless ?? process.env.HEADLESS !== 'false';

  // ---------------------------------------------------------------------------
  // Phase 0: Warm-up — wake sleeping free-tier hosts (Render, Railway, ...) before crawling
  // ---------------------------------------------------------------------------
  await log('PHASE_WARMUP', `⏳ Checking that ${job.targetUrl} is awake...`, 'INFO');
  const warmup = await waitForSiteReady(job.targetUrl, async (attempt, reason) => {
    await log(
      'PHASE_WARMUP',
      `⏳ Waking up your site (attempt ${attempt}: ${reason}). Free-tier hosts can take up to a minute...`,
      'WARN'
    );
  });
  if (!warmup.ready) {
    throw new Error(`Target site is unreachable: ${warmup.message}`);
  }
  await log('WARMUP_DONE', warmup.message, 'SUCCESS', { status: warmup.status, waitedMs: warmup.waitedMs });

  const backendOrigins = await discoverBackendOrigins(job.targetUrl);
  if (backendOrigins.length > 0) {
    await log('PHASE_WARMUP', `⏳ Waking up backend API(s): ${backendOrigins.join(', ')}`, 'INFO');
    const backendResults = await Promise.all(
      backendOrigins.map(async (origin) => ({ origin, ...(await waitForSiteReady(origin)) }))
    );
    for (const r of backendResults) {
      await log(
        'WARMUP_BACKEND',
        r.ready ? `Backend ${r.origin} is awake (${r.message})` : `Backend ${r.origin} did not wake up: ${r.message}`,
        r.ready ? 'SUCCESS' : 'WARN',
        { origin: r.origin, waitedMs: r.waitedMs }
      );
    }
  }

  // Fresh fake account per run so sign-up flows never hit "email already registered".
  const testIdentity = generateTestIdentity(job.id);
  const { JobService } = await import('../services/jobService.js');
  await JobService.setTestIdentity(job.id, testIdentity);
  await log(
    'TEST_IDENTITY',
    `🪪 Generated test account for this run: ${testIdentity.email} (username: ${testIdentity.username})`,
    'INFO',
    { email: testIdentity.email, username: testIdentity.username }
  );

  // ---------------------------------------------------------------------------
  // Phase 1: Discovery — crawl the target URL and map its DOM
  // ---------------------------------------------------------------------------
  await log('PHASE_DISCOVERY', '🔍 Phase 1/3: Discovery Agent crawling target...', 'INFO');

  const siteMap = await runDiscoveryAgent(job.targetUrl, log, {
    maxPages: 6,
    headless: true, // discovery always headless for speed
  });

  await log(
    'DISCOVERY_DONE',
    `Discovery complete: ${siteMap.totalPages} pages mapped, ${Object.values(siteMap.pages).reduce((n, p) => n + p.inputs.length, 0)} inputs found.`,
    'SUCCESS',
    { totalPages: siteMap.totalPages }
  );

  // ---------------------------------------------------------------------------
  // Phase 2: Journey Planner — generate an executable TestPlan
  // ---------------------------------------------------------------------------
  await log('PHASE_PLANNING', '🗺️  Phase 2/3: Journey Planner generating test plan...', 'INFO');

  const userIntent = job.payload?.instructions as string | undefined;
  const userFields = identityToFields(
    testIdentity,
    job.payload?.fields as Record<string, string> | undefined
  );

  const testPlan = await runJourneyPlanner(siteMap, log, { userIntent, userFields });

  await log(
    'PLANNING_DONE',
    `Plan ready: ${testPlan.journeys.length} journeys, ${testPlan.journeys.reduce((n, j) => n + j.steps.length, 0)} steps total.`,
    'SUCCESS',
    { planId: testPlan.id, journeys: testPlan.journeys.length }
  );

  // ---------------------------------------------------------------------------
  // Phase 3: Executor — run the plan with Guardrails active
  // ---------------------------------------------------------------------------
  await log('PHASE_EXECUTION', '⚡ Phase 3/3: Executor Agent running journeys...', 'INFO');

  const guardrails = new GuardrailsChecker(createGuardrailsConfig({
    maxSteps: 80,
    maxConsecutiveErrors: 4,
    minActionIntervalMs: 300,
  }));

  const summary: ExecutionSummary = await runExecutorAgent(testPlan, log, {
    headless,                 // set HEADLESS=false locally to watch the browser work
    stopOnFailure: false,     // keep going on failures to collect full report
    stepDelayMs: 400,         // small pause between actions for stability
    autoApproveDestructive: false,
    onDestructiveAction: async (req) => {
      const { JobService } = await import('../services/jobService.js');
      await JobService.setActionAwaitingApproval(job.id, {
        stepNumber: req.step.stepNumber,
        journeyId: req.journeyId,
        action: req.step.action,
        selector: req.step.selector,
        value: req.step.value,
        description: req.step.description,
        reason: req.reason,
        screenshotPath: req.previewScreenshotPath,
        timestamp: new Date().toISOString(),
      });
      return await JobService.waitForActionApproval(job.id);
    },
    onCredentialRequired: async (req) => {
      const { JobService } = await import('../services/jobService.js');
      await JobService.setAwaitingCredentials(job.id, req);
      return await JobService.waitForCredentials(job.id);
    },
  });

  // ---------------------------------------------------------------------------
  // Return — saved as job.result, rendered in the Audit Report UI
  // ---------------------------------------------------------------------------
  const overallPass = summary.failedJourneys === 0;

  await log(
    'PIPELINE_COMPLETE',
    `✅ Pipeline finished: ${summary.passedJourneys}/${summary.totalJourneys} journeys passed, ${summary.passedAssertions}/${summary.totalAssertions} assertions passed (${summary.totalDurationMs}ms).`,
    overallPass ? 'SUCCESS' : 'WARN',
    {
      passedJourneys: summary.passedJourneys,
      failedJourneys: summary.failedJourneys,
      passedAssertions: summary.passedAssertions,
      failedAssertions: summary.failedAssertions,
      totalDurationMs: summary.totalDurationMs,
    }
  );

  return { ...summary, testIdentity };
}
