import { chromium, Browser } from 'playwright';
import { OpenAI } from 'openai';
import { JobItem, LogLevel, TestIdentity } from '../types/job.js';
import { LOCAL_SCREENSHOT_DIR } from '../storage.js';
import { allowPrivateTargets, isPrivateHost } from '../security.js';
import { waitForSiteReady, discoverBackendOrigins, navigateTo } from './tools.js';
import { generateTestIdentity } from './testIdentity.js';
import { observePage } from './pageObserver.js';
import { planGoals } from './goalPlanner.js';
import { runGoal, AgentHooks, AgentSession, GoalResult } from './agentLoop.js';
import { SiteMonitor } from './siteMonitor.js';

/** A visible browser window needs a display: always on macOS/Windows, only with X/Wayland on Linux servers. */
export function canShowBrowser(): boolean {
  return process.platform !== 'linux' || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

export type LogCallback = (
  step: string,
  message: string,
  level?: LogLevel,
  metadata?: Record<string, any>
) => Promise<void>;

/**
 * ---------------------------------------------------------------------------
 * AI Browser Agent Runner
 * ---------------------------------------------------------------------------
 *   0. Warm-up          → wake sleeping hosts (frontend + detected backend APIs)
 *   1. Goal planning    → read the live home page, decide WHAT to test
 *   2. Agent loop       → per goal: observe page → LLM picks one action → execute
 *
 * The returned summary is saved as the job result and rendered in /report?jobId=<id>.
 */
export async function runBrowserAgent(
  job: JobItem,
  log: LogCallback
): Promise<Record<string, any>> {
  await log('AGENT_INIT', '🤖 AnyTask.AI starting...', 'INFO', {
    targetUrl: job.targetUrl,
  });

  const requestedHeadless = job.payload?.headless ?? process.env.HEADLESS !== 'false';
  const headless = requestedHeadless || !canShowBrowser();
  if (!requestedHeadless && headless) {
    await log('HEADLESS_FORCED', 'This server has no display, so the browser runs hidden. Follow it in the live view instead.', 'INFO');
  }

  // ---------------------------------------------------------------------------
  // Phase 0: Warm-up — wake sleeping free-tier hosts (Render, Railway, ...) before testing
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

  const discoveredOrigins = await discoverBackendOrigins(job.targetUrl);
  const backendOrigins = allowPrivateTargets()
    ? discoveredOrigins
    : (
        await Promise.all(
          discoveredOrigins.map(async (o) => ((await isPrivateHost(new URL(o).hostname)) ? null : o))
        )
      ).filter((o): o is string => o !== null);
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set on the backend. The agent needs it to plan and act.');
  }

  return runAutonomousAgent(job, log, testIdentity, headless, apiKey);
}

// ---------------------------------------------------------------------------
// Autonomous observe → decide → act agent
// ---------------------------------------------------------------------------

async function runAutonomousAgent(
  job: JobItem,
  log: LogCallback,
  testIdentity: TestIdentity,
  headless: boolean,
  apiKey: string
): Promise<Record<string, any>> {
  const { JobService } = await import('../services/jobService.js');
  const client = new OpenAI({ apiKey });
  const model = process.env.AGENT_MODEL || 'gpt-4.1-mini';
  const maxGoals = Number(process.env.AGENT_MAX_GOALS) || 5;
  const maxSteps = Number(process.env.AGENT_MAX_STEPS_PER_GOAL) || 25;
  const vision = process.env.AGENT_VISION === 'true';
  const screenshotDir = LOCAL_SCREENSHOT_DIR;

  const runId = `run_${job.id.slice(0, 8)}_${Date.now()}`;
  const instructions = job.payload?.instructions as string | undefined;
  const explicitFields = Object.fromEntries(
    Object.entries((job.payload?.fields as Record<string, string> | undefined) ?? {}).filter(
      ([, v]) => typeof v === 'string' && v.trim() !== ''
    )
  );

  const startTime = Date.now();
  const results: GoalResult[] = [];
  const runMemory: string[] = [];
  const declinedQuestions = new Map<string, string>();
  const developerNotes: string[] = [];
  const monitor = new SiteMonitor();
  let appSummary = '';
  let goals: { id: string; title: string; description: string; priority: string }[] = [];
  let browser: Browser | null = null;

  const hooks: AgentHooks = {
    log,
    askUser: async (req) => {
      await JobService.setAwaitingFieldInput(job.id, {
        stepNumber: req.stepNumber,
        journeyId: req.goalId,
        fieldLabel: req.fieldLabel,
        fieldSelector: '',
        fieldType: req.sensitive ? 'password' : 'text',
        description: req.question,
        pageUrl: req.pageUrl,
        timestamp: new Date().toISOString(),
      });
      const res = await JobService.waitForFieldInput(job.id);
      return (res.value || '').trim();
    },
    approveAction: async (req) => {
      await JobService.setActionAwaitingApproval(job.id, {
        stepNumber: req.stepNumber,
        journeyId: req.goalId,
        action: req.action,
        description: req.description,
        reason: req.reason,
        screenshotPath: req.screenshotPath,
        timestamp: new Date().toISOString(),
      });
      return JobService.waitForActionApproval(job.id);
    },
    shouldStop: async () => (await JobService.getJobById(job.id))?.status === 'CANCELLED',
    takeNotes: () => JobService.takeNotes(job.id),
  };

  try {
    browser = await chromium.launch({
      headless,
      // Docker gives /dev/shm only 64 MB, which makes Chromium tabs crash; use /tmp instead.
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
    if (!allowPrivateTargets()) {
      // Redirects and in-page links can still point at internal hosts after the target URL was validated.
      await context.route('**/*', async (route) => {
        const { protocol, hostname } = new URL(route.request().url());
        if ((protocol === 'http:' || protocol === 'https:') && (await isPrivateHost(hostname))) {
          await log('BLOCKED_REQUEST', `Blocked a request to internal address ${hostname}`, 'WARN');
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });
    }
    monitor.attach(context);
    const session: AgentSession = { page: await context.newPage() };
    // Follow links that open in a new tab.
    context.on('page', async (p) => {
      session.page = p;
      await p.waitForLoadState('domcontentloaded').catch(() => {});
    });

    await log('PHASE_DISCOVERY', '🔍 Opening the site and reading the home page...', 'INFO');
    const nav = await navigateTo(session.page, job.targetUrl);
    if (!nav.success) throw new Error(nav.message);
    const home = await observePage(session.page);
    await log(
      'DISCOVERY_DONE',
      `Home page "${home.title}" loaded with ${home.elements.length} interactive elements.`,
      'SUCCESS'
    );

    const hrefs = home.elements.map((e) => e.href).filter((h): h is string => Boolean(h));
    const brokenLinks = await monitor.checkLinks(job.targetUrl, hrefs);
    await log(
      'LINK_CHECK',
      brokenLinks > 0
        ? `🔗 Checked ${hrefs.length} home-page links: ${brokenLinks} broken.`
        : `🔗 Checked ${hrefs.length} home-page links: none broken.`,
      brokenLinks > 0 ? 'WARN' : 'SUCCESS'
    );

    await log('PHASE_PLANNING', `🗺️ Planning test goals with ${model}...`, 'INFO');
    const plan = await planGoals(client, model, home, instructions, maxGoals);
    appSummary = plan.appSummary;
    goals = plan.goals;
    await log(
      'PLANNER_SUCCESS',
      `App: ${plan.appSummary}\nPlanned ${plan.goals.length} goals: ${plan.goals.map((g, i) => `${i + 1}. ${g.title}`).join('  ')}`,
      'SUCCESS',
      { goals: plan.goals }
    );

    await log('PHASE_EXECUTION', '⚡ Running goals in the browser...', 'INFO');
    for (const goal of plan.goals) {
      if (await hooks.shouldStop()) break;
      await navigateTo(session.page, job.targetUrl);
      const result = await runGoal(
        session,
        goal,
        {
          client,
          model,
          runId,
          baseUrl: job.targetUrl,
          appContext: instructions,
          testIdentity,
          userFields: explicitFields,
          runMemory: [...runMemory],
          declinedQuestions,
          developerNotes,
          screenshotDir,
          maxSteps,
          vision,
          monitor,
        },
        hooks
      );
      results.push(result);
      runMemory.push(`"${goal.title}" → ${result.status}: ${result.summary}`);
    }
  } finally {
    if (browser) await browser.close();
  }

  const count = (s: GoalResult['status']) => results.filter((r) => r.status === s).length;
  const passed = count('PASS');
  const failed = count('FAIL');
  const findings = results.flatMap((r) => r.findings);
  const siteHealth = monitor.getEvents();

  const summary = {
    planId: runId,
    agentMode: 'autonomous',
    model,
    targetBaseUrl: job.targetUrl,
    appSummary,
    goals,
    totalJourneys: results.length,
    passedJourneys: passed,
    failedJourneys: failed,
    blockedJourneys: count('BLOCKED'),
    inconclusiveJourneys: count('AGENT_ERROR'),
    totalAssertions: passed + failed,
    passedAssertions: passed,
    failedAssertions: failed,
    totalDurationMs: Date.now() - startTime,
    executedAt: new Date().toISOString(),
    results,
    findings,
    siteHealth,
    testIdentity,
  };

  await log(
    'PIPELINE_COMPLETE',
    `✅ Finished: ${passed} passed, ${failed} failed, ${summary.blockedJourneys} blocked, ${summary.inconclusiveJourneys} inconclusive · ${findings.length} bugs reported · ${siteHealth.length} console/network issues (${Math.round(summary.totalDurationMs / 1000)}s).`,
    failed === 0 ? 'SUCCESS' : 'WARN',
    {
      passedJourneys: passed,
      failedJourneys: failed,
      blockedJourneys: summary.blockedJourneys,
      inconclusiveJourneys: summary.inconclusiveJourneys,
      findings: findings.length,
    }
  );

  return summary;
}
