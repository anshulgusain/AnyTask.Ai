'use client';

import { useState, useEffect } from 'react';
import { fetchJobs, createJob, runJob, checkBackendHealth, JobItem, JobLogItem } from '@/lib/api';

interface FieldPair {
  key: string;
  value: string;
}

const PRESETS = [
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
                placeholder="Instructions for OpenAI Agent SDK on how to handle the page..."
              />
            </div>

            {/* Fields Builder */}
            <div className="fields-builder">
              <div className="fields-builder-header">
                <span className="form-label" style={{ margin: 0 }}>Form Fields to Auto-Fill</span>
                <button type="button" className="btn-add" onClick={handleAddField}>
                  + Add Field
                </button>
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
                  {fields.length > 1 && (
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
                  const statusClass = `badge-${job.status.toLowerCase()}`;
                  return (
                    <div
                      key={job.id}
                      className={`job-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <div className="job-card-top">
                        <span className="job-card-title">{job.title}</span>
                        <span className={`badge-status ${statusClass}`}>{job.status}</span>
                      </div>
                      <span className="job-card-url">🔗 {job.targetUrl}</span>
                    </div>
                  );
                })}
              </div>

              {/* Selected Job Execution Details & Logs */}
              {selectedJob && (
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
              )}
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
