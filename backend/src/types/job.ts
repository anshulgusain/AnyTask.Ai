import type { TestPlan } from '../ai/journeyPlanner.js';
export type {
  AssertionType,
  AssertionRule,
  AssertionOutcome,
  StepAssertionReport,
} from '../ai/assertionAgent.js';

export type JobStatus =
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

export interface PendingCredentialRequest {
  loginUrl: string;
  title?: string;
  detectedFields: string[];
  message: string;
  registerUrl?: string;
  timestamp: string;
}

export interface CredentialSubmission {
  action: 'PROVIDE_CREDENTIALS' | 'REGISTER_NEW' | 'SKIP';
  username?: string;
  password?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Field Input Gate: Ask user to supply a value for an unknown form field
// ---------------------------------------------------------------------------

export interface PendingFieldRequest {
  stepNumber: number;
  journeyId: string;
  fieldLabel: string;       // Human-readable label (e.g. "Phone Number")
  fieldSelector: string;    // CSS selector of the input
  fieldType: string;        // input type: text, email, tel, password, textarea...
  description: string;      // Step description from the plan
  pageUrl: string;          // Current page URL so user knows context
  timestamp: string;
}

export interface FieldInputSubmission {
  value: string;           // The value to fill in
}

export interface TestIdentity {
  firstName: string;
  lastName: string;
  fullName: string;
  username: string;
  email: string;
  password: string;
  phone: string;
  createdAt: string;
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
  pendingCredentials?: PendingCredentialRequest;
  pendingFieldInput?: PendingFieldRequest;
  testIdentity?: TestIdentity;
  result?: Record<string, any>;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: JobLogItem[];
}

