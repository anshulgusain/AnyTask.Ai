import { Router } from 'express';
import { JobController } from '../controllers/jobController.js';

export const jobRoutes = Router();

jobRoutes.post('/', JobController.createJob);
jobRoutes.get('/', JobController.listJobs);
jobRoutes.get('/:id', JobController.getJob);
jobRoutes.post('/:id/run', JobController.runJob);
jobRoutes.post('/:id/cancel', JobController.cancelJob);
jobRoutes.get('/:id/events', JobController.streamEvents);
jobRoutes.post('/:id/notes', JobController.addNote);

// Approval gate: risky actions (payments, deletes) wait for the user
jobRoutes.get('/:id/pending-action', JobController.getPendingAction);
jobRoutes.post('/:id/approve-action', JobController.approveAction);

// Agent questions (ask_user): the agent pauses until the user answers or skips
jobRoutes.get('/:id/pending-field-input', JobController.getPendingFieldInput);
jobRoutes.post('/:id/submit-field-input', JobController.submitFieldInput);
