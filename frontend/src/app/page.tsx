'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  fetchJobs,
  createJob,
  runJob,
  checkBackendHealth,
  submitJobCredentials,
  approveJobAction,
  JobItem,
  JobLogItem,
} from '@/lib/api';

interface FieldPair {
  key: string;
  value: string;
}

const PRESETS = [
  {
    name: 'Go-Trade (Account Sign-Up Flow)',
    url: 'https://go-trade-web.onrender.com/',
    instructions: 'Locate the Sign Up button, navigate to the registration form, and fill in user details to create a new account.',
    fields: [],
  },
  {
    name: 'Local Demo Form (Guaranteed)',
    url: 'http://localhost:3000/demo-form',
    instructions: 'Locate the contact form, populate fields, and click Submit.',
    fields: [
      { key: 'fullName', value: 'Jane Doe' },
      { key: 'email', value: 'jane.doe@example.com' },
      { key: 'subject', value: 'Testing Autonomous Browser Agent' },
      { key: 'message', value: 'Hello! This was auto-filled by Playwright.' },
    ],
  },
  {
    name: 'HTTPBin Public Test Form',
    url: 'https://httpbin.org/forms/post',
    instructions: 'Fill customer name and comments on httpbin test form.',
    fields: [
      { key: 'custname', value: 'Alex Chen' },
      { key: 'custtel', value: '555-0199' },
      { key: 'custemail', value: 'alex.chen@example.com' },
      { key: 'comments', value: 'Automated test post from AnyTask.AI' },
    ],
  },
  {
    name: 'HTML Form Playground',
    url: 'https://testpages.eviltester.com/styled/basic-html-form-test.html',
    instructions: 'Fill username and comments inputs.',
    fields: [
      { key: 'username', value: 'agent_user' },
      { key: 'comments', value: 'Testing basic HTML form inputs.' },
    ],
  },
];

function getPipelineStatus(job: JobItem) {
  const logs = job.logs || [];
  const latestStepLog = [...logs].reverse().find(
    (l) => l.step === 'STEP_DISPATCH' || l.step === 'STEP_PASS' || l.step === 'STEP_FAIL'
  );
  const latestPhaseLog = [...logs].reverse().find(
    (l) => l.step.startsWith('PHASE_') || l.step === 'AGENT_INIT' || l.step === 'PIPELINE_COMPLETE'
  );

  let currentPhase: 'DISCOVERY' | 'PLANNING' | 'EXECUTION' | 'COMPLETED' = 'DISCOVERY';
  if (job.status === 'RUNNING' || job.status === 'AWAITING_CREDENTIALS' || job.status === 'AWAITING_ACTION_APPROVAL' || job.status === 'AWAITING_FIELD_INPUT') {
    if (logs.some((l) => l.step === 'PHASE_EXECUTION' || l.step === 'STEP_DISPATCH')) {
      currentPhase = 'EXECUTION';
    } else if (logs.some((l) => l.step === 'PHASE_PLANNING' || l.step === 'PLANNER_START')) {
      currentPhase = 'PLANNING';
    } else {
      currentPhase = 'DISCOVERY';
    }
  } else if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    currentPhase = 'COMPLETED';
  }

  const passedSteps = logs.filter((l) => l.step === 'STEP_PASS').length;
  const failedSteps = logs.filter((l) => l.step === 'STEP_FAIL').length;
  const totalStepsMatch = logs.find((l) => l.message.includes('total steps'))?.message.match(/(\d+)\s+total steps/);
  const totalSteps = totalStepsMatch ? parseInt(totalStepsMatch[1], 10) : passedSteps + failedSteps;

  return {
    currentPhase,
    activeAction: latestStepLog ? latestStepLog.message : latestPhaseLog ? latestPhaseLog.message : 'Waiting for agent to initialize...',
    passedSteps,
    failedSteps,
    totalSteps: Math.max(totalSteps, passedSteps + failedSteps),
    hasFailed: job.status === 'FAILED' || Boolean(job.result && job.result.failedJourneys > 0 && job.result.passedJourneys === 0),
  };
}

export default function HomePage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<{ online: boolean; message: string }>({
    online: false,
    message: 'Checking...',
  });

  // Form inputs
  const [jobTitle, setJobTitle] = useState('Auto-fill Contact Form');
  const [targetUrl, setTargetUrl] = useState('http://localhost:3000/demo-form');
  const [instructions, setInstructions] = useState('Locate the contact form, populate fields, and click Submit.');
  const [fields, setFields] = useState<FieldPair[]>([
    { key: 'fullName', value: 'Jane Doe' },
    { key: 'email', value: 'jane.doe@example.com' },
    { key: 'subject', value: 'Testing Autonomous Browser Agent' },
    { key: 'message', value: 'Hello! Auto-filled by Playwright.' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Poll backend health & jobs
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const health = await checkBackendHealth();
      if (!isMounted) return;
      setBackendStatus(health);

      if (health.online) {
        const loadedJobs = await fetchJobs();
        if (isMounted) {
          setJobs(loadedJobs);
          if (loadedJobs.length > 0 && !selectedJobId) {
            setSelectedJobId(loadedJobs[0].id);
          }
        }
      }
    }

    loadData();
    const interval = setInterval(loadData, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedJobId]);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];

  // HITL State: Credentials & Action Approvals
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const handleCredentialSubmit = async (action: 'PROVIDE_CREDENTIALS' | 'REGISTER_NEW' | 'SKIP') => {
    if (!selectedJob) return;
    setAuthSubmitting(true);
    try {
      await submitJobCredentials(selectedJob.id, {
        action,
        username: authUsername,
        password: authPassword,
      });
      setAuthUsername('');
      setAuthPassword('');
      const updated = await fetchJobs();
      setJobs(updated);
    } catch (err: any) {
      alert(`Error submitting credentials: ${err.message}`);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleActionApproval = async (approved: boolean) => {
    if (!selectedJob) return;
    setAuthSubmitting(true);
    try {
      await approveJobAction(selectedJob.id, approved);
      const updated = await fetchJobs();
      setJobs(updated);
    } catch (err: any) {
      alert(`Error processing approval: ${err.message}`);
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Apply a preset
  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setJobTitle(`Auto-fill: ${preset.name}`);
    setTargetUrl(preset.url);
    setInstructions(preset.instructions);
    setFields([...preset.fields]);
  };

  // Add field row
  const handleAddField = () => {
    setFields([...fields, { key: '', value: '' }]);
  };

  // Remove field row
  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  // Update field row
  const handleFieldChange = (index: number, key: string, value: string) => {
    const updated = [...fields];
    updated[index] = { key, value };
    setFields(updated);
  };

  // Create new job
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl) return;

    setIsSubmitting(true);
    try {
      const fieldsMap: Record<string, string> = {};
      fields.forEach((f) => {
        if (f.key.trim()) {
          fieldsMap[f.key.trim()] = f.value;
        }
      });

      const newJob = await createJob({
        title: jobTitle,
        type: 'FORM_FILLER',
        targetUrl,
        payload: {
          instructions,
          fields: fieldsMap,
        },
      });

      setJobs([newJob, ...jobs]);
      setSelectedJobId(newJob.id);

      // Auto run job for instant demonstration
      await runJob(newJob.id);
    } catch (err: any) {
      alert(`Could not dispatch job: ${err.message}. Make sure backend is running on port 5001.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Run selected job
  const handleRunJob = async (id: string) => {
    setActionLoading(true);
    try {
      await runJob(id);
      const updated = await fetchJobs();
      setJobs(updated);
    } catch (err: any) {
      alert(`Error running agent: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="container">
      {/* Top Navbar */}
      <nav className="navbar">
        <div className="brand">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <div>
            <span className="brand-title">AnyTask.AI</span>
            <span className="brand-badge">Agent Core v1.0</span>
          </div>
        </div>

        <div className="nav-status">
          <div className="status-pill">
            <span className={`status-dot ${backendStatus.online ? '' : 'offline'}`} />
            <span>Backend Express: <strong>{backendStatus.online ? 'Port 5001 Online' : 'Connecting...'}</strong></span>
          </div>
          <div className="status-pill">
            <span className="status-dot" />
            <span>Database: <strong>PostgreSQL / Prisma</strong></span>
          </div>
        </div>
      </nav>

      {/* Hero Header */}
      <section className="hero-banner">
        <h1>Autonomous <span>Browser Task & Form Filling</span> Agent</h1>
        <p>
          Configure target URLs, specify form input values, and let the autonomous agent inspect the DOM, map parameters, and complete form submissions.
        </p>
      </section>

      {/* Main Grid: Left = Creator, Right = Agent Runner & Terminal */}
      <div className="dashboard-grid">
        {/* Left Column: Form & Job Dispatcher */}
        <div className="glass-card">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-icon">⚡</span>
              <span>1. Configure Browser Job</span>
            </div>
          </div>

          <label className="form-label">Quick Presets</label>
          <div className="preset-chips">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="chip"
                onClick={() => handleApplyPreset(p)}
              >
                {p.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreateJob}>
            <div className="form-group">
              <label className="form-label" htmlFor="job-title-input">Job Title</label>
              <input
                id="job-title-input"
                className="form-input"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Fill Candidate Form"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="target-url-input">Target Browser Link (URL)</label>
              <input
                id="target-url-input"
                className="form-input"
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/form"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="agent-instructions-input">Natural Language Agent Instructions</label>
              <textarea
                id="agent-instructions-input"
                className="form-textarea"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Go to the sign up page and sign up as a USER (not vendor). Fill the registration form with my details below."
              />
            </div>

            {/* Fields Builder */}
            <div className="fields-builder">
              <div className="fields-builder-header">
                <div>
                  <span className="form-label" style={{ margin: 0 }}>Form Fields to Auto-Fill</span>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Optional. A <strong style={{ color: '#a5b4fc' }}>unique test account</strong> (name, email, password, phone) is generated every run; values you add here override it.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button type="button" className="btn-add" onClick={handleAddField}>
                    + Add Field
                  </button>
                </div>
              </div>

              {fields.map((field, idx) => (
                <div key={idx} className="field-row">
                  <input
                    className="form-input"
                    placeholder="Field name / selector"
                    value={field.key}
                    onChange={(e) => handleFieldChange(idx, e.target.value, field.value)}
                  />
                  <input
                    className="form-input"
                    placeholder="Value to input"
                    value={field.value}
                    onChange={(e) => handleFieldChange(idx, field.key, e.target.value)}
                  />
                  {fields.length > 0 && (
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => handleRemoveField(idx)}
                      title="Remove field"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              id="submit-job-btn"
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !backendStatus.online}
            >
              {isSubmitting ? 'Enqueuing Job...' : '🚀 Dispatch & Run Agent Job'}
            </button>
            {!backendStatus.online && (
              <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.5rem', textAlign: 'center' }}>
                Note: Start the backend server (`cd backend && npm run dev`) to execute jobs.
              </p>
            )}
          </form>
        </div>

        {/* Right Column: Active Jobs & Live Execution Terminal */}
        <div className="glass-card">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-icon">🤖</span>
              <span>2. Agent Queue & Execution Monitor</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {jobs.length} Job{jobs.length === 1 ? '' : 's'}
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>No Agent Jobs Created Yet</h3>
              <p>Configure a form target on the left or select a preset to dispatch your first automated job.</p>
            </div>
          ) : (
            <>
              {/* Jobs horizontal / card selector */}
              <div className="jobs-list">
                {jobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id;
                  const isFailed = job.status === 'FAILED' || Boolean(job.result && job.result.failedJourneys > 0 && job.result.passedJourneys === 0);
                  const statusLabel = isFailed
                    ? 'FAILED'
                    : job.status === 'AWAITING_CREDENTIALS'
                    ? '🔒 AUTH REQ'
                    : job.status === 'AWAITING_ACTION_APPROVAL'
                    ? '🛡️ APPROVAL REQ'
                    : job.status === 'RUNNING'
                    ? '⚡ RUNNING'
                    : job.status;

                  const badgeStyle = isFailed
                    ? { background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.5)' }
                    : job.status === 'AWAITING_CREDENTIALS'
                    ? { background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.5)' }
                    : job.status === 'AWAITING_ACTION_APPROVAL'
                    ? { background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.5)' }
                    : job.status === 'RUNNING'
                    ? { background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.5)' }
                    : { background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.5)' };

                  return (
                    <div
                      key={job.id}
                      className={`job-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <div className="job-card-top">
                        <span className="job-card-title">{job.title}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          <span className="badge-status" style={badgeStyle}>{statusLabel}</span>
                          {(job.status === 'COMPLETED' || job.status === 'FAILED' || job.result) && (
                            <Link
                              href={`/report?jobId=${job.id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '0.2rem 0.6rem',
                                borderRadius: '999px',
                                background: 'rgba(99,102,241,0.15)',
                                color: '#a5b4fc',
                                border: '1px solid rgba(99,102,241,0.3)',
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s',
                              }}
                            >
                              📊 View Report
                            </Link>
                          )}
                        </div>
                      </div>
                      <span className="job-card-url">🔗 {job.targetUrl}</span>
                    </div>
                  );
                })}
              </div>

              {/* Selected Job Execution Details & Logs */}
              {selectedJob && (() => {
                const pipeline = getPipelineStatus(selectedJob);

                return (
                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ fontSize: '0.95rem' }}>Live Agent Telemetry</h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>ID: {selectedJob.id}</p>
                      </div>
                      {selectedJob.status !== 'RUNNING' && (
                        <button
                          className="btn-secondary"
                          onClick={() => handleRunJob(selectedJob.id)}
                          disabled={actionLoading}
                        >
                          {actionLoading ? 'Triggering...' : '▶ Re-run Agent'}
                        </button>
                      )}
                    </div>

                    {/* Live Pipeline Stepper & Current Action HUD */}
                    <div style={{
                      margin: '1rem 0 1.25rem 0',
                      padding: '1.25rem',
                      borderRadius: '12px',
                      background: '#101524',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    }}>
                      {/* Stepper Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>
                            {selectedJob.status === 'RUNNING' ? '⚡' : selectedJob.status === 'COMPLETED' ? '✅' : pipeline.hasFailed ? '❌' : '⏳'}
                          </span>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                            Pipeline Stage:{' '}
                            <span style={{
                              color: selectedJob.status === 'RUNNING'
                                ? '#60a5fa'
                                : pipeline.hasFailed
                                ? '#f87171'
                                : selectedJob.status === 'COMPLETED'
                                ? '#34d399'
                                : '#facc15',
                            }}>
                              {selectedJob.status === 'RUNNING'
                                ? `RUNNING (${pipeline.currentPhase})`
                                : pipeline.hasFailed
                                ? 'FAILED (GOAL NOT SATISFIED)'
                                : selectedJob.status.replace(/_/g, ' ')}
                            </span>
                          </h4>
                        </div>

                        {/* Live Step Stats Pill */}
                        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                          <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            ✓ {pipeline.passedSteps} Passed
                          </span>
                          {pipeline.failedSteps > 0 && (
                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                              ✗ {pipeline.failedSteps} Failed
                            </span>
                          )}
                          <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            Total: {pipeline.totalSteps}
                          </span>
                        </div>
                      </div>

                      {/* Horizontal Pipeline Steps */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '0.5rem',
                        marginBottom: '1rem',
                      }}>
                        {[
                          { id: 'DISCOVERY', icon: '🔍', label: '1. Discovery' },
                          { id: 'PLANNING', icon: '🗺️', label: '2. Planning' },
                          { id: 'EXECUTION', icon: '⚡', label: '3. Execution' },
                          { id: 'COMPLETED', icon: '📊', label: '4. Summary' },
                        ].map((stage, idx) => {
                          const isCurrent = pipeline.currentPhase === stage.id;
                          const phaseOrder = ['DISCOVERY', 'PLANNING', 'EXECUTION', 'COMPLETED'];
                          const isPast = phaseOrder.indexOf(pipeline.currentPhase) > idx;

                          return (
                            <div
                              key={stage.id}
                              style={{
                                padding: '0.6rem 0.5rem',
                                borderRadius: '8px',
                                textAlign: 'center',
                                background: isCurrent ? 'rgba(99, 102, 241, 0.2)' : isPast ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                                border: isCurrent ? '1px solid #6366f1' : isPast ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                                color: isCurrent ? '#c7d2fe' : isPast ? '#34d399' : '#64748b',
                                fontSize: '0.75rem',
                                fontWeight: isCurrent ? 700 : 500,
                              }}
                            >
                              <div style={{ fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                                {isPast ? '✓' : stage.icon}
                              </div>
                              {stage.label}
                            </div>
                          );
                        })}
                      </div>

                      {/* Current Active Action Display */}
                      <div style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        background: '#0a0d16',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}>
                        <div style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: selectedJob.status === 'RUNNING'
                            ? '#60a5fa'
                            : pipeline.hasFailed
                            ? '#f87171'
                            : selectedJob.status === 'COMPLETED'
                            ? '#34d399'
                            : '#facc15',
                          flexShrink: 0,
                          boxShadow: selectedJob.status === 'RUNNING' ? '0 0 10px #60a5fa' : 'none',
                        }} />
                        <div style={{ overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                            Latest Agent Activity / Action
                          </span>
                          <span style={{ fontSize: '0.85rem', color: '#f1f5f9', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'block' }}>
                            {pipeline.activeAction}
                          </span>
                        </div>
                      </div>
                    </div>

                  {selectedJob.testIdentity && (
                    <div style={{
                      margin: '0 0 1rem 0',
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.35rem 1.25rem',
                    }}>
                      <span style={{ color: '#a5b4fc', fontWeight: 700 }}>🪪 Test account for this run</span>
                      <span>Email: <code>{selectedJob.testIdentity.email}</code></span>
                      <span>Password: <code>{selectedJob.testIdentity.password}</code></span>
                      <span>Username: <code>{selectedJob.testIdentity.username}</code></span>
                    </div>
                  )}

                  {/* HITL Credential Gate Card */}
                  {selectedJob.status === 'AWAITING_CREDENTIALS' && (
                    <div style={{
                      margin: '1rem 0',
                      padding: '1.25rem',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(202, 138, 4, 0.08) 100%)',
                      border: '1px solid rgba(234, 179, 8, 0.5)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '1.35rem' }}>🔒</span>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#facc15', fontWeight: 700 }}>
                          Website Authentication Required
                        </h3>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: '0 0 0.85rem 0', lineHeight: 1.4 }}>
                        The target site prompted for login credentials at:{' '}
                        <code style={{ color: '#93c5fd', wordBreak: 'break-all' }}>
                          {selectedJob.pendingCredentials?.loginUrl || selectedJob.targetUrl}
                        </code>
                        <br />
                        Provide your login credentials to sign in, choose to register a new account, or skip authentication.
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem', fontWeight: 600 }}>
                            Username / Email
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. user@example.com"
                            value={authUsername}
                            onChange={(e) => setAuthUsername(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.6rem 0.75rem',
                              borderRadius: '8px',
                              background: '#090d16',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#fff',
                              fontSize: '0.85rem',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem', fontWeight: 600 }}>
                            Password
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.6rem 0.75rem',
                              borderRadius: '8px',
                              background: '#090d16',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#fff',
                              fontSize: '0.85rem',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={authSubmitting || !authUsername || !authPassword}
                          onClick={() => handleCredentialSubmit('PROVIDE_CREDENTIALS')}
                          style={{
                            padding: '0.6rem 1.1rem',
                            borderRadius: '8px',
                            background: '#eab308',
                            color: '#000',
                            fontWeight: 700,
                            border: 'none',
                            cursor: authSubmitting || !authUsername || !authPassword ? 'not-allowed' : 'pointer',
                            opacity: authSubmitting || !authUsername || !authPassword ? 0.6 : 1,
                            fontSize: '0.85rem',
                          }}
                        >
                          🔑 Submit Credentials & Log In
                        </button>

                        <button
                          type="button"
                          disabled={authSubmitting}
                          onClick={() => handleCredentialSubmit('REGISTER_NEW')}
                          style={{
                            padding: '0.6rem 1.1rem',
                            borderRadius: '8px',
                            background: 'rgba(99, 102, 241, 0.25)',
                            color: '#c7d2fe',
                            border: '1px solid rgba(99, 102, 241, 0.5)',
                            fontWeight: 600,
                            cursor: authSubmitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          📝 Register New Account Instead
                        </button>

                        <button
                          type="button"
                          disabled={authSubmitting}
                          onClick={() => handleCredentialSubmit('SKIP')}
                          style={{
                            padding: '0.6rem 0.9rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#94a3b8',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            cursor: authSubmitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          ⏭️ Skip Authentication
                        </button>
                      </div>
                    </div>
                  )}

                  {/* HITL Gate 2: Destructive Action Intercepted Card */}
                  {selectedJob.status === 'AWAITING_ACTION_APPROVAL' && (
                    <div style={{
                      margin: '1rem 0',
                      padding: '1.25rem',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(185, 28, 28, 0.08) 100%)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '1.35rem' }}>🛡️</span>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f87171', fontWeight: 700 }}>
                          HITL Gate 2: Destructive Action Intercepted
                        </h3>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: '0 0 0.85rem 0', lineHeight: 1.4 }}>
                        The agent paused before executing an irreversible action:
                        <br />
                        <strong>Step {selectedJob.pendingAction?.stepNumber}:</strong> [{selectedJob.pendingAction?.action}] {selectedJob.pendingAction?.description}
                        <br />
                        <span style={{ color: '#fca5a5' }}>Reason: {selectedJob.pendingAction?.reason}</span>
                      </p>

                      <div style={{ display: 'flex', gap: '0.6rem' }}>
                        <button
                          type="button"
                          disabled={authSubmitting}
                          onClick={() => handleActionApproval(true)}
                          style={{
                            padding: '0.6rem 1.1rem',
                            borderRadius: '8px',
                            background: '#ef4444',
                            color: '#fff',
                            fontWeight: 700,
                            border: 'none',
                            cursor: authSubmitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          ✓ Approve & Proceed
                        </button>

                        <button
                          type="button"
                          disabled={authSubmitting}
                          onClick={() => handleActionApproval(false)}
                          style={{
                            padding: '0.6rem 1.1rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#94a3b8',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            cursor: authSubmitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          ✕ Reject & Skip Step
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Terminal Log Console */}
                  <div className="terminal-viewer">
                    <div className="terminal-header">
                      <div className="terminal-dots">
                        <span className="terminal-dot red" />
                        <span className="terminal-dot yellow" />
                        <span className="terminal-dot green" />
                      </div>
                      <span className="terminal-title">agent-session-log.log</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>
                        {selectedJob.logs?.length || 0} events
                      </span>
                    </div>

                    <div className="terminal-body">
                      {selectedJob.logs && selectedJob.logs.length > 0 ? (
                        selectedJob.logs.map((log: JobLogItem) => (
                          <div key={log.id} className="log-entry">
                            <span className="log-time">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </span>
                            <span className="log-step">[{log.step}]</span>
                            <span className={`log-msg ${log.level}`}>{log.message}</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>
                          Job is queued. Click "Run Agent" to stream step-by-step telemetry.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Execution Results View */}
                  {selectedJob.result && (
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', color: '#34d399', fontWeight: 600, fontSize: '0.85rem' }}>
                        <span>✓ Execution Summary</span>
                      </div>
                      <pre style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        overflowX: 'auto',
                      }}>
                        {JSON.stringify(selectedJob.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })()}
            </>
          )}
        </div>
      </div>

      {/* Architecture & OpenAI Agent SDK Section */}
      <section className="architecture-section">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Learning Architecture: How It Works</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Your project is organized into two isolated environments ready for local experimentation.
        </p>

        <div className="arch-cards-grid">
          <div className="arch-card">
            <span className="arch-step-num">FOLDER 1</span>
            <h3>Frontend (Next.js & TypeScript)</h3>
            <p>
              Provides the UI dashboard, input controls for target URLs and form payloads, and real-time polling of agent execution steps.
            </p>
          </div>

          <div className="arch-card">
            <span className="arch-step-num">FOLDER 2</span>
            <h3>Backend (Express & TypeScript)</h3>
            <p>
              Provides the REST API endpoints (<code style={{ color: '#818cf8' }}>/api/jobs</code>), the job queue runner, and execution lifecycle manager in <code style={{ color: '#818cf8' }}>src/services/jobService.ts</code>.
            </p>
          </div>

          <div className="arch-card">
            <span className="arch-step-num">STEP 3</span>
            <h3>Next: OpenAI Agent SDK & Browser</h3>
            <p>
              Plug in the OpenAI Agent SDK and Playwright into <code style={{ color: '#818cf8' }}>backend/src/services/jobService.ts</code> to control actual headless Chromium browsers.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
