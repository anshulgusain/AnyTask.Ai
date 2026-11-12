import type { Page } from 'playwright';
import type OpenAI from 'openai';
import path from 'path';
import crypto from 'node:crypto';
import { observePage, formatObservation, locatorForRef, PageObservation, ObservedElement } from './pageObserver.js';
import { navigateTo, captureScreenshot } from './tools.js';
import { GuardrailsChecker, createGuardrailsConfig } from './guardrails.js';
import type { LogCallback } from './browserAgent.js';
import type { SiteMonitor } from './siteMonitor.js';
import type { TestIdentity } from '../types/job.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestGoal {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * PASS / FAIL describe the website. BLOCKED means a human or external factor stopped us
 * (captcha, OTP never provided, payment wall). AGENT_ERROR means we couldn't complete the
 * goal for our own reasons (ran out of steps, loop) and says nothing about the site.
 */
export type GoalStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'AGENT_ERROR';

export interface Finding {
  goalId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  details: string;
  url: string;
  screenshotPath?: string;
  timestamp: string;
}

export interface AgentStepResult {
  stepNumber: number;
  action: string;
  description: string;
  success: boolean;
  message: string;
  durationMs: number;
  screenshotPath?: string;
  timestamp: string;
}

export interface GoalResult {
  journeyId: string;
  title: string;
  status: GoalStatus;
  summary: string;
  success: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  steps: AgentStepResult[];
  findings: Finding[];
}

export interface AskUserRequest {
  question: string;
  fieldLabel: string;
  sensitive: boolean;
  stepNumber: number;
  goalId: string;
  pageUrl: string;
}

export interface ApprovalRequest {
  stepNumber: number;
  goalId: string;
  action: string;
  description: string;
  reason: string;
  riskLevel: 'HIGH' | 'CRITICAL';
  selector?: string;
  value?: string;
  screenshotPath?: string;
}

export interface AgentHooks {
  log: LogCallback;
  /** Returns the user's answer, or '' if they skipped / timed out. */
  askUser: (req: AskUserRequest) => Promise<string>;
  approveAction: (req: ApprovalRequest) => Promise<{ approved: boolean; notes?: string }>;
  shouldStop: () => Promise<boolean>;
  /** Notes the developer sent since the last call. */
  takeNotes: () => string[];
}

export interface AgentSession {
  /** Mutable so the loop can follow links that open in a new tab. */
  page: Page;
}

export interface AgentOptions {
  client: OpenAI;
  model: string;
  runId: string;
  baseUrl: string;
  appContext?: string;
  testIdentity: TestIdentity;
  userFields: Record<string, string>;
  /** Summaries of goals already finished in this run (shared browser session). */
  runMemory: string[];
  /** Questions the developer skipped this run, keyed by field label. Shared and mutated across goals. */
  declinedQuestions: Map<string, string>;
  /** Notes the developer sent during this run. Shared and mutated across goals. */
  developerNotes: string[];
  screenshotDir: string;
  maxSteps: number;
  vision: boolean;
  monitor: SiteMonitor;
}

// ---------------------------------------------------------------------------
// Tools exposed to the model
// ---------------------------------------------------------------------------

const reasonParam = {
  reason: { type: 'string', description: 'One short sentence: why this action moves the goal forward.' },
} as const;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'click',
      description: 'Click an element from the current element list.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'integer' }, ...reasonParam },
        required: ['ref', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill',
      description: 'Clear and type a value into an input, textarea or contenteditable element.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'integer' }, value: { type: 'string' }, ...reasonParam },
        required: ['ref', 'value', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select_option',
      description: 'Choose an option in a native <select>. For custom dropdowns, click them instead.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'integer' }, option: { type: 'string' }, ...reasonParam },
        required: ['ref', 'option', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_checkbox',
      description: 'Check or uncheck a checkbox / switch / radio.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'integer' }, checked: { type: 'boolean' }, ...reasonParam },
        required: ['ref', 'checked', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'press_key',
      description: 'Press a keyboard key on the focused element (e.g. Enter to submit, Escape to close a modal).',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string', enum: ['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp'] }, ...reasonParam },
        required: ['key', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Open a URL (absolute, or a path relative to the current site).',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' }, ...reasonParam },
        required: ['url', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: 'Scroll the page to reveal more elements.',
      parameters: {
        type: 'object',
        properties: { direction: { type: 'string', enum: ['down', 'up'] }, ...reasonParam },
        required: ['direction', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'go_back',
      description: 'Browser back button.',
      parameters: { type: 'object', properties: { ...reasonParam }, required: ['reason'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait',
      description: 'Wait for the page to update (slow API, loading spinner).',
      parameters: {
        type: 'object',
        properties: { seconds: { type: 'integer', minimum: 1, maximum: 10 }, ...reasonParam },
        required: ['seconds', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description:
        'Pause and ask the human for information only they can provide: OTP / email verification codes, existing login credentials, business-specific values, or which option to choose when the goal is ambiguous. Never ask for data you can invent (names, addresses, product details).',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Clear question shown to the user.' },
          field_label: { type: 'string', description: 'Short label for the answer box, e.g. "Verification code".' },
          sensitive: { type: 'boolean', description: 'True for passwords / codes so the answer is masked in logs.' },
        },
        required: ['question', 'field_label', 'sensitive'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'report_bug',
      description:
        'Record a defect in the website under test (server error, broken page, button that does nothing, wrong data, confusing validation). Does not end the goal.',
      parameters: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          title: { type: 'string' },
          details: { type: 'string', description: 'What you did, what you expected, what happened.' },
        },
        required: ['severity', 'title', 'details'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description:
        'End this goal. PASS only with visible evidence the goal worked. FAIL if the website is broken. BLOCKED if a captcha, missing user input, external login (Google/OAuth) or real payment stopped you.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PASS', 'FAIL', 'BLOCKED'] },
          summary: { type: 'string', description: 'What happened and the evidence you saw.' },
        },
        required: ['status', 'summary'],
      },
    },
  },
];

function buildSystemPrompt(opts: AgentOptions, goal: TestGoal): string {
  const id = opts.testIdentity;
  const extraFields = Object.entries(opts.userFields)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');

  return `
You are AnyTask QA, an autonomous QA engineer testing a web application in a real browser.
You complete ONE test goal by taking ONE action per turn using the provided tools.

Application under test: ${opts.baseUrl}
${opts.appContext ? `What the developer told you about the app / what to test:\n${opts.appContext}\n` : ''}
Current goal: ${goal.title}
Goal details: ${goal.description}

Test account for this run (use it for sign-up and login; never use real personal data):
  - full name: ${id.fullName} (first: ${id.firstName}, last: ${id.lastName})
  - username: ${id.username}
  - email: ${id.email}
  - password: ${id.password}
  - phone: ${id.phone}${
    id.phoneIsReal
      ? ' (the developer\'s own number — SMS/OTP to it is fine)'
      : ' (FAKE — may belong to a stranger. NEVER trigger SMS/OTP to it; if phone verification is required, ask_user for a number they control, then for the code)'
  }
${extraFields ? `Values the developer explicitly provided (these override the test account):\n${extraFields}\n` : ''}
${opts.runMemory.length ? `Earlier goals in this same browser session:\n${opts.runMemory.map((m) => `  - ${m}`).join('\n')}\n` : ''}${
    opts.declinedQuestions.size
      ? `The developer already declined to provide (do not ask again; if your goal requires it, finish BLOCKED right away):\n${Array.from(opts.declinedQuestions.values()).map((q) => `  - ${q}`).join('\n')}\n`
      : ''
  }
Rules:
1. Only use element refs from the LATEST element list. Refs change every turn. The list and visible text already cover the WHOLE page, not just the viewport — scroll only if content loads lazily.
2. Invent realistic fake data for anything else (addresses, product names, prices, descriptions). Card payments in test mode: 4242 4242 4242 4242, any future expiry, CVC 123.
3. When several account types exist (User vs Vendor/Seller/Business), choose the regular customer/user one unless the goal says otherwise.
4. After submitting a form, look for evidence: success message, URL change, the new item appearing, a logged-in menu. Use "wait" if the page is still loading.
5. If the site shows a validation error caused by your input (e.g. password rules), fix the input and retry. If the site itself misbehaves (HTTP 5xx in "Network errors", blank page, button does nothing after a retry, wrong data saved), call report_bug, then finish with FAIL.
6. Use ask_user for verification codes / OTP, credentials of existing accounts, or genuinely ambiguous business choices. If the user gives no answer, finish with BLOCKED.
7. Captchas, Google/Facebook sign-in, and real payment gateways: finish with BLOCKED.
8. Date inputs (type=date) expect YYYY-MM-DD.
9. Do not repeat the same failing action more than twice — try a different approach (scroll, another button, navigate directly).
10. Finish as soon as the goal is clearly achieved or clearly impossible. Be honest: PASS needs evidence.
11. Buttons marked (in header) / (in nav) / (in footer) are site navigation. To submit a form, use the button marked (in form) or press Enter in a field.
12. If the goal doesn't match what the site offers (e.g. asked for a customer sign-up but only seller registration exists), do not silently test something else: finish BLOCKED and explain what the site actually offers.
`.trim();
}

// ---------------------------------------------------------------------------
// Risk gate: only payments and irreversible deletes need human approval
// ---------------------------------------------------------------------------

const SEND_CODE_PATTERN = /\b(send|get|request|resend)\s*(an?\s*)?(otp|code|sms|verification)\b|\bverify (phone|mobile|number)\b/i;

const PAYMENT_PATTERN = /\b(pay( now)?|payment|purchase|place (your )?order|buy now|complete (order|purchase)|confirm (order|payment))\b/i;
const DELETE_PATTERN = /\b(delete|remove account|deactivate|close account|cancel subscription|destroy|purge)\b/i;

function riskForElement(el: ObservedElement | undefined): { riskLevel: 'HIGH' | 'CRITICAL'; reason: string } | null {
  if (!el) return null;
  if (PAYMENT_PATTERN.test(el.name)) return { riskLevel: 'CRITICAL', reason: `Payment / order placement: "${el.name}"` };
  if (DELETE_PATTERN.test(el.name)) return { riskLevel: 'HIGH', reason: `Irreversible delete: "${el.name}"` };
  return null;
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
}

async function executeTool(
  session: AgentSession,
  name: string,
  args: Record<string, any>
): Promise<{ success: boolean; message: string }> {
  const page = session.page;

  const withRef = async (fn: (loc: ReturnType<typeof locatorForRef>) => Promise<void>, verb: string) => {
    const loc = locatorForRef(page, Number(args.ref));
    if ((await loc.count()) === 0) {
      return { success: false, message: `Element [${args.ref}] no longer exists (page changed). Re-check the new element list.` };
    }
    try {
      await fn(loc);
      return { success: true, message: `${verb} [${args.ref}]` };
    } catch (err: any) {
      const first = String(err.message).split('\n')[0];
      return { success: false, message: `Could not ${verb.toLowerCase()} [${args.ref}]: ${first}` };
    }
  };

  switch (name) {
    case 'click': {
      const res = await withRef(async (loc) => {
        try {
          await loc.click({ timeout: 5_000 });
        } catch (err: any) {
          // Overlays (cookie banners, sticky headers) commonly intercept pointer events.
          if (/intercepts pointer events|not visible|outside of the viewport/i.test(err.message)) {
            await loc.click({ timeout: 3_000, force: true });
          } else {
            throw err;
          }
        }
      }, 'Clicked');
      await settle(session.page);
      return res;
    }
    case 'fill':
      return withRef(async (loc) => {
        await loc.fill(String(args.value ?? ''), { timeout: 5_000 });
      }, 'Filled');
    case 'select_option':
      return withRef(async (loc) => {
        const option = String(args.option ?? '');
        try {
          await loc.selectOption({ label: option }, { timeout: 5_000 });
        } catch {
          await loc.selectOption(option, { timeout: 5_000 });
        }
      }, 'Selected option in');
    case 'set_checkbox':
      return withRef(async (loc) => {
        await loc.setChecked(Boolean(args.checked), { timeout: 5_000, force: true });
      }, args.checked ? 'Checked' : 'Unchecked');
    case 'press_key': {
      await page.keyboard.press(String(args.key));
      await settle(page);
      return { success: true, message: `Pressed ${args.key}` };
    }
    case 'navigate': {
      const target = new URL(String(args.url), page.url()).toString();
      const res = await navigateTo(page, target);
      return { success: res.success, message: res.message };
    }
    case 'scroll': {
      await page.mouse.wheel(0, args.direction === 'up' ? -700 : 700);
      await page.waitForTimeout(400);
      return { success: true, message: `Scrolled ${args.direction}` };
    }
    case 'go_back': {
      await page.goBack({ timeout: 15_000 }).catch(() => null);
      await settle(page);
      return { success: true, message: `Went back to ${page.url()}` };
    }
    case 'wait': {
      const seconds = Math.min(Math.max(Number(args.seconds) || 2, 1), 10);
      await page.waitForTimeout(seconds * 1000);
      return { success: true, message: `Waited ${seconds}s` };
    }
    default:
      return { success: false, message: `Unknown tool "${name}"` };
  }
}

function describeAction(name: string, args: Record<string, any>, obs: PageObservation, sensitiveValues: Set<string>): string {
  const el = args.ref !== undefined ? obs.elements.find((e) => e.ref === Number(args.ref)) : undefined;
  const target = el ? `"${el.name || el.tag}"` : args.ref !== undefined ? `[${args.ref}]` : '';
  const mask = (v: string) => (sensitiveValues.has(v) || el?.type === 'password' ? '••••••' : v);
  switch (name) {
    case 'click':
      return `Click ${target}`;
    case 'fill':
      return `Type "${mask(String(args.value ?? ''))}" into ${target}`;
    case 'select_option':
      return `Select "${args.option}" in ${target}`;
    case 'set_checkbox':
      return `${args.checked ? 'Check' : 'Uncheck'} ${target}`;
    case 'press_key':
      return `Press ${args.key}`;
    case 'navigate':
      return `Open ${args.url}`;
    case 'scroll':
      return `Scroll ${args.direction}`;
    case 'go_back':
      return 'Go back';
    case 'wait':
      return `Wait ${args.seconds}s`;
    default:
      return name;
  }
}

// ---------------------------------------------------------------------------
// LLM decision
// ---------------------------------------------------------------------------

/** Reasoning models (gpt-5*, o-series) only accept the default temperature. */
export function temperatureFor(model: string, value: number): { temperature?: number } {
  return /^(gpt-5|o\d)/i.test(model) ? {} : { temperature: value };
}

async function decideNextAction(
  opts: AgentOptions,
  systemPrompt: string,
  observationText: string,
  history: string[],
  stepNumber: number,
  screenshotBase64?: string
): Promise<{ name: string; args: Record<string, any> } | null> {
  const recent = history.slice(-25);
  const userText = [
    `Step ${stepNumber} of at most ${opts.maxSteps}.`,
    ...(opts.developerNotes.length
      ? [`Notes from the developer during this run (follow them; newest last):\n${opts.developerNotes.map((n) => `  - ${n}`).join('\n')}`, '']
      : []),
    recent.length ? `Your previous actions (oldest first):\n${recent.join('\n')}` : 'No actions taken yet for this goal.',
    '',
    'Current page:',
    observationText,
    '',
    'Choose the single next tool call.',
  ].join('\n');

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: userText }];
  if (screenshotBase64) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshotBase64}`, detail: 'auto' } });
  }

  const response = await opts.client.chat.completions.create({
    model: opts.model,
    ...temperatureFor(opts.model, 0.1),
    tool_choice: 'required',
    parallel_tool_calls: false,
    tools: TOOLS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
  });

  const call = response.choices[0]?.message?.tool_calls?.[0];
  if (!call || call.type !== 'function') return null;
  let args: Record<string, any> = {};
  try {
    args = JSON.parse(call.function.arguments || '{}');
  } catch {
    args = {};
  }
  return { name: call.function.name, args };
}

// ---------------------------------------------------------------------------
// Goal loop
// ---------------------------------------------------------------------------

/** Tools that are expected to visibly change the page. */
const MUTATING_TOOLS = new Set(['click', 'press_key', 'navigate', 'go_back', 'select_option', 'set_checkbox']);

/** Cheap identity of what the agent can see; equal fingerprints mean nothing changed. */
function pageFingerprint(obs: PageObservation): string {
  const elements = obs.elements.map((e) => `${e.name}|${e.value ?? ''}|${e.checked ?? ''}`).join(';');
  return crypto
    .createHash('sha1')
    .update(`${obs.url}\n${obs.headings.join('|')}\n${obs.alerts.join('|')}\n${obs.hasModal}\n${elements}\n${obs.text}`)
    .digest('hex');
}

export async function runGoal(
  session: AgentSession,
  goal: TestGoal,
  opts: AgentOptions,
  hooks: AgentHooks
): Promise<GoalResult> {
  const start = Date.now();
  const steps: AgentStepResult[] = [];
  const findings: Finding[] = [];
  const history: string[] = [];
  const sensitiveValues = new Set<string>([opts.testIdentity.password]);
  const fakePhoneDigits = opts.testIdentity.phoneIsReal ? '' : opts.testIdentity.phone.replace(/\D/g, '');
  const systemPrompt = buildSystemPrompt(opts, goal);
  const host = new URL(opts.baseUrl).hostname;
  const guardrails = new GuardrailsChecker(
    createGuardrailsConfig({
      maxSteps: opts.maxSteps,
      maxConsecutiveErrors: 4,
      loopDetectionThreshold: 3,
      minActionIntervalMs: 300,
    })
  );

  let status: GoalStatus = 'AGENT_ERROR';
  let summary = '';
  let llmFailures = 0;
  let lastFingerprint = '';
  let lastActionMutates = false;
  let unchangedActions = 0;

  await hooks.log('JOURNEY_START', `🎯 Goal: "${goal.title}" — ${goal.description}`, 'INFO', { journeyId: goal.id });

  const screenshotPathFor = (n: number) =>
    path.join(opts.screenshotDir, `${opts.runId}_${goal.id}_step_${n}.png`);

  for (let stepNumber = 1; ; stepNumber++) {
    if (await hooks.shouldStop()) {
      status = 'BLOCKED';
      summary = 'Run was cancelled by the user.';
      break;
    }
    if (stepNumber > opts.maxSteps) {
      status = 'AGENT_ERROR';
      summary = `Ran out of steps (${opts.maxSteps}) before reaching a verdict. Last page: ${session.page.url()}`;
      break;
    }

    for (const note of hooks.takeNotes()) {
      opts.developerNotes.push(note);
      history.push(`#${stepNumber} (developer note received: "${note}")`);
    }

    const page = session.page;
    const obs = await observePage(page);
    const networkErrors = opts.monitor.takeRecentErrors();
    let observationText = formatObservation(obs);
    if (networkErrors.length) {
      observationText += `\n\nNetwork errors since your last action:\n${networkErrors.map((e) => `  - ${e}`).join('\n')}`;
    }

    // Stuck detection: actions that should change the page but didn't.
    const fingerprint = pageFingerprint(obs);
    if (lastActionMutates && fingerprint === lastFingerprint) unchangedActions++;
    else if (fingerprint !== lastFingerprint) unchangedActions = 0;
    lastFingerprint = fingerprint;
    if (unchangedActions >= 2) {
      observationText += `\n\nWARNING: your last ${unchangedActions} actions did not change the page at all. Repeating them won't help. Try a different element, scroll, navigate directly to a URL, or finish with a verdict (if a button does nothing, that may be a bug worth report_bug).`;
    }

    const screenshot = opts.vision
      ? (await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null))?.toString('base64')
      : undefined;

    let decision: { name: string; args: Record<string, any> } | null = null;
    try {
      decision = await decideNextAction(opts, systemPrompt, observationText, history, stepNumber, screenshot);
    } catch (err: any) {
      await hooks.log('AGENT_LLM_ERROR', `LLM call failed: ${err.message}`, 'WARN');
    }
    if (!decision) {
      llmFailures++;
      if (llmFailures >= 3) {
        status = 'AGENT_ERROR';
        summary = 'The AI model failed to choose an action three times in a row.';
        break;
      }
      stepNumber--;
      continue;
    }
    llmFailures = 0;

    const { name, args } = decision;
    lastActionMutates = MUTATING_TOOLS.has(name);

    if (name === 'finish') {
      status = (['PASS', 'FAIL', 'BLOCKED'].includes(args.status) ? args.status : 'AGENT_ERROR') as GoalStatus;
      summary = String(args.summary || '');
      break;
    }

    if (name === 'report_bug') {
      const shotPath = path.join(opts.screenshotDir, `${opts.runId}_${goal.id}_bug_${findings.length + 1}.png`);
      const shot = await captureScreenshot(page, shotPath);
      const finding: Finding = {
        goalId: goal.id,
        severity: args.severity || 'MEDIUM',
        title: String(args.title || 'Untitled issue'),
        details: String(args.details || ''),
        url: page.url(),
        screenshotPath: shot.success ? shot.path : undefined,
        timestamp: new Date().toISOString(),
      };
      findings.push(finding);
      history.push(`#${stepNumber} report_bug(${finding.severity}: ${finding.title}) -> recorded`);
      await hooks.log('BUG_REPORTED', `🐞 [${finding.severity}] ${finding.title}: ${finding.details}`, 'ERROR', {
        journeyId: goal.id,
        url: finding.url,
        screenshot: finding.screenshotPath,
      });
      if (findings.length <= 5) stepNumber--; // a few reports don't consume the action budget
      continue;
    }

    if (name === 'ask_user') {
      const question = String(args.question || 'The agent needs more information.');
      const fieldLabel = String(args.field_label || 'Answer');
      const labelKey = fieldLabel.trim().toLowerCase();
      const alreadyDeclined = opts.declinedQuestions.has(labelKey);

      let answer = '';
      if (alreadyDeclined) {
        await hooks.log('ASK_USER_SKIPPED', `🙋 "${fieldLabel}" was already skipped by the developer this run — not asking again.`, 'INFO', {
          journeyId: goal.id,
        });
      } else {
        await hooks.log('ASK_USER', `🙋 Agent asks: ${question}`, 'WARN', { journeyId: goal.id });
        answer = await hooks.askUser({
          question,
          fieldLabel,
          sensitive: Boolean(args.sensitive),
          stepNumber,
          goalId: goal.id,
          pageUrl: page.url(),
        });
      }
      if (args.sensitive && answer) sensitiveValues.add(answer);
      steps.push({
        stepNumber,
        action: 'ASK_USER',
        description: question,
        success: Boolean(answer),
        message: answer ? 'User answered' : 'No answer from user',
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });

      if (!answer) {
        opts.declinedQuestions.set(labelKey, question);
        status = 'BLOCKED';
        summary = `Needs input from the developer: "${question}" — no answer was given.`;
        break;
      }
      history.push(`#${stepNumber} ask_user("${question}") -> user answered: "${answer}"`);
      continue;
    }

    const description = describeAction(name, args, obs, sensitiveValues);
    // Scrolling is only a loop if the page stops moving, so the position is part of the fingerprint.
    const scrollY = name === 'scroll' ? await page.evaluate(() => Math.round(window.scrollY)).catch(() => 0) : '';
    const verdict = await guardrails.checkBeforeStep(
      {
        url: obs.url,
        selector: `${args.ref ?? args.url ?? args.key ?? args.direction ?? ''}:${args.value ?? ''}:${scrollY}`,
        action: name.toUpperCase(),
      },
      host
    );
    if (!verdict.allowed) {
      status = 'AGENT_ERROR';
      const lastFailure = [...steps].reverse().find((s) => !s.success);
      summary =
        verdict.code === 'LOOP_DETECTED'
          ? `Got stuck repeating the same action (${description}) on ${obs.url} without making progress.`
          : verdict.code === 'ERROR_BUDGET_EXCEEDED'
          ? `Stopped after several failed actions in a row.${lastFailure ? ` Last error: ${lastFailure.message}` : ''}`
          : verdict.code === 'STEP_BUDGET_EXCEEDED'
          ? `Ran out of steps before reaching a verdict. Last page: ${obs.url}`
          : verdict.message;
      await hooks.log('GUARDRAIL_STOP', `🛑 ${verdict.message}`, 'WARN', { journeyId: goal.id, code: verdict.code });
      break;
    }
    if (verdict.delayMs > 0) await page.waitForTimeout(verdict.delayMs);

    await hooks.log('STEP_DISPATCH', `Step ${stepNumber} [${name.toUpperCase()}]: ${description} — ${args.reason || ''}`, 'INFO', {
      journeyId: goal.id,
      stepNumber,
    });

    let result: { success: boolean; message: string };
    const targetEl = args.ref !== undefined ? obs.elements.find((e) => e.ref === Number(args.ref)) : undefined;
    const risk = name === 'click' ? riskForElement(targetEl) : null;
    const wouldTextFakePhone =
      name === 'click' &&
      fakePhoneDigits !== '' &&
      SEND_CODE_PATTERN.test(targetEl?.name || '') &&
      obs.elements.some((e) => (e.value || '').replace(/\D/g, '').includes(fakePhoneDigits));
    if (wouldTextFakePhone) {
      result = {
        success: false,
        message:
          'BLOCKED by safety rule: the phone number in this form is fake and may belong to a stranger. Use ask_user to get a phone number the developer controls, fill it in, then request the code.',
      };
    } else if (risk) {
      const previewPath = path.join(opts.screenshotDir, `${opts.runId}_${goal.id}_step_${stepNumber}_gate2_preview.png`);
      const preview = await captureScreenshot(page, previewPath);
      const decisionRes = await hooks.approveAction({
        stepNumber,
        goalId: goal.id,
        action: 'CLICK',
        description,
        reason: risk.reason,
        riskLevel: risk.riskLevel,
        screenshotPath: preview.success ? preview.path : undefined,
      });
      result = decisionRes.approved
        ? await executeTool(session, name, args)
        : { success: false, message: `Human rejected this action${decisionRes.notes ? `: ${decisionRes.notes}` : ''}. Do not retry it.` };
    } else {
      const stepStart = Date.now();
      result = await executeTool(session, name, args);
      result.message = `${result.message} (${Date.now() - stepStart}ms)`;
    }

    const urlAfter = session.page.url();
    guardrails.recordStepResult({
      success: result.success,
      durationMs: 0,
      pageUrlAfter: urlAfter,
      isNavigation: name === 'navigate',
    });

    const shot = await captureScreenshot(session.page, screenshotPathFor(stepNumber));
    const urlNote = urlAfter !== obs.url ? ` → now at ${urlAfter}` : '';
    steps.push({
      stepNumber,
      action: name.toUpperCase(),
      description: `${description}${args.reason ? ` — ${args.reason}` : ''}`,
      success: result.success,
      message: `${result.message}${urlNote}`,
      durationMs: 0,
      screenshotPath: shot.success ? shot.path : undefined,
      timestamp: new Date().toISOString(),
    });
    history.push(`#${stepNumber} ${description} -> ${result.success ? 'OK' : 'FAILED'}: ${result.message}${urlNote}`);

    await hooks.log(
      result.success ? 'STEP_PASS' : 'STEP_FAIL',
      `${result.success ? '✓' : '✗'} Step ${stepNumber}: ${description} — ${result.message}${urlNote}`,
      result.success ? 'SUCCESS' : 'ERROR',
      { journeyId: goal.id, stepNumber, screenshot: shot.path }
    );
  }

  // Durations: time between consecutive step timestamps gives a useful approximation.
  for (let i = 0; i < steps.length; i++) {
    const prev = i === 0 ? start : new Date(steps[i - 1].timestamp).getTime();
    steps[i].durationMs = Math.max(0, new Date(steps[i].timestamp).getTime() - prev);
  }

  const passedSteps = steps.filter((s) => s.success).length;
  const verdictLevel = status === 'PASS' ? 'SUCCESS' : status === 'FAIL' ? 'ERROR' : 'WARN';
  await hooks.log(
    status === 'PASS' ? 'JOURNEY_PASS' : 'JOURNEY_FAIL',
    `Goal "${goal.title}" → ${status}: ${summary}`,
    verdictLevel,
    { journeyId: goal.id, status }
  );

  return {
    journeyId: goal.id,
    title: goal.title,
    status,
    summary,
    success: status === 'PASS',
    totalSteps: steps.length,
    passedSteps,
    failedSteps: steps.length - passedSteps,
    totalAssertions: status === 'PASS' || status === 'FAIL' ? 1 : 0,
    passedAssertions: status === 'PASS' ? 1 : 0,
    failedAssertions: status === 'FAIL' ? 1 : 0,
    durationMs: Date.now() - start,
    steps,
    findings,
  };
}
