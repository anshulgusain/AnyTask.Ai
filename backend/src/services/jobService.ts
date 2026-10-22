import { getPrismaClient, isDbConnected } from '../db.js';
import { JobItem, JobLogItem, JobPayload, JobStatus, LogLevel } from '../types/job.js';
import { runBrowserAgent } from '../ai/browserAgent.js';
import crypto from 'node:crypto';

// In-memory fallback repository when PostgreSQL is not yet configured locally
const memoryJobs = new Map<string, JobItem>();
const memoryLogs = new Map<string, JobLogItem[]>();

export class JobService {
  /**
   * Create a new job
   */
  static async createJob(data: {
    title?: string;
    type?: 'FORM_FILLER' | 'WEB_SCRAPER' | 'CUSTOM_AGENT';
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
          include: { logs: true },
        });

        return {
          id: created.id,
          title: created.title,
          type: created.type as any,
          status: created.status as any,
          targetUrl: created.targetUrl,
          payload: created.payload as any,
          result: created.result as any,
          error: created.error,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
          logs: [],
        };
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
        const jobs = await prisma.job.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            logs: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        return jobs.map((j) => ({
          id: j.id,
          title: j.title,
          type: j.type as any,
          status: j.status as any,
          targetUrl: j.targetUrl,
          payload: j.payload as any,
          result: j.result as any,
          error: j.error,
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
          logs: j.logs.map((l) => ({
            id: l.id,
            jobId: l.jobId,
            step: l.step,
            message: l.message,
            level: l.level as any,
            metadata: l.metadata as any,
            createdAt: l.createdAt.toISOString(),
          })),
        }));
      } catch (err) {
        console.warn('Fallback to memory store:', err);
      }
    }

    const all = Array.from(memoryJobs.values());
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return all.map((j) => ({
      ...j,
      logs: memoryLogs.get(j.id) || [],
    }));
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

        return {
          id: j.id,
          title: j.title,
          type: j.type as any,
          status: j.status as any,
          targetUrl: j.targetUrl,
          payload: j.payload as any,
          result: j.result as any,
          error: j.error,
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
          logs: j.logs.map((l) => ({
            id: l.id,
            jobId: l.jobId,
            step: l.step,
            message: l.message,
            level: l.level as any,
            metadata: l.metadata as any,
            createdAt: l.createdAt.toISOString(),
          })),
        };
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

        return {
          id: created.id,
          jobId: created.jobId,
          step: created.step,
          message: created.message,
          level: created.level as any,
          metadata: created.metadata as any,
          createdAt: created.createdAt.toISOString(),
        };
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

    if (isDbConnected()) {
      try {
        const prisma = getPrismaClient();
        await prisma.job.update({
          where: { id },
          data: {
            status,
            result: result || undefined,
            error: error || null,
          },
        });
        return;
      } catch (err) {
        console.warn('Fallback status update:', err);
      }
    }

    const job = memoryJobs.get(id);
    if (job) {
      job.status = status;
      job.updatedAt = now;
      if (result) job.result = result;
      if (error) job.error = error;
      memoryJobs.set(id, job);
    }
  }

  /**
   * HITL Gate 1: Save generated TestPlan and transition job to AWAITING_PLAN_APPROVAL
   */
  static async setPlanAwaitingApproval(
    jobId: string,
    plan: import('../ai/journeyPlanner.js').TestPlan
  ): Promise<JobItem> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    job.plan = plan;
    job.status = 'AWAITING_PLAN_APPROVAL';
    job.updatedAt = new Date().toISOString();
    memoryJobs.set(jobId, job);

    await this.addLog(
      jobId,
      'HITL_GATE_1',
      `TestPlan generated with ${plan.journeys.length} journeys. Execution PAUSED awaiting human approval.`,
      'WARN',
      { planId: plan.id, summary: plan.summary }
    );

    return job;
  }

  /**
   * Human-In-The-Loop Gate 1: Approve or Reject the TestPlan
   */
  static async approvePlan(
    jobId: string,
    approved: boolean,
    notes?: string,
    modifiedPlan?: import('../ai/journeyPlanner.js').TestPlan
  ): Promise<JobItem> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    if (job.status !== 'AWAITING_PLAN_APPROVAL') {
      throw new Error(`Job ${jobId} is not awaiting plan approval (current status: ${job.status})`);
    }

    job.planApproved = approved;
    job.planApprovalNotes = notes;
    if (modifiedPlan) {
      job.plan = modifiedPlan;
    }

    if (approved) {
      job.status = 'RUNNING';
      await this.addLog(
        jobId,
        'HITL_PLAN_APPROVED',
        `TestPlan approved by engineer. Proceeding to execution.${notes ? ` Notes: ${notes}` : ''}`,
        'SUCCESS',
        { approvedBy: 'engineer', notes }
      );
    } else {
      job.status = 'CANCELLED';
      await this.addLog(
        jobId,
        'HITL_PLAN_REJECTED',
        `TestPlan rejected by engineer.${notes ? ` Reason: ${notes}` : ''}`,
        'WARN',
        { notes }
      );
    }

    job.updatedAt = new Date().toISOString();
    memoryJobs.set(jobId, job);
    return job;
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

    if (job.status === 'RUNNING') {
      throw new Error('Job is already running');
    }

    // Set status to RUNNING
    await this.updateStatus(jobId, 'RUNNING');
    await this.addLog(jobId, 'AGENT_START', 'Starting AI Browser Automation Agent pipeline', 'INFO');

    // Run asynchronously to allow real-time progress observation
    this.runPipeline(job).catch(async (error) => {
      console.error(`Pipeline failure for job ${jobId}:`, error);
      await this.addLog(jobId, 'FATAL_ERROR', `Execution stopped: ${error.message}`, 'ERROR');
      await this.updateStatus(jobId, 'FAILED', undefined, error.message);
    });
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

      await this.updateStatus(job.id, 'COMPLETED', resultData);
    } catch (err: any) {
      await this.addLog(job.id, 'ERROR', `Error during agent execution: ${err.message}`, 'ERROR');
      await this.updateStatus(job.id, 'FAILED', undefined, err.message);
    }
  }
}
