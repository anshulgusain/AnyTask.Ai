'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { screenshotUrl, type JobItem, type JobLogItem } from '@/lib/api';
import { fmtDuration, getReport, goalStatus, hostOf, isActive, runVerdict, timeAgo } from '@/lib/report';
import { buildRunView, cleanLogMessage, PHASES, type LiveGoal } from '@/lib/runView';
import { GoalIcon, StatusPill } from './Status';

export interface RunActions {
  onRerun: () => Promise<void>;
  onCancel: () => Promise<void>;
  onAnswer: (value: string) => Promise<void>;
  onApprove: (approved: boolean) => Promise<void>;
  onNote: (note: string) => Promise<void>;
}

export default function RunDetail({ job, actions }: { job: JobItem; actions: RunActions }) {
  const view = useMemo(() => buildRunView(job), [job]);
  const report = getReport(job);
  const verdict = runVerdict(job);
  const active = isActive(job);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const goals: LiveGoal[] =
    view.goals.length > 0
      ? view.goals
      : (report?.results ?? []).map((g) => ({
          id: g.journeyId,
          title: g.title,
          state: goalStatus(g),
          steps: g.totalSteps,
          summary: g.summary,
        }));

  const lastEventAt = job.logs?.length ? job.logs[job.logs.length - 1].createdAt : job.updatedAt;
  const elapsed = report ? report.totalDurationMs : new Date(lastEventAt).getTime() - new Date(job.createdAt).getTime();

  return (
    <div>
      <div className="run-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">{hostOf(job.targetUrl)}</h1>
            <StatusPill label={verdict.label} tone={verdict.tone} />
          </div>
          <div className="run-header-meta">
            <a href={job.targetUrl} target="_blank" rel="noreferrer" className="mono">{job.targetUrl}</a>
            <span>Started {timeAgo(job.createdAt)}</span>
            {(report || active) && <span>{fmtDuration(elapsed)}</span>}
            {report?.model && <span>{report.model}</span>}
          </div>
        </div>
        <div className="run-actions">
          {active ? (
            <button className="btn btn-danger" disabled={busy} onClick={run(actions.onCancel)}>Cancel run</button>
          ) : (
            <button className="btn" disabled={busy} onClick={run(actions.onRerun)}>Run again</button>
          )}
          {report && (
            <Link className="btn btn-primary" href={`/report?jobId=${job.id}`}>Open report</Link>
          )}
        </div>
      </div>

      {active && (
        <div className="phase-track">
          {PHASES.map((p, i) => {
            const current = PHASES.findIndex((x) => x.id === view.phase);
            const state = i < current ? 'done' : i === current ? 'current' : '';
            return (
              <span key={p.id} className={state}>
                <GoalIcon state={state === 'done' ? 'PASS' : state === 'current' ? 'running' : 'queued'} />
                {p.label}
              </span>
            );
          })}
        </div>
      )}

      <NeedsYou job={job} busy={busy} run={run} actions={actions} />

      {active && <NoteBox onSend={actions.onNote} />}

      {job.status === 'FAILED' && job.error && !report && (
        <div className="callout" style={{ borderColor: '#efc5c1', background: '#fdf6f5' }}>
          <div className="callout-title" style={{ color: 'var(--fail)' }}>The run stopped with an error</div>
          <div className="muted mono" style={{ fontSize: 12.5 }}>{job.error}</div>
        </div>
      )}

      <div className="run-grid">
        <section className="panel">
          <div className="panel-head">
            <span className="eyebrow">Goals</span>
            {goals.length > 0 && (
              <span className="faint" style={{ fontSize: 12 }}>
                {goals.filter((g) => g.state === 'PASS').length} of {goals.length} passed
              </span>
            )}
          </div>
          {goals.length === 0 ? (
            <p className="hint" style={{ padding: 14 }}>
              {active ? 'The agent is reading your site. Goals appear here once it has a plan.' : 'No goals were run.'}
            </p>
          ) : (
            goals.map((g) => (
              <div className="goal-row" key={g.id}>
                <GoalIcon state={g.state} />
                <span className="goal-title">{g.title}</span>
                <span className="faint" style={{ fontSize: 12 }}>{g.steps > 0 ? `${g.steps} steps` : ''}</span>
                {g.summary && <span className="goal-summary">{g.summary}</span>}
              </div>
            ))
          )}
        </section>

        <section className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel-head">
            <span className="eyebrow">{active ? 'Live view' : 'Last screen'}</span>
            {view.latestScreenshotAt && <span className="faint" style={{ fontSize: 12 }}>{timeAgo(view.latestScreenshotAt)}</span>}
          </div>
          <div className="live-frame">
            {view.latestScreenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={screenshotUrl(view.latestScreenshot)} alt="Latest screenshot from the test browser" />
            ) : (
              <span className="hint">The browser view shows up once the agent starts clicking.</span>
            )}
          </div>
          <div className="live-caption">
            {view.activity ? <span>{cleanLogMessage(view.activity)}</span> : <span className="faint">{active ? 'Working…' : 'Run finished.'}</span>}
            {view.currentUrl && <span className="mono faint" style={{ fontSize: 11.5 }}>{view.currentUrl}</span>}
          </div>
        </section>
      </div>

      {job.testIdentity && (
        <div className="identity-line">
          <span>Test account</span>
          <span>email <code>{job.testIdentity.email}</code></span>
          <span>password <code>{job.testIdentity.password}</code></span>
          <span>phone <code>{job.testIdentity.phone}</code>{job.testIdentity.phoneIsReal ? '' : ' (fake)'}</span>
        </div>
      )}

      <ActivityLog logs={job.logs ?? []} follow={active} />
    </div>
  );
}

function NeedsYou({
  job,
  busy,
  run,
  actions,
}: {
  job: JobItem;
  busy: boolean;
  run: (fn: () => Promise<void>) => () => Promise<void>;
  actions: RunActions;
}) {
  const [answer, setAnswer] = useState('');

  if (job.status === 'AWAITING_FIELD_INPUT' && job.pendingFieldInput) {
    const q = job.pendingFieldInput;
    return (
      <div className="callout">
        <div className="callout-title">The agent has a question</div>
        <div>{q.description}</div>
        <div className="hint mono" style={{ marginTop: 4 }}>{q.pageUrl}</div>
        <form
          className="callout-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (answer.trim()) run(async () => { await actions.onAnswer(answer); setAnswer(''); })();
          }}
        >
          <input
            className="input"
            autoFocus
            type={q.fieldType === 'password' ? 'password' : 'text'}
            placeholder={q.fieldLabel}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !answer.trim()}>Send</button>
          <button type="button" className="btn" disabled={busy} onClick={run(() => actions.onAnswer(''))}>Skip</button>
        </form>
        <p className="hint" style={{ marginTop: 8 }}>Skipping marks this goal as blocked; the agent won&apos;t ask again this run.</p>
      </div>
    );
  }

  if (job.status === 'AWAITING_ACTION_APPROVAL' && job.pendingAction) {
    const a = job.pendingAction;
    return (
      <div className="callout">
        <div className="callout-title">Approve this action?</div>
        <div>{a.description}</div>
        <div className="hint" style={{ marginTop: 4 }}>{a.reason}</div>
        {a.screenshotPath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={screenshotUrl(a.screenshotPath)} alt="Page before the action" />
        )}
        <div className="callout-row">
          <button className="btn btn-primary" disabled={busy} onClick={run(() => actions.onApprove(true))}>Approve</button>
          <button className="btn" disabled={busy} onClick={run(() => actions.onApprove(false))}>Skip this step</button>
        </div>
      </div>
    );
  }

  return null;
}

function NoteBox({ onSend }: { onSend: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <form
      className="note-box"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!note.trim()) return;
        setSending(true);
        try {
          await onSend(note.trim());
          setNote('');
          setSent(true);
          setTimeout(() => setSent(false), 2500);
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        } finally {
          setSending(false);
        }
      }}
    >
      <input
        className="input"
        placeholder='Guide the agent, e.g. "the admin panel is at /admin" or "skip the newsletter popup"'
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className="btn" disabled={sending || !note.trim()}>
        {sent ? 'Sent' : 'Send note'}
      </button>
    </form>
  );
}

const KEY_STEPS = /^(PHASE_|WARMUP_|DISCOVERY_DONE|LINK_CHECK|PLANNER_SUCCESS|JOURNEY_|STEP_PASS|STEP_FAIL|ASK_USER|FIELD_INPUT|BUG_REPORTED|GUARDRAIL|HITL_|AUTH_|PIPELINE_COMPLETE|FATAL|ERROR|CANCELLED|TEST_IDENTITY|QUEUED|USER_NOTE|BLOCKED_REQUEST)/;

function ActivityLog({ logs, follow }: { logs: JobLogItem[]; follow: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const shown = showAll ? logs : logs.filter((l) => KEY_STEPS.test(l.step) || l.level === 'ERROR');

  useEffect(() => {
    if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [follow, shown.length]);

  return (
    <section className="panel section">
      <div className="panel-head">
        <span className="eyebrow">Activity</span>
        <label className="checkbox-row" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          All events ({logs.length})
        </label>
      </div>
      <div className="log" ref={bodyRef}>
        {shown.length === 0 ? (
          <div className="hint" style={{ padding: '8px 14px' }}>Waiting for the agent…</div>
        ) : (
          shown.map((l) => (
            <div key={l.id} className={`log-line ${l.level}`}>
              <span className="log-time">
                {new Date(l.createdAt).toLocaleTimeString(undefined, { hour12: false })}
              </span>
              <span className={`log-bar ${l.level}`} />
              <span className="log-msg">{cleanLogMessage(l.message)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
