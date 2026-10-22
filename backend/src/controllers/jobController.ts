import { Request, Response } from 'express';
import { JobService } from '../services/jobService.js';
import { z } from 'zod';

const CreateJobSchema = z.object({
  title: z.string().optional(),
  type: z.enum(['FORM_FILLER', 'WEB_SCRAPER', 'CUSTOM_AGENT']).optional(),
  targetUrl: z.string().url('Must provide a valid target URL'),
  payload: z
    .object({
      targetUrl: z.string().optional(),
      instructions: z.string().optional(),
      fields: z.record(z.any()).optional(),
      submitSelector: z.string().optional(),
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
   * GET /api/jobs/:id/plan (HITL Gate 1)
   */
  static async getPlan(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'Job ID required' });

      const job = await JobService.getJobById(id);
      if (!job) return res.status(404).json({ success: false, error: `Job with ID ${id} not found` });

      return res.json({
        success: true,
        data: {
          jobId: id,
          status: job.status,
          plan: job.plan || null,
          planApproved: job.planApproved ?? null,
          planApprovalNotes: job.planApprovalNotes || null,
        },
      });
    } catch (error: any) {
      console.error('Error in getPlan:', error);
      return res.status(500).json({ success: false, error: error.message || 'Failed to get plan' });
    }
  }

  /**
   * POST /api/jobs/:id/approve-plan (HITL Gate 1)
   */
  static async approvePlan(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'Job ID required' });

      const ApprovePlanSchema = z.object({
        approved: z.boolean(),
        notes: z.string().optional(),
        modifiedPlan: z.any().optional(),
      });

      const parsed = ApprovePlanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      const updatedJob = await JobService.approvePlan(
        id,
        parsed.data.approved,
        parsed.data.notes,
        parsed.data.modifiedPlan
      );

      return res.json({
        success: true,
        message: parsed.data.approved
          ? 'Plan approved. Ready for execution.'
          : 'Plan rejected. Job cancelled.',
        data: updatedJob,
      });
    } catch (error: any) {
      console.error('Error in approvePlan:', error);
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to process plan approval',
      });
    }
  }
}

