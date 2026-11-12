'use client';

import { useState } from 'react';
import { screenshotUrl } from '@/lib/api';
import {
  buildMarkdownReport,
  collectIssues,
  fmtDuration,
  goalStatus,
  GOAL_STATUS_LABEL,
  HEALTH_LABEL,
  type GoalResult,
  type RunReport,
  type Severity,
  type SiteHealthEvent,
} from '@/lib/report';
import { GoalIcon } from '@/components/Status';
import { cleanLogMessage } from '@/lib/runView';

const SEVERITY_TONE: Record<Severity, string> = {
  CRITICAL: 'tone-fail',
  HIGH: 'tone-fail',
  MEDIUM: 'tone-warn',
  LOW: 'tone-muted',
};

function Screenshot({ path, alt }: { path?: string; alt: string }) {
  if (!path) return null;
  return (
    <details className="shot-toggle">
      <summary>Show screenshot</summary>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={screenshotUrl(path)} alt={alt} loading="lazy" />
    </details>
  );
}

export function IssuesSection({ report }: { report: RunReport }) {
  const issues = collectIssues(report);
  return (
    <section className="section">
      <h2 className="section-title">
        Issues <span className="count">{issues.length}</span>
      </h2>
      <div className="panel">
        {issues.length === 0 ? (
          <p className="hint" style={{ padding: 14 }}>No bugs found in the goals the agent could complete.</p>
        ) : (
          issues.map((issue, idx) => (
            <div className="issue" key={`${issue.goalId}-${idx}`}>
              <div className="issue-head">
                <span className={`sev ${SEVERITY_TONE[issue.severity]}`}>{issue.severity}</span>
                <span className="issue-title">{issue.title}</span>
              </div>
              <p className="issue-details">{issue.details}</p>
              <div className="issue-meta">
                <span>Goal: {issue.goalTitle}</span>
                <span className="mono">{issue.url}</span>
              </div>
              <Screenshot path={issue.screenshotPath} alt={issue.title} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function hintForBlocked(text: string): string | null {
  if (/phone|otp|sms|mobile/i.test(text)) return 'Set TEST_PHONE in backend/.env to a number you control, then answer the code prompt during the run.';
  if (/email|verification link|inbox/i.test(text)) return 'Set TEST_EMAIL_BASE in backend/.env so verification emails reach your inbox.';
  if (/captcha/i.test(text)) return 'Turn off the captcha on your staging environment, or allow-list test traffic.';
  if (/credential|password|log ?in|sign ?in/i.test(text)) return 'Add the login details under "Test data" when you start the run, or answer when the agent asks.';
  return null;
}

export function AttentionSection({ report }: { report: RunReport }) {
  const blocked = report.results.filter((g) => goalStatus(g) === 'BLOCKED');
  const inconclusive = report.results.filter((g) => goalStatus(g) === 'AGENT_ERROR');
  if (blocked.length + inconclusive.length === 0) return null;

  return (
    <section className="section">
      <h2 className="section-title">
        Couldn&apos;t finish <span className="count">{blocked.length + inconclusive.length}</span>
      </h2>
      <div className="panel">
        {blocked.map((g) => {
          const hint = hintForBlocked(g.summary || '');
          return (
            <div className="issue" key={g.journeyId}>
              <div className="issue-head">
                <span className="pill tone-warn">Blocked</span>
                <span className="issue-title">{g.title}</span>
              </div>
              <p className="issue-details">{g.summary}</p>
              {hint && <p className="hint" style={{ marginTop: 6, color: 'var(--ink-2)' }}>To unblock: {hint}</p>}
            </div>
          );
        })}
        {inconclusive.map((g) => (
          <div className="issue" key={g.journeyId}>
            <div className="issue-head">
              <span className="pill tone-muted">Inconclusive</span>
              <span className="issue-title">{g.title}</span>
            </div>
            <p className="issue-details">{g.summary}</p>
            <p className="hint" style={{ marginTop: 6 }}>
              The agent got stuck, which doesn&apos;t necessarily mean your site is broken. Clearer instructions usually help.
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GoalsSection({ report }: { report: RunReport }) {
  return (
    <section className="section">
      <h2 className="section-title">
        Goals <span className="count">{report.results.length}</span>
      </h2>
      <div className="panel">
        {report.results.map((g) => (
          <GoalCard key={g.journeyId} goal={g} />
        ))}
      </div>
    </section>
  );
}

function GoalCard({ goal }: { goal: GoalResult }) {
  const status = goalStatus(goal);
  return (
    <details className="goal-card">
      <summary>
        <GoalIcon state={status} />
        <span className="goal-title">{goal.title}</span>
        <span className="faint" style={{ fontSize: 12 }}>
          {GOAL_STATUS_LABEL[status]} · {goal.steps.length} steps · {fmtDuration(goal.durationMs)}
        </span>
        {goal.summary && <span className="goal-summary">{goal.summary}</span>}
      </summary>
      {goal.steps.length > 0 && (
        <table className="steps">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Action</th>
              <th style={{ width: 80 }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {goal.steps.map((s) => {
              const [action, reason] = cleanLogMessage(s.description).split(' — ');
              // Successful steps only need the navigation outcome; internal "Clicked [12] (80ms)" is noise.
              const note = s.success ? s.message.match(/→ now at \S+/)?.[0] : s.message;
              return (
                <tr key={s.stepNumber} className={s.success ? '' : 'failed'}>
                  <td className="mono faint">{s.stepNumber}</td>
                  <td>
                    <div>{action}</div>
                    {reason && <div className="step-msg">{reason}</div>}
                    {note && <div className="step-msg mono" style={{ color: s.success ? undefined : 'var(--fail)' }}>{note}</div>}
                    <Screenshot path={s.screenshotPath} alt={`Step ${s.stepNumber}`} />
                  </td>
                  <td style={{ color: s.success ? 'var(--pass)' : 'var(--fail)', fontSize: 12, fontWeight: 500 }}>
                    {s.success ? 'OK' : 'Failed'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </details>
  );
}

export function SiteHealthSection({ events }: { events: SiteHealthEvent[] }) {
  const kinds = (Object.keys(HEALTH_LABEL) as SiteHealthEvent['kind'][]).filter((k) => events.some((e) => e.kind === k));
  return (
    <section className="section">
      <h2 className="section-title">
        Site health <span className="count">{events.length}</span>
      </h2>
      <div className="panel panel-body">
        {events.length === 0 ? (
          <p className="hint">No JavaScript errors, failed requests or broken links were seen while testing.</p>
        ) : (
          kinds.map((kind) => (
            <div className="health-group" key={kind}>
              <div className="eyebrow">{HEALTH_LABEL[kind]}</div>
              <ul className="health-list">
                {events
                  .filter((e) => e.kind === kind)
                  .map((e, i) => (
                    <li key={i}>
                      <code style={{ color: kind === 'CONSOLE_ERROR' ? 'var(--ink-2)' : 'var(--fail)' }}>{e.message}</code>
                      {e.count > 1 && <span className="faint">×{e.count}</span>}
                      <span className="faint mono">{e.url}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function ExportButtons({ title, report }: { title: string; report: RunReport }) {
  const [copied, setCopied] = useState(false);
  const markdown = () => buildMarkdownReport(title, report);

  return (
    <div className="run-actions">
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await navigator.clipboard.writeText(markdown());
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? 'Copied' : 'Copy as Markdown'}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const blob = new Blob([markdown()], { type: 'text/markdown' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `qa-report-${new Date(report.executedAt).toISOString().slice(0, 10)}.md`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        Download .md
      </button>
    </div>
  );
}
