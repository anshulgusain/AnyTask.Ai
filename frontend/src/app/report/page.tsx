'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchJobById, JobItem } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssertionReport {
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
}

interface StepExecutionResult {
  stepNumber: number;
  action: string;
  description: string;
  success: boolean;
  message: string;
  durationMs: number;
  screenshotPath?: string;
  assertionReport?: AssertionReport;
  timestamp: string;
}

interface JourneyExecutionResult {
  journeyId: string;
  title: string;
  success: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  steps: StepExecutionResult[];
}

interface ExecutionSummary {
  planId: string;
  targetBaseUrl: string;
  totalJourneys: number;
  passedJourneys: number;
  failedJourneys: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  totalDurationMs: number;
  executedAt: string;
  results: JourneyExecutionResult[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  click:    { bg: 'rgba(99,102,241,0.18)',  color: '#a5b4fc' },
  fill:     { bg: 'rgba(6,182,212,0.15)',   color: '#38bdf8' },
  navigate: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  assert:   { bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
  wait:     { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' },
  select:   { bg: 'rgba(167,139,250,0.15)', color: '#c4b5fd' },
  submit:   { bg: 'rgba(99,102,241,0.18)',  color: '#a5b4fc' },
  default:  { bg: 'rgba(255,255,255,0.06)', color: '#cbd5e1' },
};

function actionChipStyle(action: string) {
  const key = action.toLowerCase();
  const style = ACTION_COLORS[key] ?? ACTION_COLORS.default;
  return {
    display: 'inline-block',
    padding: '0.15rem 0.55rem',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: 700 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    background: style.bg,
    color: style.color,
    border: `1px solid ${style.color}44`,
    whiteSpace: 'nowrap' as const,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: '#121726',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px',
        padding: '1rem 1.25rem',
        minWidth: '140px',
        flex: '1 1 140px',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#64748b',
          marginBottom: '0.35rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          color: accent ?? '#f8fafc',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function StepTimeline({ steps }: { steps: StepExecutionResult[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', padding: '0.5rem 0' }}>
      {steps.map((step, i) => {
        const color = step.success ? '#10b981' : '#ef4444';
        const glowColor = step.success ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';
        const isHovered = hoveredIndex === i;
        return (
          <div key={i} style={{ position: 'relative' }}>
            <div
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: color,
                boxShadow: isHovered ? `0 0 10px ${glowColor}` : 'none',
                cursor: 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.55rem',
                fontWeight: 700,
                color: '#fff',
                transition: 'box-shadow 0.15s',
                flexShrink: 0,
              }}
            >
              {step.stepNumber}
            </div>
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '26px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#1e2538',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  padding: '0.45rem 0.7rem',
                  fontSize: '0.72rem',
                  color: '#e2e8f0',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  pointerEvents: 'none',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
                  maxWidth: '220px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span style={{ color: step.success ? '#34d399' : '#f87171', fontWeight: 700 }}>
                  Step {step.stepNumber}:
                </span>{' '}
                {step.description}
                <br />
                <span style={{ color: '#64748b' }}>{fmtDuration(step.durationMs)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JourneyCard({ journey }: { journey: JourneyExecutionResult }) {
  const [expanded, setExpanded] = useState(false);

  const passRate =
    journey.totalAssertions > 0
      ? Math.round((journey.passedAssertions / journey.totalAssertions) * 100)
      : journey.totalSteps > 0
      ? Math.round((journey.passedSteps / journey.totalSteps) * 100)
      : 100;

  return (
    <div
      style={{
        background: '#0d1120',
        border: `1px solid ${journey.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        borderRadius: '14px',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Journey Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '1.1rem 1.4rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          textAlign: 'left',
          color: '#f8fafc',
        }}
      >
        {/* Pass/fail indicator */}
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: journey.success ? '#10b981' : '#ef4444',
            boxShadow: `0 0 8px ${journey.success ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'}`,
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
            {journey.title}
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Steps:{' '}
              <span style={{ color: '#34d399' }}>{journey.passedSteps}✓</span>
              {journey.failedSteps > 0 && (
                <span style={{ color: '#f87171' }}> {journey.failedSteps}✗</span>
              )}{' '}
              / {journey.totalSteps}
            </span>
            {journey.totalAssertions > 0 && (
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Assertions:{' '}
                <span style={{ color: '#34d399' }}>{journey.passedAssertions}✓</span>
                {journey.failedAssertions > 0 && (
                  <span style={{ color: '#f87171' }}> {journey.failedAssertions}✗</span>
                )}{' '}
                / {journey.totalAssertions}
              </span>
            )}
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              ⏱ {fmtDuration(journey.durationMs)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          {/* Mini progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '60px',
                height: '6px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.1)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${passRate}%`,
                  background: passRate === 100 ? '#10b981' : passRate >= 70 ? '#f59e0b' : '#ef4444',
                  borderRadius: '999px',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', minWidth: '30px' }}>
              {passRate}%
            </span>
          </div>

          {/* Status badge */}
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.2rem 0.65rem',
              borderRadius: '999px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: journey.success
                ? 'rgba(16,185,129,0.15)'
                : 'rgba(239,68,68,0.15)',
              color: journey.success ? '#34d399' : '#f87171',
              border: `1px solid ${journey.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            {journey.success ? '✓ PASS' : '✗ FAIL'}
          </span>

          {/* Chevron */}
          <span
            style={{
              color: '#64748b',
              fontSize: '0.9rem',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
              display: 'inline-block',
            }}
          >
            ▾
          </span>
        </div>
      </button>

      {/* Step Timeline (always visible) */}
      <div style={{ padding: '0 1.4rem 0.85rem 1.4rem' }}>
        <StepTimeline steps={journey.steps ?? []} />
      </div>

      {/* Expanded Steps Table */}
      {expanded && journey.steps && journey.steps.length > 0 && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '1rem 1.4rem 1.4rem',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
              }}
            >
              <thead>
                <tr>
                  {['#', 'Action', 'Description', 'Duration', 'Status', 'Assertions', 'Screenshot'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#64748b',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journey.steps.map((step) => (
                  <>
                    <tr
                      key={`step-${step.stepNumber}`}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: step.success
                          ? 'transparent'
                          : 'rgba(239,68,68,0.04)',
                      }}
                    >
                      <td
                        style={{
                          padding: '0.6rem 0.75rem',
                          color: '#64748b',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {step.stepNumber}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <span style={actionChipStyle(step.action)}>{step.action}</span>
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', color: '#cbd5e1', maxWidth: '320px' }}>
                        <div style={{ marginBottom: step.message ? '0.2rem' : 0 }}>
                          {step.description}
                        </div>
                        {step.message && step.message !== step.description && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                            {step.message}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '0.6rem 0.75rem',
                          color: '#94a3b8',
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.78rem',
                        }}
                      >
                        {fmtDuration(step.durationMs)}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: step.success ? '#34d399' : '#f87171',
                            fontSize: '0.8rem',
                          }}
                        >
                          {step.success ? '✓ PASS' : '✗ FAIL'}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                        {step.assertionReport ? (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: step.assertionReport.passed ? '#34d399' : '#f87171',
                            }}
                          >
                            {step.assertionReport.passedCount}/{step.assertionReport.total}{' '}
                            {step.assertionReport.passed ? '✓' : '✗'}
                          </span>
                        ) : (
                          <span style={{ color: '#334155', fontSize: '0.72rem' }}>—</span>
                        )}
                      </td>
                      {/* Screenshot cell */}
                      <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                        {step.screenshotPath ? (
                          <details>
                            <summary
                              style={{
                                cursor: 'pointer',
                                fontSize: '0.72rem',
                                color: '#6366f1',
                                userSelect: 'none',
                                listStyle: 'none',
                              }}
                            >
                              📸 View
                            </summary>
                            <img
                              src={`http://localhost:5001/api/screenshots/${step.screenshotPath.split('/').pop()}`}
                              alt={`Step ${step.stepNumber} screenshot`}
                              style={{
                                maxWidth: '320px',
                                borderRadius: '6px',
                                marginTop: '0.4rem',
                                border: '1px solid rgba(99,102,241,0.3)',
                                display: 'block',
                              }}
                            />
                          </details>
                        ) : (
                          <span style={{ color: '#334155', fontSize: '0.72rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');

  const [job, setJob] = useState<JobItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setError('No jobId provided in query parameters.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchJobById(jobId as string);
        if (cancelled) return;
        if (!data) {
          setError(`Job "${jobId}" not found.`);
        } else {
          setJob(data);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load job.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [jobId]);

  const summary: ExecutionSummary | null =
    job?.result && typeof job.result === 'object' && 'totalJourneys' in job.result
      ? (job.result as unknown as ExecutionSummary)
      : null;

  const passRate =
    summary && summary.totalAssertions > 0
      ? Math.round((summary.passedAssertions / summary.totalAssertions) * 100)
      : summary && summary.totalJourneys > 0
      ? Math.round((summary.passedJourneys / summary.totalJourneys) * 100)
      : null;

  const allPassed =
    summary != null &&
    summary.failedJourneys === 0 &&
    summary.failedAssertions === 0;

  // ── Render helpers ──

  if (loading) {
    return (
      <div style={pageWrap}>
        <BackLink />
        <div style={centeredBox}>
          <div style={spinner} />
          <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.9rem' }}>
            Loading audit report…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageWrap}>
        <BackLink />
        <div style={centeredBox}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.5 }}>⚠️</div>
          <h3 style={{ color: '#f87171', marginBottom: '0.5rem' }}>Error</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!job) return null;

  return (
    <div style={pageWrap}>
      {/* ── Back Link ── */}
      <BackLink />

      {/* ── Report Card Header ── */}
      <div
        style={{
          background: '#121726',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '2rem',
          marginBottom: '1.75rem',
          boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  background: 'rgba(99,102,241,0.15)',
                  color: '#818cf8',
                  border: '1px solid rgba(99,102,241,0.3)',
                  padding: '0.15rem 0.6rem',
                  borderRadius: '999px',
                }}
              >
                Audit Report
              </span>
              {summary && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.75rem',
                    borderRadius: '999px',
                    background: allPassed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: allPassed ? '#34d399' : '#f87171',
                    border: `1px solid ${allPassed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}
                >
                  {allPassed ? '✓ ALL PASSED' : '✗ FAILURES DETECTED'}
                </span>
              )}
            </div>
            <h1
              style={{
                fontSize: '1.6rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: '#f8fafc',
                marginBottom: '0.25rem',
              }}
            >
              {job.title}
            </h1>
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem', color: '#64748b' }}>
              {summary?.targetBaseUrl && (
                <span>🔗 <span style={{ color: '#94a3b8' }}>{summary.targetBaseUrl}</span></span>
              )}
              {summary?.executedAt && (
                <span>📅 <span style={{ color: '#94a3b8' }}>{fmtDate(summary.executedAt)}</span></span>
              )}
              <span>🆔 <span style={{ color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{job.id}</span></span>
            </div>
          </div>
        </div>

        {/* Stat chips */}
        {summary ? (
          <>
            <div
              style={{
                display: 'flex',
                gap: '0.85rem',
                flexWrap: 'wrap',
                marginBottom: '1.5rem',
              }}
            >
              <StatChip
                label="Journeys"
                value={summary.totalJourneys}
                sub={`${summary.passedJourneys} pass · ${summary.failedJourneys} fail`}
                accent={summary.failedJourneys > 0 ? '#f87171' : '#34d399'}
              />
              <StatChip
                label="Assertions"
                value={summary.totalAssertions}
                sub={`${summary.passedAssertions} pass · ${summary.failedAssertions} fail`}
                accent={summary.failedAssertions > 0 ? '#f87171' : '#34d399'}
              />
              <StatChip
                label="Duration"
                value={fmtDuration(summary.totalDurationMs)}
                sub={`${summary.totalJourneys} journey${summary.totalJourneys !== 1 ? 's' : ''}`}
                accent="#38bdf8"
              />
              {passRate !== null && (
                <StatChip
                  label="Pass Rate"
                  value={`${passRate}%`}
                  sub="assertions"
                  accent={passRate === 100 ? '#34d399' : passRate >= 70 ? '#fbbf24' : '#f87171'}
                />
              )}
            </div>

            {/* Pass rate progress bar */}
            {passRate !== null && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Overall Pass Rate
                  </span>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: passRate === 100 ? '#34d399' : passRate >= 70 ? '#fbbf24' : '#f87171',
                    }}
                  >
                    {passRate}%
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '10px',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${passRate}%`,
                      borderRadius: '999px',
                      background:
                        passRate === 100
                          ? 'linear-gradient(90deg, #10b981, #34d399)'
                          : passRate >= 70
                          ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                          : 'linear-gradient(90deg, #ef4444, #f87171)',
                      transition: 'width 0.8s ease',
                      boxShadow:
                        passRate === 100
                          ? '0 0 12px rgba(16,185,129,0.5)'
                          : 'none',
                    }}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          /* No execution data yet */
          <div
            style={{
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: '12px',
              padding: '1.5rem',
              textAlign: 'center',
              color: '#94a3b8',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔬</div>
            <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#e2e8f0' }}>No execution data yet</p>
            <p style={{ fontSize: '0.85rem' }}>
              This job hasn&apos;t run yet or produced no results. Go back to the dashboard and run the agent job.
            </p>
          </div>
        )}
      </div>

      {/* ── Journey Timeline ── */}
      {summary && summary.results && summary.results.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#f8fafc',
              }}
            >
              Journey Timeline
              <span
                style={{
                  marginLeft: '0.6rem',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  fontWeight: 400,
                }}
              >
                {summary.results.length} journey{summary.results.length !== 1 ? 's' : ''}
              </span>
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Click a journey to expand steps
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {summary.results.map((journey) => (
              <JourneyCard key={journey.journeyId} journey={journey} />
            ))}
          </div>
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: '3rem' }} />
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0a0d14',
  color: '#f8fafc',
  fontFamily: 'sans-serif',
  padding: '1.75rem 1.5rem',
  maxWidth: '1100px',
  margin: '0 auto',
};

const centeredBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '40vh',
  textAlign: 'center',
};

const spinner: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  border: '3px solid rgba(99,102,241,0.2)',
  borderTopColor: '#6366f1',
  animation: 'spin 0.8s linear infinite',
};

function BackLink() {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#94a3b8',
          textDecoration: 'none',
          padding: '0.4rem 0.85rem',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          transition: 'all 0.15s',
        }}
      >
        ← Back to Dashboard
      </Link>

      {/* Spinner keyframe — inject once via a style tag */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
