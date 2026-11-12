'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthError, fetchJobById, type JobItem } from '@/lib/api';
import { useJobStream } from '@/lib/useJobStream';
import { collectIssues, fmtDuration, getReport, hostOf, isActive, reportVerdict, type RunReport } from '@/lib/report';
import { StatusPill } from '@/components/Status';
import TopBar from '@/components/TopBar';
import { AttentionSection, ExportButtons, GoalsSection, IssuesSection, SiteHealthSection } from './sections';

export default function ReportPage() {
  return (
    <Suspense fallback={null}>
      <ReportContent />
    </Suspense>
  );
}

function ReportContent() {
  const jobId = useSearchParams().get('jobId');
  const [error, setError] = useState<string | null>(null);
  // Streams live while the agent is still working; EventSource can't report HTTP errors,
  // so a one-off fetch surfaces "not found" / missing access key.
  const { job } = useJobStream(error ? null : jobId);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    fetchJobById(jobId)
      .then((data) => {
        if (!cancelled && !data) setError(`Run "${jobId}" was not found.`);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof AuthError ? 'Open the dashboard and enter the access key first.' : err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const displayError = jobId ? error : 'No run selected. Open a report from the dashboard.';
  const report = getReport(job);

  return (
    <>
      <TopBar />
      <div className="report">
        <Link href="/" className="faint" style={{ fontSize: 13 }}>← All runs</Link>

        {displayError ? (
          <div className="empty">
            <strong>Can&apos;t show this report</strong>
            {displayError}
          </div>
        ) : !job ? (
          <p className="hint" style={{ marginTop: 20 }}>Loading report…</p>
        ) : (
          <>
            <ReportHeader job={job} report={report} />
            {!report ? (
              <div className="panel empty" style={{ marginTop: 20 }}>
                <strong>{isActive(job) ? 'The agent is still running' : 'No results yet'}</strong>
                {isActive(job) ? 'This page updates as soon as the run finishes.' : 'Start the run from the dashboard to get a report.'}
              </div>
            ) : (
              <>
                <Stats report={report} />
                {report.agentMode === 'autonomous' && <IssuesSection report={report} />}
                {report.agentMode === 'autonomous' && <AttentionSection report={report} />}
                <GoalsSection report={report} />
                {report.agentMode === 'autonomous' && <SiteHealthSection events={report.siteHealth ?? []} />}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ReportHeader({ job, report }: { job: JobItem; report: RunReport | null }) {
  const verdict = report ? reportVerdict(report) : null;
  return (
    <div className="run-header" style={{ marginTop: 14, marginBottom: 0 }}>
      <div style={{ minWidth: 0, maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="page-title">QA report · {hostOf(job.targetUrl)}</h1>
          {verdict && <StatusPill label={verdict.label} tone={verdict.tone} />}
          {isActive(job) && <StatusPill label="Running" tone="info" />}
        </div>
        <div className="run-header-meta">
          <a href={job.targetUrl} target="_blank" rel="noreferrer" className="mono">{job.targetUrl}</a>
          {report && <span>{new Date(report.executedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          {report?.model && <span>{report.model}</span>}
        </div>
        {report?.appSummary && <p className="muted" style={{ marginTop: 10 }}>{report.appSummary}</p>}
        {report?.testIdentity && (
          <div className="identity-line" style={{ marginTop: 8 }}>
            <span>Test account</span>
            <span>email <code>{report.testIdentity.email}</code></span>
            <span>password <code>{report.testIdentity.password}</code></span>
          </div>
        )}
      </div>
      {report && <ExportButtons title={hostOf(job.targetUrl)} report={report} />}
    </div>
  );
}

function Stats({ report }: { report: RunReport }) {
  const agent = report.agentMode === 'autonomous';
  const issues = agent ? collectIssues(report).length : report.failedJourneys;
  const health = (report.siteHealth ?? []).length;
  const breakdown = [
    `${report.passedJourneys} passed`,
    `${report.failedJourneys} failed`,
    ...(agent ? [`${report.blockedJourneys ?? 0} blocked`, `${report.inconclusiveJourneys ?? 0} inconclusive`] : []),
  ].join(' · ');

  return (
    <div className="stat-row">
      <div className="stat">
        <div className="eyebrow">Goals</div>
        <div className="stat-value">{report.totalJourneys}</div>
        <div className="stat-sub">{breakdown}</div>
      </div>
      <div className="stat">
        <div className="eyebrow">Issues</div>
        <div className="stat-value" style={{ color: issues > 0 ? 'var(--fail)' : undefined }}>{issues}</div>
        <div className="stat-sub">{agent ? 'bugs and failed goals' : 'failed journeys'}</div>
      </div>
      <div className="stat">
        <div className="eyebrow">Site health</div>
        <div className="stat-value" style={{ color: health > 0 ? 'var(--warn)' : undefined }}>{agent ? health : '—'}</div>
        <div className="stat-sub">JS, network and link problems</div>
      </div>
      <div className="stat">
        <div className="eyebrow">Duration</div>
        <div className="stat-value">{fmtDuration(report.totalDurationMs)}</div>
        <div className="stat-sub">{agent ? 'including time waiting for you' : 'total'}</div>
      </div>
    </div>
  );
}
