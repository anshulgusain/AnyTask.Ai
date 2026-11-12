'use client';

import { useState } from 'react';

export interface RunFormValues {
  targetUrl: string;
  instructions: string;
  fields: Record<string, string>;
  showBrowser: boolean;
}

const SAMPLES = [
  {
    label: 'Go-Trade',
    url: 'https://go-trade-web.onrender.com/',
    instructions:
      'Seller onboarding portal for a marketplace. Register a new seller account, then check the pricing and documentation pages. Do not submit the contact form.',
  },
  {
    label: 'Demo form',
    url: 'http://localhost:3000/demo-form',
    instructions: 'A contact form. Fill it in with realistic data and submit it, then confirm the success message.',
  },
  {
    label: 'HTTPBin form',
    url: 'https://httpbin.org/forms/post',
    instructions: 'A pizza order form. Fill in the customer details, pick a size and toppings, and submit.',
  },
];

interface Props {
  disabled: boolean;
  /** Only a backend with a display (your own machine) can open a visible browser. */
  canShowBrowser: boolean;
  onSubmit: (values: RunFormValues) => Promise<void>;
}

export default function RunForm({ disabled, canShowBrowser, onSubmit }: Props) {
  const [targetUrl, setTargetUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [rows, setRows] = useState<{ key: string; value: string }[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fields = Object.fromEntries(rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]));
      await onSubmit({ targetUrl: targetUrl.trim(), instructions: instructions.trim(), fields, showBrowser });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the run.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateRow = (i: number, patch: Partial<{ key: string; value: string }>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <form onSubmit={submit} style={{ padding: '20px 20px 18px' }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>New test run</div>

      <div className="field">
        <label className="label" htmlFor="target-url">Site URL</label>
        <input
          id="target-url"
          className="input mono"
          type="url"
          required
          placeholder="https://your-app.onrender.com"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="instructions">What should we test?</label>
        <textarea
          id="instructions"
          className="textarea"
          placeholder={'What the app does and which flows matter.\ne.g. "Recipe sharing site. Sign up, post a recipe with a photo, then search for it."'}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <span className="hint">Leave it empty and the agent picks the main flows from your home page.</span>
      </div>

      <details className="disclosure" style={{ marginBottom: 14 }}>
        <summary>Test data{rows.length > 0 ? ` (${rows.length})` : ''}</summary>
        <p className="hint" style={{ margin: '4px 0 6px' }}>
          A fresh account (name, email, password, phone) is generated for every run. Add values here only when the
          agent must use something specific, like an invite code or an existing login.
        </p>
        {rows.map((row, i) => (
          <div className="kv-row" key={i}>
            <input
              className="input"
              placeholder="field, e.g. inviteCode"
              value={row.key}
              onChange={(e) => updateRow(i, { key: e.target.value })}
            />
            <input
              className="input"
              placeholder="value"
              value={row.value}
              onChange={(e) => updateRow(i, { value: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Remove field"
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="link-button" style={{ marginTop: 8 }} onClick={() => setRows([...rows, { key: '', value: '' }])}>
          + Add value
        </button>
      </details>

      {canShowBrowser ? (
        <label className="checkbox-row" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={showBrowser} onChange={(e) => setShowBrowser(e.target.checked)} />
          <span>Show the browser window on the server machine</span>
        </label>
      ) : (
        <div style={{ marginBottom: 4 }} />
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={disabled || submitting || !targetUrl.trim()}>
        {submitting ? 'Starting…' : 'Start test run'}
      </button>
      {error && <p className="hint" style={{ color: 'var(--fail)', marginTop: 8 }}>{error}</p>}

      <p className="hint" style={{ marginTop: 12 }}>
        Try a sample:{' '}
        {SAMPLES.map((s, i) => (
          <span key={s.label}>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setTargetUrl(s.url);
                setInstructions(s.instructions);
              }}
            >
              {s.label}
            </button>
            {i < SAMPLES.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </p>
    </form>
  );
}
