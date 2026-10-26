import { Router } from 'express';
import { JobController } from '../controllers/jobController.js';

export const jobRoutes = Router();

jobRoutes.post('/', JobController.createJob);
jobRoutes.get('/', JobController.listJobs);
jobRoutes.get('/:id', JobController.getJob);
jobRoutes.post('/:id/run', JobController.runJob);
jobRoutes.post('/:id/cancel', JobController.cancelJob);

// HITL Gate 1: Human-in-the-loop plan review & approval
jobRoutes.get('/:id/plan', JobController.getPlan);
jobRoutes.post('/:id/approve-plan', JobController.approvePlan);

// HITL Gate 2: Human-in-the-loop destructive action review & approval
jobRoutes.get('/:id/pending-action', JobController.getPendingAction);
jobRoutes.post('/:id/approve-action', JobController.approveAction);


