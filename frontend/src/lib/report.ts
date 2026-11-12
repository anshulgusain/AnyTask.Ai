import type { JobItem, TestIdentity } from './api';

// Mirrors backend/src/ai/agentLoop.ts + siteMonitor.ts result shapes.

export type GoalStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'AGENT_ERROR';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Finding {
  goalId: string;
  severity: Severity;
  title: string;
  details: string;
  url: string;
  screenshotPath?: string;
  timestamp: string;
}

export interface SiteHealthEvent {
  kind: 'CONSOLE_ERROR' | 'PAGE_ERROR' | 'HTTP_ERROR' | 'REQUEST_FAILED' | 'BROKEN_LINK';
  message: string;
  url: string;
  status?: number;
  count: number;
  firstSeenAt: string;
}

export interface StepResult {
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
  status?: GoalStatus;
  summary?: string;
  success: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  durationMs: number;
  steps: StepResult[];
}

export interface RunReport {
  agentMode?: 'autonomous' | 'legacy';
  model?: string;
  appSummary?: string;
  targetBaseUrl: string;
  executedAt: string;
  totalDurationMs: number;
  totalJourneys: number;
  passedJourneys: number;
  failedJourneys: number;
  blockedJourneys?: number;
  inconclusiveJourneys?: number;
  results: GoalResult[];
  findings?: Finding[];
  siteHealth?: SiteHealthEvent[];
  testIdentity?: TestIdentity;
}

export function getReport(job: JobItem | null | undefined): RunReport | null {
  const r = job?.result;
  return r && typeof r === 'object' && 'totalJourneys' in r ? (r as unknown as RunReport) : null;
}

export function goalStatus(g: GoalResult): GoalStatus {
  return g.status ?? (g.success ? 'PASS' : 'FAIL');
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  PASS: 'Passed',
  FAIL: 'Failed',
  BLOCKED: 'Blocked',
  AGENT_ERROR: 'Inconclusive',
};

export const HEALTH_LABEL: Record<SiteHealthEvent['kind'], string> = {
  PAGE_ERROR: 'Uncaught JavaScript errors',
  HTTP_ERROR: 'Failed HTTP responses',
  REQUEST_FAILED: 'Requests that never completed',
  BROKEN_LINK: 'Broken links',
  CONSOLE_ERROR: 'Console errors',
};

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export type Issue = Finding & { goalTitle: string };

/** Agent-reported bugs plus failed goals that have no explicit bug attached. */
export function collectIssues(report: RunReport): Issue[] {
  const titleFor = (id: string) => report.results.find((r) => r.journeyId === id)?.title ?? id;
  const issues: Issue[] = (report.findings ?? []).map((f) => ({ ...f, goalTitle: titleFor(f.goalId) }));

  for (const goal of report.results) {
    if (goalStatus(goal) !== 'FAIL') continue;
    if (issues.some((i) => i.goalId === goal.journeyId)) continue;
    const lastShot = [...goal.steps].reverse().find((s) => s.screenshotPath)?.screenshotPath;
    issues.push({
      goalId: goal.journeyId,
      goalTitle: goal.title,
      severity: 'HIGH',
      title: `${goal.title} doesn't work`,
      details: goal.summary || 'The goal failed.',
      url: report.targetBaseUrl,
      screenshotPath: lastShot,
      timestamp: report.executedAt,
    });
  }

  return issues.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

export type Tone = 'pass' | 'fail' | 'warn' | 'info' | 'muted';

export interface Verdict {
  label: string;
  tone: Tone;
}

export function reportVerdict(report: RunReport): Verdict {
  if (report.agentMode !== 'autonomous') {
    return report.failedJourneys > 0 ? { label: 'Failed', tone: 'fail' } : { label: 'Passed', tone: 'pass' };
  }
  const issues = collectIssues(report).length;
  if (issues > 0) return { label: `${issues} issue${issues === 1 ? '' : 's'} found`, tone: 'fail' };
  if ((report.blockedJourneys ?? 0) + (report.inconclusiveJourneys ?? 0) > 0) return { label: 'Needs attention', tone: 'warn' };
  if ((report.siteHealth ?? []).some((e) => e.kind !== 'CONSOLE_ERROR')) return { label: 'Passed with warnings', tone: 'warn' };
  return { label: 'Passed', tone: 'pass' };
}

export const ACTIVE_STATUSES: JobItem['status'][] = [
  'PENDING',
  'RUNNING',
  'AWAITING_PLAN_APPROVAL',
  'AWAITING_ACTION_APPROVAL',
  'AWAITING_CREDENTIALS',
  'AWAITING_FIELD_INPUT',
];

export function isActive(job: JobItem): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

export function needsUser(job: JobItem): boolean {
  return job.status.startsWith('AWAITING_');
}

/** One status label for a run, used in lists and headers. */
export function runVerdict(job: JobItem): Verdict {
  if (needsUser(job)) return { label: 'Needs you', tone: 'warn' };
  if (job.status === 'RUNNING') return { label: 'Running', tone: 'info' };
  if (job.status === 'PENDING') return { label: 'Queued', tone: 'muted' };
  if (job.status === 'CANCELLED') return { label: 'Cancelled', tone: 'muted' };
  const report = getReport(job);
  if (report) return reportVerdict(report);
  if (job.status === 'FAILED') return { label: 'Errored', tone: 'fail' };
  return { label: job.status.toLowerCase(), tone: 'muted' };
}

// ─── Markdown export ─────────────────────────────────────────────────────────

export function buildMarkdownReport(title: string, report: RunReport): string {
  const lines: string[] = [];
  const issues = collectIssues(report);
  const mark: Record<GoalStatus, string> = { PASS: '[x]', FAIL: '[ ] ❌', BLOCKED: '[ ] ⏸', AGENT_ERROR: '[ ] ?' };

  lines.push(`# QA report: ${title}`, '');
  lines.push(`- **Site:** ${report.targetBaseUrl}`);
  lines.push(`- **Run at:** ${new Date(report.executedAt).toLocaleString()}`);
  if (report.appSummary) lines.push(`- **App:** ${report.appSummary}`);
  if (report.testIdentity) lines.push(`- **Test account:** ${report.testIdentity.email}`);
  lines.push('', '## Goals');
  for (const g of report.results) {
    const s = goalStatus(g);
    lines.push(`- ${mark[s]} **${g.title}** — ${GOAL_STATUS_LABEL[s]}. ${g.summary || ''}`);
  }

  lines.push('', `## Issues (${issues.length})`);
  if (issues.length === 0) lines.push('No issues found.');
  for (const i of issues) {
    lines.push(`### [${i.severity}] ${i.title}`, `- **Goal:** ${i.goalTitle}`, `- **Page:** ${i.url}`, '', i.details);
    const goal = report.results.find((r) => r.journeyId === i.goalId);
    if (goal && goal.steps.length > 0) {
      lines.push('', '**Steps to reproduce:**');
      goal.steps.forEach((st, idx) => lines.push(`${idx + 1}. ${st.description}${st.success ? '' : ` — failed: ${st.message}`}`));
    }
    lines.push('');
  }

  const health = report.siteHealth ?? [];
  if (health.length > 0) {
    lines.push(`## Site health (${health.length})`);
    for (const e of health) lines.push(`- **${HEALTH_LABEL[e.kind]}:** \`${e.message}\`${e.count > 1 ? ` ×${e.count}` : ''} (on ${e.url})`);
  }

  return lines.join('\n');
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
