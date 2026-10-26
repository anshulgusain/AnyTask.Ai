import type { TestPlan } from '../ai/journeyPlanner.js';

export type JobStatus =
  | 'PENDING'
  | 'DISCOVERING'
  | 'PLANNING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'RUNNING'
  | 'AWAITING_ACTION_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type JobType = 'FORM_FILLER' | 'WEB_SCRAPER' | 'CUSTOM_AGENT' | 'AUTONOMOUS_QA';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export interface FormFieldItem {
  fieldName: string;
  fieldValue: string;
  fieldType?: string;
}

export interface JobPayload {
  targetUrl: string;
  instructions?: string;
  fields?: Record<string, string> | FormFieldItem[];
  submitSelector?: string;
  headless?: boolean;
  userIntent?: string;
}

export interface JobLogItem {
  id: string;
  jobId: string;
  step: string;
  message: string;
  level: LogLevel;
  metadata?: Record<string, any>;
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

export interface ActionApprovalRecord {
  stepNumber: number;
  journeyId: string;
  approved: boolean;
  notes?: string;
  timestamp: string;
}

export interface JobItem {
  id: string;
  title: string;
  type: JobType;
  status: JobStatus;
  targetUrl: string;
  payload?: JobPayload;
  plan?: TestPlan;
  planApproved?: boolean;
  planApprovalNotes?: string;
  pendingAction?: PendingActionApproval;
  actionApprovalHistory?: ActionApprovalRecord[];
  result?: Record<string, any>;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: JobLogItem[];
}

