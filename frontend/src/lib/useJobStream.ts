'use client';

import { useEffect, useState } from 'react';
import { jobEventsUrl, type JobItem, type JobLogItem } from './api';

/**
 * Live view of one job over Server-Sent Events: a full snapshot on connect, then
 * appended log lines and job-state updates. EventSource reconnects on its own and
 * gets a fresh snapshot each time, so a dropped connection self-heals.
 */
export function useJobStream(jobId: string | null): { job: JobItem | null; connected: boolean } {
  const [job, setJob] = useState<JobItem | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    const source = new EventSource(jobEventsUrl(jobId));

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.addEventListener('snapshot', (e) => setJob(JSON.parse((e as MessageEvent).data)));

    source.addEventListener('log', (e) => {
      const log: JobLogItem = JSON.parse((e as MessageEvent).data);
      setJob((prev) => {
        if (!prev || prev.id !== log.jobId || prev.logs?.some((l) => l.id === log.id)) return prev;
        return { ...prev, logs: [...(prev.logs ?? []), log] };
      });
    });

    source.addEventListener('job', (e) => {
      const next: JobItem = JSON.parse((e as MessageEvent).data);
      setJob((prev) => (prev && prev.id === next.id ? { ...next, logs: prev.logs } : prev));
    });

    return () => source.close();
  }, [jobId]);

  return { job: job && job.id === jobId ? job : null, connected };
}
