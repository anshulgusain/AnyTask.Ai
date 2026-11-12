// Mirrors the Prisma JobStatus enum. DISCOVERING, PLANNING, AWAITING_PLAN_APPROVAL and
// AWAITING_CREDENTIALS are no longer produced but stay so older rows still parse.
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

export interface JobPayload {
  instructions?: string;
  fields?: Record<string, string>;
  headless?: boolean;
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

// ---------------------------------------------------------------------------
// Agent question (ask_user): the agent pauses until the user answers or skips
// ---------------------------------------------------------------------------

export interface PendingFieldRequest {
  stepNumber: number;
  journeyId: string;
  fieldLabel: string;       // Short label for the answer box (e.g. "Verification code")
  fieldSelector: string;
  fieldType: string;        // 'password' masks the answer box
  description: string;      // The full question
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
  /** False when the phone is generated: it may belong to a stranger, so never send SMS/OTP to it. */
  phoneIsReal: boolean;
  createdAt: string;
}

export interface JobItem {
  id: string;
  title: string;
  type: JobType;
  status: JobStatus;
  targetUrl: string;
  payload?: JobPayload;
  pendingAction?: PendingActionApproval;
  actionApprovalHistory?: ActionApprovalRecord[];
  pendingFieldInput?: PendingFieldRequest;
  testIdentity?: TestIdentity;
  result?: Record<string, any>;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: JobLogItem[];
}

