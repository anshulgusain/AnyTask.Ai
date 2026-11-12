import { Request, Response } from 'express';
import { JobService, jobEvents, type JobEvent } from '../services/jobService.js';
import { z } from 'zod';
import { assertSafeTarget } from '../security.js';

const CreateJobSchema = z.object({
  title: z.string().optional(),
  type: z.enum(['FORM_FILLER', 'WEB_SCRAPER', 'CUSTOM_AGENT', 'AUTONOMOUS_QA']).optional(),
  targetUrl: z.string().url('Must provide a valid target URL'),
  payload: z
    .object({
      instructions: z.string().max(4000).optional(),
      fields: z.record(z.string()).optional(),
      headless: z.boolean().optional(),
    })
    .optional(),
});

export class JobController {
  /**
   * POST /api/jobs
   */
  static async createJob(req: Request, res: Response) {
    try {
      const parsed = CreateJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      try {
        await assertSafeTarget(parsed.data.targetUrl);
      } catch (err: any) {
        return res.status(400).json({ success: false, error: err.message });
      }

      const job = await JobService.createJob({
        title: parsed.data.title,
        type: parsed.data.type,
        targetUrl: parsed.data.targetUrl,
        payload: parsed.data.payload as any,
      });

      return res.status(201).json({
        success: true,
        data: job,
      });
    } catch (error: any) {
      console.error('Error in createJob:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * GET /api/jobs
   */
  static async listJobs(req: Request, res: Response) {
    try {
      const jobs = await JobService.listJobs();
      return res.json({
        success: true,
        data: jobs,
      });
    } catch (error: any) {
      console.error('Error in listJobs:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * GET /api/jobs/:id
   */
  static async getJob(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Job ID required' });
      }
      const job = await JobService.getJobById(id);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: `Job with ID ${id} not found`,
        });
      }

      return res.json({
        success: true,
        data: job,
      });
    } catch (error: any) {
      console.error('Error in getJob:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * POST /api/jobs/:id/run
   */
  static async runJob(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Job ID required' });
      }
      const job = await JobService.getJobById(id);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: `Job with ID ${id} not found`,
        });
      }

      // Trigger the execution pipeline
      await JobService.executeJob(id);

      return res.json({
        success: true,
        message: 'Job execution started',
        jobId: id,
      });
    } catch (error: any) {
      console.error('Error in runJob:', error);
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to start job execution',
      });
    }
  }

  /**
   * POST /api/jobs/:id/cancel
   */
  static async cancelJob(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Job ID required' });
      }
      await JobService.updateStatus(id, 'CANCELLED');
      await JobService.addLog(id, 'CANCELLED', 'Job was cancelled by user request', 'WARN');

      return res.json({
        success: true,
        message: 'Job cancelled successfully',
      });
    } catch (error: any) {
      console.error('Error in cancelJob:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel job',
      });
    }
  }

  /**
   * GET /api/jobs/:id/pending-action (approval gate)
   */
  static async getPendingAction(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'Job ID required' });

      const pending = await JobService.getPendingAction(id);
      return res.json({
        success: true,
        data: pending,
      });
    } catch (error: any) {
      console.error('Error in getPendingAction:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to get pending action' });
    }
  }

  /**
   * POST /api/jobs/:id/approve-action (approval gate)
   */
  static async approveAction(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'Job ID required' });

      const ApproveActionSchema = z.object({
        approved: z.boolean(),
        notes: z.string().optional(),
      });

      const parsed = ApproveActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      const updatedJob = await JobService.approveAction(
        id,
        parsed.data.approved,
        parsed.data.notes
      );

      return res.json({
        success: true,
        message: parsed.data.approved
          ? 'Destructive action approved. Execution proceeding.'
          : 'Destructive action rejected. Step will be skipped.',
        data: updatedJob,
      });
    } catch (error: any) {
      console.error('Error in approveAction:', error);
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to process action approval',
      });
    }
  }

  /**
   * GET /api/jobs/:id/events: Server-Sent Events stream.
   * Sends `snapshot` (full job with logs) on connect, then `log` for each new log line
   * and `job` (job without logs) whenever status / pending prompts / result change.
   */
  static async streamEvents(req: Request, res: Response) {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const job = id ? await JobService.getJobById(id) : null;
    if (!id || !job) return res.status(404).json({ success: false, error: 'Job not found' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('snapshot', job);

    let refreshing: Promise<void> | null = null;
    const onEvent = (evt: JobEvent) => {
      if (evt.type === 'log') return send('log', evt.log);
      // Coalesce bursts of state changes into one fetch.
      refreshing ??= JobService.getJobById(id)
        .then((latest) => {
          if (latest) send('job', { ...latest, logs: undefined });
        })
        .catch(() => {})
        .finally(() => {
          refreshing = null;
        });
    };

    jobEvents.on(id, onEvent);
    // Proxies (Render, nginx) drop idle connections; comments keep the stream open.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      jobEvents.off(id, onEvent);
    });
  }

  /**
   * POST /api/jobs/:id/notes: extra guidance for the agent while it runs.
   */
  static async addNote(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const parsed = z.object({ note: z.string().trim().min(1).max(1000) }).safeParse(req.body);
      if (!id || !parsed.success) {
        return res.status(400).json({ success: false, error: 'A non-empty note (max 1000 chars) is required' });
      }
      await JobService.addNote(id, parsed.data.note);
      return res.json({ success: true, message: 'Note delivered to the agent.' });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'Failed to add note' });
    }
  }

  /**
   * GET /api/jobs/:id/pending-field-input (agent's ask_user question)
   */
  static async getPendingFieldInput(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'Job ID required' });

      const pending = await JobService.getPendingFieldInput(id);
      return res.json({ success: true, data: pending });
    } catch (error: any) {
      console.error('Error in getPendingFieldInput:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to get pending question' });
    }
  }

  /**
   * POST /api/jobs/:id/submit-field-input (answer the agent's question; empty value = skip)
   */
  static async submitFieldInput(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'Job ID required' });

      const parsed = z.object({ value: z.string() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.format() });
      }

      const updatedJob = await JobService.submitFieldInput(id, parsed.data);
      return res.json({ success: true, message: 'Answer submitted. Execution proceeding.', data: updatedJob });
    } catch (error: any) {
      console.error('Error in submitFieldInput:', error);
      return res.status(400).json({ success: false, error: error.message || 'Failed to submit answer' });
    }
  }
}


