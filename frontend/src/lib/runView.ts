import type { JobItem, JobLogItem } from './api';

// Turns the raw agent log stream into the state the run screen renders.

export type Phase = 'warmup' | 'reading' | 'planning' | 'testing' | 'done';

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'warmup', label: 'Wake up site' },
  { id: 'reading', label: 'Read home page' },
  { id: 'planning', label: 'Plan goals' },
  { id: 'testing', label: 'Run goals' },
];

export type LiveGoalState = 'queued' | 'running' | 'PASS' | 'FAIL' | 'BLOCKED' | 'AGENT_ERROR';

export interface LiveGoal {
  id: string;
  title: string;
  state: LiveGoalState;
  steps: number;
  summary?: string;
}

export interface RunView {
  phase: Phase;
  goals: LiveGoal[];
  activity?: string;
  latestScreenshot?: string;
  latestScreenshotAt?: string;
  currentUrl?: string;
}

/** Metadata fields the agent attaches to its log entries (see backend agentLoop / browserAgent). */
interface LogMeta {
  goals?: { id: string; title: string }[];
  journeyId?: string;
  status?: Exclude<LiveGoalState, 'queued' | 'running'>;
  screenshot?: string;
}

const PHASE_BY_STEP: Record<string, Phase> = {
  PHASE_WARMUP: 'warmup',
  WARMUP_DONE: 'warmup',
  WARMUP_BACKEND: 'warmup',
  PHASE_DISCOVERY: 'reading',
  DISCOVERY_DONE: 'reading',
  LINK_CHECK: 'reading',
  PHASE_PLANNING: 'planning',
  PLANNER_SUCCESS: 'planning',
  PHASE_EXECUTION: 'testing',
  JOURNEY_START: 'testing',
  PIPELINE_COMPLETE: 'done',
};

export function buildRunView(job: JobItem): RunView {
  const logs: JobLogItem[] = job.logs ?? [];
  const view: RunView = { phase: 'warmup', goals: [] };
  const byId = new Map<string, LiveGoal>();

  for (const log of logs) {
    const phase = PHASE_BY_STEP[log.step];
    if (phase) view.phase = phase;
    const meta = (log.metadata ?? {}) as LogMeta;

    if (log.step === 'PLANNER_SUCCESS' && Array.isArray(meta.goals)) {
      view.goals = meta.goals.map((g) => ({ id: g.id, title: g.title, state: 'queued' as const, steps: 0 }));
      view.goals.forEach((g) => byId.set(g.id, g));
    }

    const goal = meta.journeyId ? byId.get(meta.journeyId) : undefined;
    if (log.step === 'JOURNEY_START' && goal) goal.state = 'running';
    if ((log.step === 'STEP_PASS' || log.step === 'STEP_FAIL') && goal) goal.steps++;
    if ((log.step === 'JOURNEY_PASS' || log.step === 'JOURNEY_FAIL') && goal && meta.status) {
      goal.state = meta.status;
      const idx = log.message.indexOf(`→ ${meta.status}: `);
      if (idx >= 0) goal.summary = log.message.slice(idx + meta.status.length + 4);
    }

    if (log.step === 'STEP_DISPATCH') view.activity = log.message.replace(/^Step \d+ \[[A-Z_]+\]: /, '');
    if (log.step === 'ASK_USER' || log.step === 'QUEUED') view.activity = log.message.replace(/^🙋 /, '');
    if (meta.screenshot) {
      view.latestScreenshot = meta.screenshot;
      view.latestScreenshotAt = log.createdAt;
    }
    const urlMatch = log.message.match(/→ now at (\S+)/);
    if (urlMatch) view.currentUrl = urlMatch[1];
  }

  if (!['RUNNING', 'PENDING'].includes(job.status) && !job.status.startsWith('AWAITING_')) {
    view.phase = 'done';
    view.activity = undefined;
  }
  return view;
}

/**
 * Strip decorative emoji prefixes the backend adds to log lines, and the
 * "(placeholder: …)" hints that are only there to help the model pick fields.
 */
export function cleanLogMessage(message: string): string {
  return message
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s✓✗⚠⛔]+/u, '')
    .replace(/ \(placeholder: [^)]*\)/g, '')
    .trim();
}
