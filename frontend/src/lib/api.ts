const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

export interface JobLogItem {
  id: string;
  jobId: string;
  step: string;
  message: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface JobItem {
  id: string;
  title: string;
  type: 'FORM_FILLER' | 'WEB_SCRAPER' | 'CUSTOM_AGENT';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  targetUrl: string;
  payload?: {
    instructions?: string;
    fields?: Record<string, string>;
    headless?: boolean;
  };
  result?: Record<string, any>;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: JobLogItem[];
}

export async function fetchJobs(): Promise<JobItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/jobs`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch jobs');
    const data = await res.json();
    return data.data || [];
  } catch (error) {
    console.error('fetchJobs error:', error);
    return [];
  }
}

export async function fetchJobById(id: string): Promise<JobItem | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/jobs/${id}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch job ${id}`);
    const data = await res.json();
    return data.data || null;
  } catch (error) {
    console.error(`fetchJobById ${id} error:`, error);
    return null;
  }
}

export async function createJob(jobData: {
  title?: string;
  type?: 'FORM_FILLER' | 'WEB_SCRAPER' | 'CUSTOM_AGENT';
  targetUrl: string;
  payload?: {
    instructions?: string;
    fields?: Record<string, string>;
  };
}): Promise<JobItem> {
  const res = await fetch(`${API_BASE_URL}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jobData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create job');
  }
  const data = await res.json();
  return data.data;
}

export async function runJob(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/jobs/${id}/run`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to run job');
  }
}

export async function checkBackendHealth(): Promise<{ online: boolean; message: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
    if (res.ok) {
      return { online: true, message: 'Connected' };
    }
    return { online: false, message: 'Unreachable' };
  } catch {
    return { online: false, message: 'Offline' };
  }
}
