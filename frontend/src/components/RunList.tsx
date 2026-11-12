'use client';

import type { JobItem } from '@/lib/api';
import { hostOf, runVerdict, timeAgo } from '@/lib/report';
import { StatusPill } from './Status';

interface Props {
  jobs: JobItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function RunList({ jobs, selectedId, onSelect }: Props) {
  return (
    <div className="run-list">
      <div className="run-list-head">
        <span className="eyebrow">Recent runs</span>
        <span className="faint" style={{ fontSize: 12 }}>{jobs.length}</span>
      </div>
      {jobs.length === 0 ? (
        <p className="hint" style={{ padding: '6px 20px 20px' }}>Runs you start show up here.</p>
      ) : (
        jobs.map((job) => {
          const verdict = runVerdict(job);
          const goal = job.payload?.instructions?.split(/[.\n]/)[0]?.trim();
          return (
            <button
              key={job.id}
              type="button"
              className={`run-row ${job.id === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(job.id)}
            >
              <span className="run-row-host">{hostOf(job.targetUrl)}</span>
              <StatusPill label={verdict.label} tone={verdict.tone} />
              <span className="run-row-meta">
                {timeAgo(job.createdAt)}
                {goal ? ` · ${goal}` : ''}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
