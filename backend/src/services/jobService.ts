import { Prisma, type Job as JobRow, type JobLog as JobLogRow } from '@prisma/client';
import { getPrismaClient, isDbConnected } from '../db.js';
import { JobItem, JobLogItem, JobPayload, JobStatus, JobType, LogLevel, PendingFieldRequest, FieldInputSubmission, TestIdentity } from '../types/job.js';
import { runBrowserAgent } from '../ai/browserAgent.js';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/**
 * Per-job change feed for the SSE endpoint. Event name is the job id; payload is
 * { type: 'log', log } for new log lines or { type: 'job' } when job state changed.
 */
export type JobEvent = { type: 'log'; log: JobLogItem } | { type: 'job' };
export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(200);
const emitJob = (jobId: string, event: JobEvent) => jobEvents.emit(jobId, event);

// In-memory fallback repository when PostgreSQL is not yet configured locally
const memoryJobs = new Map<string, JobItem>();
const memoryLogs = new Map<string, JobLogItem[]>();

const MAX_CONCURRENT_RUNS = Math.max(1, Number(process.env.MAX_CONCURRENT_RUNS) || 2);
const runQueue: string[] = [];
const runningJobs = new Set<string>();
const pendingNotes = new Map<string, string[]>();

const ACTIVE_STATUSES: JobStatus[] = [
  'RUNNING',
  'AWAITING_PLAN_APPROVAL',
  'AWAITING_ACTION_APPROVAL',
  'AWAITING_CREDENTIALS',
  'AWAITING_FIELD_INPUT',
];

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function toLogItem(l: JobLogRow): JobLogItem {
  return {
    id: l.id,
    jobId: l.jobId,
    step: l.step,
    message: l.message,
    level: l.level as LogLevel,
    metadata: (l.metadata as Record<string, any>) ?? undefined,
    createdAt: l.createdAt.toISOString(),
  };
}

function toJobItem(row: JobRow, logs: JobLogRow[] = []): JobItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type as JobType,
    status: row.status as JobStatus,
    targetUrl: row.targetUrl,
    payload: (row.payload as any) ?? undefined,
    pendingAction: (row.pendingAction as any) ?? undefined,
    actionApprovalHistory: (row.actionApprovalHistory as any) ?? undefined,
    pendingFieldInput: (row.pendingFieldInput as any) ?? undefined,
    testIdentity: (row.testIdentity as any) ?? undefined,
    result: (row.result as any) ?? undefined,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    logs: logs.map(toLogItem),
  };
}

interface ActionResolver {
  resolve: (res: { approved: boolean; notes?: string }) => void;
  reject: (err: any) => void;
  timeoutId: NodeJS.Timeout;
}
const pendingActionResolvers = new Map<string, ActionResolver>();

// ---------------------------------------------------------------------------
// Field Input Gate resolvers
// ---------------------------------------------------------------------------
interface FieldInputResolver {
  resolve: (res: FieldInputSubmission) => void;
  reject: (err: any) => void;
  timeoutId: NodeJS.Timeout;
}
const pendingFieldInputResolvers = new Map<string, FieldInputResolver>();

export class JobService {
  /**
   * Create a new job
   */
  static async createJob(data: {
    title?: string;
    type?: JobType;
    targetUrl: string;
    payload?: JobPayload;
  }): Promise<JobItem> {
    const jobType = data.type || 'FORM_FILLER';
    const jobTitle = data.title || `Auto-fill Form: ${new URL(data.targetUrl).hostname || data.targetUrl}`;

    if (isDbConnected()) {
      try {
        const prisma = getPrismaClient();
        const created = await prisma.job.create({
          data: {
            title: jobTitle,
            type: jobType,
            status: 'PENDING',
            targetUrl: data.targetUrl,
            payload: (data.payload as any) || {},
          },
        });

        return toJobItem(created);
      } catch (err) {
        console.warn('Fallback to memory store due to DB error:', err);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newJob: JobItem = {
      id,
      title: jobTitle,
      type: jobType,
      status: 'PENDING',
      targetUrl: data.targetUrl,
      payload: data.payload,
      createdAt: now,
      updatedAt: now,
      logs: [],
    };

    memoryJobs.set(id, newJob);
    memoryLogs.set(id, []);

    // Initial system log
    await this.addLog(id, 'INITIAL_QUEUE', `Job enqueued for target: ${data.targetUrl}`, 'INFO');

    return newJob;
  }

  /**
   * List all jobs
   */
  static async listJobs(): Promise<JobItem[]> {
    if (isDbConnected()) {
      try {
        const prisma = getPrismaClient();
        // Logs are fetched per job (GET /jobs/:id); the list stays light for polling.
        const jobs = await prisma.job.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        return jobs.map((j) => toJobItem(j));
      } catch (err) {
        console.warn('Fallback to memory store:', err);
      }
    }

    const all = Array.from(memoryJobs.values());
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return all.slice(0, 50).map((j) => ({ ...j, logs: [] }));
  }

  /**
   * Get single job by ID
   */
  static async getJobById(id: string): Promise<JobItem | null> {
    if (isDbConnected()) {
      try {
        const prisma = getPrismaClient();
        const j = await prisma.job.findUnique({
          where: { id },
          include: {
            logs: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        if (!j) return null;

        return toJobItem(j, j.logs);
      } catch (err) {
        console.warn('Fallback to memory store:', err);
      }
    }

    const job = memoryJobs.get(id);
    if (!job) return null;
    return {
      ...job,
      logs: memoryLogs.get(id) || [],
    };
  }

  /**
   * Persist the mutable lifecycle state of a job (status, plan, HITL pending requests).
   * Must be used instead of touching memoryJobs directly, otherwise the state is
   * invisible whenever PostgreSQL is connected.
   */
  private static async saveJob(job: JobItem): Promise<void> {
    job.updatedAt = new Date().toISOString();

    if (isDbConnected()) {
      try {
        await getPrismaClient().job.update({
          where: { id: job.id },
          data: {
            status: job.status,
            pendingAction: jsonOrNull(job.pendingAction),
            actionApprovalHistory: jsonOrNull(job.actionApprovalHistory),
            pendingFieldInput: jsonOrNull(job.pendingFieldInput),
            testIdentity: jsonOrNull(job.testIdentity),
          },
        });
        emitJob(job.id, { type: 'job' });
        return;
      } catch (err) {
        console.warn('Fallback to memory store for job save:', err);
      }
    }

    const { logs: _logs, ...rest } = job;
    memoryJobs.set(job.id, rest);
    emitJob(job.id, { type: 'job' });
  }

  /**
   * Browsers and in-flight promises don't survive a restart, so any job still marked as
   * running or waiting for the user can never finish: mark those as failed. Jobs that were
   * only waiting in the queue haven't started yet, so they are queued again.
   */
  static async recoverInterruptedJobs(): Promise<{ failed: number; requeued: number }> {
    if (!isDbConnected()) return { failed: 0, requeued: 0 };
    const prisma = getPrismaClient();
    const stuck = await prisma.job.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { id: true },
    });
    for (const { id } of stuck) {
      await this.addLog(id, 'FATAL_ERROR', 'The server restarted while this run was in progress. Start it again to retest.', 'ERROR');
      await this.updateStatus(id, 'FAILED', undefined, 'Interrupted by a server restart');
    }

    const queued = await prisma.job.findMany({
      where: { status: 'PENDING', logs: { some: { step: 'QUEUED' } } },
      orderBy: { updatedAt: 'asc' },
      select: { id: true },
    });
    for (const { id } of queued) {
      await this.executeJob(id).catch((err) => console.warn(`Could not requeue ${id}:`, err.message));
    }
    return { failed: stuck.length, requeued: queued.length };
  }

  /** Queue a note from the developer; the agent picks it up on its next step. */
  static async addNote(jobId: string, note: string): Promise<void> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (!ACTIVE_STATUSES.includes(job.status)) throw new Error('Notes can only be sent while the run is active');
    pendingNotes.set(jobId, [...(pendingNotes.get(jobId) ?? []), note]);
    await this.addLog(jobId, 'USER_NOTE', `Note for the agent: ${note}`, 'INFO');
  }

  /** Returns and clears notes that arrived since the last call. */
  static takeNotes(jobId: string): string[] {
    const notes = pendingNotes.get(jobId) ?? [];
    pendingNotes.delete(jobId);
    return notes;
  }

  /**
   * Store the fake account generated for this run so the UI/report can show it
   * and later steps can log in with it.
   */
  static async setTestIdentity(jobId: string, identity: TestIdentity): Promise<void> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    job.testIdentity = identity;
    await this.saveJob(job);
  }

  /**
   * Append a log entry for a job
   */
  static async addLog(
    jobId: string,
    step: string,
    message: string,
    level: LogLevel = 'INFO',
    metadata?: Record<string, any>
  ): Promise<JobLogItem> {
    const logId = crypto.randomUUID();
    const now = new Date().toISOString();

    if (isDbConnected()) {
      try {
        const prisma = getPrismaClient();
        const created = await prisma.jobLog.create({
          data: {
            id: logId,
            jobId,
            step,
            message,
            level,
            metadata: metadata || {},
          },
        });

        const saved = toLogItem(created);
        emitJob(jobId, { type: 'log', log: saved });
        return saved;
      } catch (err) {
        console.warn('Fallback to memory store for logs:', err);
      }
    }

    const logItem: JobLogItem = {
      id: logId,
      jobId,
      step,
      message,
      level,
      metadata,
      createdAt: now,
    };

    const logs = memoryLogs.get(jobId) || [];
    logs.push(logItem);
    memoryLogs.set(jobId, logs);
    emitJob(jobId, { type: 'log', log: logItem });
    return logItem;
  }

  /**
   * Update job status
   */
  static async updateStatus(
    id: string,
    status: JobStatus,
    result?: Record<string, any>,
    error?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const isTerminal = status === 'CANCELLED' || status === 'FAILED' || status === 'COMPLETED';
    let persisted = false;

    if (isDbConnected()) {
      try {
        const prisma = getPrismaClient();
        await prisma.job.update({
          where: { id },
          data: {
            status,
            result: result || undefined,
            error: error || null,
            ...(isTerminal && {
              pendingAction: Prisma.DbNull,
              pendingCredentials: Prisma.DbNull,
              pendingFieldInput: Prisma.DbNull,
            }),
          },
        });
        persisted = true;
      } catch (err) {
        console.warn('Fallback status update:', err);
      }
    }

    const job = memoryJobs.get(id);
    if (!persisted && job) {
      job.status = status;
      job.updatedAt = now;
      if (result) job.result = result;
      if (error) job.error = error;
      if (isTerminal) {
        job.pendingAction = undefined;
        job.pendingFieldInput = undefined;
      }
      memoryJobs.set(id, job);
    }
    emitJob(id, { type: 'job' });

    if (status === 'CANCELLED' || status === 'FAILED') {
      const queuedAt = runQueue.indexOf(id);
      if (queuedAt >= 0) runQueue.splice(queuedAt, 1);
      const resolver = pendingActionResolvers.get(id);
      if (resolver) {
        clearTimeout(resolver.timeoutId);
        pendingActionResolvers.delete(id);
        resolver.resolve({ approved: false, notes: `Job execution stopped: status transitioned to ${status}` });
      }
      const fieldResolver = pendingFieldInputResolvers.get(id);
      if (fieldResolver) {
        clearTimeout(fieldResolver.timeoutId);
        pendingFieldInputResolvers.delete(id);
        fieldResolver.resolve({ value: '' });
      }
    }
  }

  /**
   * Approval gate: pause before a risky action (payments, deletes) until the user decides
   */
  static async setActionAwaitingApproval(
    jobId: string,
    action: import('../types/job.js').PendingActionApproval
  ): Promise<JobItem> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    job.status = 'AWAITING_ACTION_APPROVAL';
    job.pendingAction = action;
    await this.addLog(
      jobId,
      'HITL_GATE2_INTERCEPT',
      `Execution paused at HITL Gate 2: Step ${action.stepNumber} [${action.action}] requires human approval. Reason: ${action.reason}`,
      'WARN',
      { pendingAction: action }
    );

    await this.saveJob(job);
    return job;
  }

  /**
   * Human-In-The-Loop Gate 2: Approve or Reject a destructive action
   */
  static async approveAction(
    jobId: string,
    approved: boolean,
    notes?: string
  ): Promise<JobItem> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    if (job.status !== 'AWAITING_ACTION_APPROVAL') {
      throw new Error(`Job ${jobId} is not awaiting action approval (current status: ${job.status})`);
    }

    if (!job.actionApprovalHistory) {
      job.actionApprovalHistory = [];
    }

    const currentPending = job.pendingAction;
    if (currentPending) {
      job.actionApprovalHistory.push({
        stepNumber: currentPending.stepNumber,
        journeyId: currentPending.journeyId,
        approved,
        notes,
        timestamp: new Date().toISOString(),
      });
    }

    const stepLabel = currentPending
      ? `Step ${currentPending.stepNumber} [${currentPending.action}]`
      : 'Destructive action';

    job.pendingAction = undefined;
    job.status = 'RUNNING';
    if (approved) {
      await this.addLog(
        jobId,
        'HITL_GATE2_APPROVED',
        `Engineer APPROVED ${stepLabel}. Execution resuming.${notes ? ` Notes: ${notes}` : ''}`,
        'SUCCESS',
        { approvedBy: 'engineer', notes }
      );
    } else {
      await this.addLog(
        jobId,
        'HITL_GATE2_REJECTED',
        `Engineer REJECTED ${stepLabel}. Action will be skipped.${notes ? ` Reason: ${notes}` : ''}`,
        'WARN',
        { rejectedBy: 'engineer', notes }
      );
    }

    await this.saveJob(job);

    // Resolve in-flight promise if waiting
    const resolver = pendingActionResolvers.get(jobId);
    if (resolver) {
      clearTimeout(resolver.timeoutId);
      pendingActionResolvers.delete(jobId);
      resolver.resolve({ approved, notes });
    }

    return job;
  }

  /**
   * Get pending action approval request for a job
   */
  static async getPendingAction(jobId: string): Promise<import('../types/job.js').PendingActionApproval | null> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    return job.pendingAction || null;
  }

  /**
   * Register a resolver for a job awaiting Gate 2 human approval
   */
  static waitForActionApproval(
    jobId: string,
    timeoutMs: number = 300000
  ): Promise<{ approved: boolean; notes?: string }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingActionResolvers.delete(jobId);
        resolve({
          approved: false,
          notes: 'Timed out waiting for human engineer approval (auto-rejected for safety).',
        });
      }, timeoutMs);

      pendingActionResolvers.set(jobId, { resolve, reject, timeoutId });
    });
  }

  // ---------------------------------------------------------------------------
  // Agent questions (ask_user): pause until the user answers or skips
  // ---------------------------------------------------------------------------

  /**
   * Pause a job and ask the user to provide a value for an unknown form field
   */
  static async setAwaitingFieldInput(
    jobId: string,
    request: PendingFieldRequest
  ): Promise<JobItem> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    job.status = 'AWAITING_FIELD_INPUT';
    job.pendingFieldInput = request;
    await this.addLog(
      jobId,
      'FIELD_INPUT_REQUIRED',
      `⌨️ Agent is waiting for your answer: ${request.description || request.fieldLabel}`,
      'WARN',
      { pendingFieldInput: request }
    );

    await this.saveJob(job);
    return job;
  }

  /**
   * User submits the value for the pending field; execution resumes
   */
  static async submitFieldInput(
    jobId: string,
    submission: FieldInputSubmission
  ): Promise<JobItem> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    if (job.status !== 'AWAITING_FIELD_INPUT') {
      throw new Error(`Job ${jobId} is not awaiting field input (status: ${job.status})`);
    }

    const fieldLabel = job.pendingFieldInput?.fieldLabel ?? 'unknown field';
    job.pendingFieldInput = undefined;
    job.status = 'RUNNING';
    await this.addLog(
      jobId,
      'FIELD_INPUT_RESOLVED',
      submission.value.trim()
        ? `User answered "${fieldLabel}". Resuming agent execution.`
        : `User skipped "${fieldLabel}". Resuming agent execution.`,
      'SUCCESS'
    );

    await this.saveJob(job);

    const resolver = pendingFieldInputResolvers.get(jobId);
    if (resolver) {
      clearTimeout(resolver.timeoutId);
      pendingFieldInputResolvers.delete(jobId);
      resolver.resolve(submission);
    }

    return job;
  }

  /**
   * Get the current pending field input request
   */
  static async getPendingFieldInput(jobId: string): Promise<PendingFieldRequest | null> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    return job.pendingFieldInput || null;
  }

  /**
   * Wait for user to provide a field value (with 10-minute timeout)
   */
  static waitForFieldInput(
    jobId: string,
    timeoutMs: number = 600000
  ): Promise<FieldInputSubmission> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingFieldInputResolvers.delete(jobId);
        // On timeout — submit empty string so agent skips gracefully
        resolve({ value: '' });
      }, timeoutMs);

      pendingFieldInputResolvers.set(jobId, { resolve, reject, timeoutId });
    });
  }


  /**
   * Run the job execution pipeline
   * Modular architecture ready for OpenAI Agent SDK and browser automation (Playwright/Puppeteer)
   */
  static async executeJob(jobId: string): Promise<void> {
    const job = await this.getJobById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (ACTIVE_STATUSES.includes(job.status) || runQueue.includes(jobId)) {
      throw new Error(`Job is already in progress (status: ${job.status})`);
    }

    if (runningJobs.size >= MAX_CONCURRENT_RUNS) {
      runQueue.push(jobId);
      await this.updateStatus(jobId, 'PENDING');
      await this.addLog(
        jobId,
        'QUEUED',
        `Waiting for a free browser (${runningJobs.size}/${MAX_CONCURRENT_RUNS} runs active, position ${runQueue.length} in queue).`,
        'INFO'
      );
      return;
    }

    await this.startJob(job);
  }

  /** Every Chromium instance costs ~300MB, so only MAX_CONCURRENT_RUNS jobs run at once. */
  private static async startJob(job: JobItem): Promise<void> {
    runningJobs.add(job.id);
    await this.updateStatus(job.id, 'RUNNING');
    await this.addLog(job.id, 'AGENT_START', 'Starting AI Browser Automation Agent pipeline', 'INFO');

    // Run asynchronously to allow real-time progress observation
    this.runPipeline(job)
      .catch(async (error) => {
        console.error(`Pipeline failure for job ${job.id}:`, error);
        await this.addLog(job.id, 'FATAL_ERROR', `Execution stopped: ${error.message}`, 'ERROR');
        await this.updateStatus(job.id, 'FAILED', undefined, error.message);
      })
      .finally(() => {
        runningJobs.delete(job.id);
        this.drainQueue().catch((err) => console.error('Queue drain failed:', err));
      });
  }

  private static async drainQueue(): Promise<void> {
    while (runningJobs.size < MAX_CONCURRENT_RUNS && runQueue.length > 0) {
      const nextId = runQueue.shift()!;
      const next = await this.getJobById(nextId);
      if (!next || next.status !== 'PENDING') continue;
      await this.startJob(next);
    }
  }

  /**
   * Step-by-step pipeline execution
   */
  private static async runPipeline(job: JobItem): Promise<void> {
    try {
      const logger = async (
        step: string,
        message: string,
        level: LogLevel = 'INFO',
        metadata?: Record<string, any>
      ) => {
        await this.addLog(job.id, step, message, level, metadata);
      };

      // Delegate directly to the AI agent implementation in backend/src/ai/browserAgent.ts
      const resultData = await runBrowserAgent(job, logger);
      const isFailed = resultData?.failedJourneys > 0 && resultData?.passedJourneys === 0;

      const latest = await this.getJobById(job.id);
      if (latest?.status === 'CANCELLED') return;

      await this.updateStatus(
        job.id,
        isFailed ? 'FAILED' : 'COMPLETED',
        resultData,
        isFailed ? 'One or more journeys failed during execution' : undefined
      );
    } catch (err: any) {
      await this.addLog(job.id, 'ERROR', `Error during agent execution: ${err.message}`, 'ERROR');
      await this.updateStatus(job.id, 'FAILED', undefined, err.message);
    }
  }
}
