const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
const API_KEY_STORAGE = 'anytask.apiKey';

// ─── API key (only needed when the backend sets ANYTASK_API_KEY) ────────────

export function getApiKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(API_KEY_STORAGE) ?? '';
}

export function setApiKey(key: string): void {
  if (key) window.localStorage.setItem(API_KEY_STORAGE, key);
  else window.localStorage.removeItem(API_KEY_STORAGE);
}

/** For <img> and EventSource, which can't send headers: the key goes in the query string. */
function withKey(url: string): string {
  const key = getApiKey();
  return key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url;
}

export class AuthError extends Error {
  constructor() {
    super('This backend needs an access key.');
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = getApiKey();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) throw new AuthError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body.data as T;
}

export function screenshotUrl(screenshotPath: string): string {
  return withKey(`${API_BASE_URL}/screenshots/${screenshotPath.split('/').pop()}`);
}

export function jobEventsUrl(id: string): string {
  return withKey(`${API_BASE_URL}/jobs/${id}/events`);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JobLogItem {
  id: string;
  jobId: string;
  step: string;
  message: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PendingActionApproval {
  stepNumber: number;
  journeyId: string;
  action: string;
  selector?: string;
  value?: string;
  description: string;
  reason: string;
  screenshotPath?: string;
  timestamp: string;
}

export interface PendingFieldRequest {
  stepNumber: number;
  journeyId: string;
  fieldLabel: string;
  fieldSelector: string;
  fieldType: string;
  description: string;
  pageUrl: string;
  timestamp: string;
}

export interface TestIdentity {
  firstName: string;
  lastName: string;
  fullName: string;
  username: string;
  email: string;
  password: string;
  phone: string;
  phoneIsReal?: boolean;
  createdAt: string;
}

export interface JobItem {
  id: string;
  title: string;
  type: 'FORM_FILLER' | 'WEB_SCRAPER' | 'CUSTOM_AGENT' | 'AUTONOMOUS_QA';
  status:
    | 'PENDING'
    | 'DISCOVERING'
    | 'PLANNING'
    | 'AWAITING_PLAN_APPROVAL'
    | 'RUNNING'
    | 'AWAITING_ACTION_APPROVAL'
    | 'AWAITING_CREDENTIALS'
    | 'AWAITING_FIELD_INPUT'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED';
  targetUrl: string;
  payload?: {
    instructions?: string;
    fields?: Record<string, string>;
    headless?: boolean;
  };
  pendingAction?: PendingActionApproval;
  pendingFieldInput?: PendingFieldRequest;
  testIdentity?: TestIdentity;
  result?: Record<string, unknown>;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: JobLogItem[];
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export interface BackendHealth {
  online: boolean;
  authRequired: boolean;
  /** False on servers without a display (e.g. Render), where a visible browser can't open. */
  canShowBrowser: boolean;
}

export async function checkBackendHealth(): Promise<BackendHealth> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
    if (!res.ok) return { online: false, authRequired: false, canShowBrowser: false };
    const body = await res.json();
    return { online: true, authRequired: Boolean(body.authRequired), canShowBrowser: Boolean(body.canShowBrowser) };
  } catch {
    return { online: false, authRequired: false, canShowBrowser: false };
  }
}

export const fetchJobs = () => api<JobItem[]>('/jobs').then((jobs) => jobs ?? []);

export const fetchJobById = (id: string) => api<JobItem | null>(`/jobs/${id}`);

export const createJob = (jobData: {
  title?: string;
  type?: JobItem['type'];
  targetUrl: string;
  payload?: { instructions?: string; fields?: Record<string, string>; headless?: boolean };
}) => api<JobItem>('/jobs', { method: 'POST', body: JSON.stringify(jobData) });

export const runJob = (id: string) => api<void>(`/jobs/${id}/run`, { method: 'POST' });

export const cancelJob = (id: string) => api<void>(`/jobs/${id}/cancel`, { method: 'POST' });

export const approveJobAction = (id: string, approved: boolean, notes?: string) =>
  api<JobItem>(`/jobs/${id}/approve-action`, { method: 'POST', body: JSON.stringify({ approved, notes }) });

export const submitJobFieldInput = (id: string, value: string) =>
  api<JobItem>(`/jobs/${id}/submit-field-input`, { method: 'POST', body: JSON.stringify({ value }) });

/** Extra guidance for the agent while it runs ("the admin panel is at /admin"). */
export const sendJobNote = (id: string, note: string) =>
  api<void>(`/jobs/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) });
