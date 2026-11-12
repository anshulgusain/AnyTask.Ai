'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  approveJobAction,
  AuthError,
  cancelJob,
  checkBackendHealth,
  createJob,
  fetchJobs,
  getApiKey,
  runJob,
  sendJobNote,
  setApiKey,
  submitJobFieldInput,
  type JobItem,
} from '@/lib/api';
import { hostOf } from '@/lib/report';
import { useJobStream } from '@/lib/useJobStream';
import RunForm, { type RunFormValues } from '@/components/RunForm';
import RunList from '@/components/RunList';
import RunDetail, { type RunActions } from '@/components/RunDetail';
import TopBar from '@/components/TopBar';

const LIST_POLL_MS = 5000;

export default function DashboardPage() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [canShowBrowser, setCanShowBrowser] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { job: selected } = useJobStream(needsKey ? null : selectedId);

  const refreshList = useCallback(async () => {
    const health = await checkBackendHealth();
    setOnline(health.online);
    setCanShowBrowser(health.canShowBrowser);
    if (!health.online) return;
    if (health.authRequired && !getApiKey()) {
      setNeedsKey(true);
      return;
    }
    try {
      const list = await fetchJobs();
      setNeedsKey(false);
      setJobs(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (err) {
      if (err instanceof AuthError) setNeedsKey(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refreshList, 0);
    const interval = setInterval(refreshList, LIST_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [refreshList]);

  const startRun = async (values: RunFormValues) => {
    const job = await createJob({
      title: hostOf(values.targetUrl),
      type: 'AUTONOMOUS_QA',
      targetUrl: values.targetUrl,
      payload: {
        instructions: values.instructions || undefined,
        fields: values.fields,
        ...(values.showBrowser && canShowBrowser ? { headless: false } : {}),
      },
    });
    await runJob(job.id);
    setSelectedId(job.id);
    await refreshList();
  };

  // The run view updates itself over SSE; only the list needs a nudge after an action.
  const act = (fn: (id: string) => Promise<unknown>) => async () => {
    if (!selectedId) return;
    await fn(selectedId);
    await refreshList();
  };

  const actions: RunActions = {
    onRerun: act((id) => runJob(id)),
    onCancel: act((id) => cancelJob(id)),
    onAnswer: (value) => act((id) => submitJobFieldInput(id, value))(),
    onApprove: (approved) => act((id) => approveJobAction(id, approved))(),
    onNote: (note) => act((id) => sendJobNote(id, note))(),
  };

  // The streamed run is fresher than the polled list, so prefer its status there too.
  const listJobs = selected
    ? jobs.map((j) => (j.id === selected.id ? { ...j, status: selected.status, result: selected.result } : j))
    : jobs;

  return (
    <>
      <TopBar>
        <span className="api-status">
          <span
            className="dot"
            style={{ color: online === null ? 'var(--line-strong)' : online ? 'var(--pass)' : 'var(--fail)' }}
          />
          {online === null ? 'Connecting to API…' : online ? 'API connected' : 'API offline'}
        </span>
      </TopBar>

      {needsKey ? (
        <KeyGate />
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <RunForm disabled={online === false} canShowBrowser={canShowBrowser} onSubmit={startRun} />
            {online === false && (
              <p className="hint" style={{ padding: '0 20px 14px', color: 'var(--fail)' }}>
                Can&apos;t reach the backend. Start it with <code>cd backend &amp;&amp; npm run dev</code>.
              </p>
            )}
            <RunList jobs={listJobs} selectedId={selectedId} onSelect={setSelectedId} />
          </aside>

          <main className="main">
            {selected ? (
              <RunDetail job={selected} actions={actions} />
            ) : selectedId ? (
              <p className="hint">Loading run…</p>
            ) : (
              <Intro />
            )}
          </main>
        </div>
      )}
    </>
  );
}

function KeyGate() {
  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: '0 20px' }}>
      <h1 className="page-title" style={{ marginBottom: 6 }}>Access key required</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        This backend is protected. Enter the value of <code>ANYTASK_API_KEY</code> from the server&apos;s environment.
        It&apos;s stored in this browser only.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(new FormData(e.currentTarget).get('apiKey') ?? '').trim();
          if (!value) return;
          setApiKey(value);
          window.location.reload();
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          className="input mono"
          name="apiKey"
          type="password"
          autoFocus
          placeholder="Access key"
          required
        />
        <button className="btn btn-primary" type="submit">Continue</button>
      </form>
    </div>
  );
}

function Intro() {
  return (
    <div style={{ maxWidth: 560, paddingTop: 40 }}>
      <h1 className="page-title" style={{ marginBottom: 10 }}>Test your app the way a user would</h1>
      <p className="muted" style={{ lineHeight: 1.6 }}>
        Paste the URL of a deployed app and say what it does. The agent reads the site, decides what to test, then
        uses it in a real browser: it signs up with a throwaway account, fills in forms, adds things, and checks that
        each flow actually worked.
      </p>
      <p className="muted" style={{ lineHeight: 1.6, marginTop: 10 }}>
        When it needs something only you know, such as an SMS code or an invite link, it pauses and asks you here. At
        the end you get a report of what works, what&apos;s broken, and what it couldn&apos;t reach, with screenshots
        and steps to reproduce.
      </p>
    </div>
  );
}
