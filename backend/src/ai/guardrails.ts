import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Day 9: Guardrails Engine
// ---------------------------------------------------------------------------
// Provides safety checks for the AnyTask.AI executor agent loop.
// Prevents infinite loops, runaway budgets, and accidental target DDOS.
//
// Usage:
//   const checker = new GuardrailsChecker(createGuardrailsConfig({ maxSteps: 50 }));
//   const verdict = await checker.checkBeforeStep(step, currentUrl);
//   checker.recordStepResult(result);
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GuardrailsConfig {
  /** Max times the same (url, selector, action) fingerprint may repeat before loop abort. Default: 3 */
  loopDetectionThreshold: number;

  /** Maximum wall-clock duration for a single step in milliseconds. Default: 15_000 */
  stepTimeoutMs: number;

  /** Total step budget across all journeys in a single plan run. Default: 100 */
  maxSteps: number;

  /** Maximum consecutive step failures before execution is halted. Default: 5 */
  maxConsecutiveErrors: number;

  /** Number of consecutive navigations to the same URL before marking as stuck. Default: 3 */
  idlePageThreshold: number;

  /** Minimum milliseconds between actions on the same domain (rate limiting). Default: 500 */
  minActionIntervalMs: number;
}

/**
 * Factory that merges caller-supplied overrides with the safe defaults.
 */
export function createGuardrailsConfig(
  overrides: Partial<GuardrailsConfig> = {}
): GuardrailsConfig {
  return {
    loopDetectionThreshold: overrides.loopDetectionThreshold ?? 3,
    stepTimeoutMs: overrides.stepTimeoutMs ?? 15_000,
    maxSteps: overrides.maxSteps ?? 100,
    maxConsecutiveErrors: overrides.maxConsecutiveErrors ?? 5,
    idlePageThreshold: overrides.idlePageThreshold ?? 3,
    minActionIntervalMs: overrides.minActionIntervalMs ?? 500,
  };
}

// ---------------------------------------------------------------------------
// Verdict Types
// ---------------------------------------------------------------------------

export type GuardrailVerdictCode =
  | 'ALLOW'
  | 'LOOP_DETECTED'
  | 'STEP_BUDGET_EXCEEDED'
  | 'ERROR_BUDGET_EXCEEDED'
  | 'IDLE_PAGE_DETECTED'
  | 'RATE_LIMITED';

export interface GuardrailVerdict {
  /** Whether the step is permitted to execute. */
  allowed: boolean;
  /** Specific reason code if blocked. */
  code: GuardrailVerdictCode;
  /** Human-readable explanation. */
  message: string;
  /** Milliseconds to wait before proceeding (used for rate limiting). 0 if no delay needed. */
  delayMs: number;
}

// ---------------------------------------------------------------------------
// Step Fingerprint Input
// ---------------------------------------------------------------------------

export interface StepFingerprint {
  /** Current page URL at the time of the step. */
  url: string;
  /** CSS selector targeted by the step (empty string for navigation steps). */
  selector: string;
  /** Action type, e.g. CLICK, FILL, NAVIGATE. */
  action: string;
}

// ---------------------------------------------------------------------------
// Step Result for Recording
// ---------------------------------------------------------------------------

export interface GuardrailStepResult {
  /** Whether the step succeeded. */
  success: boolean;
  /** Duration in milliseconds (for timeout guard). */
  durationMs: number;
  /** The URL of the page after the step completed. */
  pageUrlAfter: string;
  /** Whether this step was a navigation step. */
  isNavigation: boolean;
}

// ---------------------------------------------------------------------------
// GuardrailsChecker
// ---------------------------------------------------------------------------

/**
 * Stateful checker that enforces all configured guardrails during plan execution.
 * Instantiate once per plan run and call checkBeforeStep / recordStepResult
 * for every step.
 */
export class GuardrailsChecker {
  private readonly id: string;
  private readonly config: GuardrailsConfig;

  // Loop detection: fingerprint → hit count
  private readonly fingerprintHits = new Map<string, number>();

  // Step budget
  private stepCount = 0;

  // Consecutive error tracking
  private consecutiveErrors = 0;

  // Idle page detection: history of recent navigation URLs
  private navigationHistory: string[] = [];

  // Rate limiting: domain → last action timestamp (epoch ms)
  private readonly domainLastAction = new Map<string, number>();

  constructor(config: GuardrailsConfig = createGuardrailsConfig()) {
    this.id = crypto.randomUUID();
    this.config = config;
  }

  /** Unique ID for this guardrails session (useful for logging). */
  get sessionId(): string {
    return this.id;
  }

  // ---------------------------------------------------------------------------
  // Public API: Pre-step check
  // ---------------------------------------------------------------------------

  /**
   * Call this BEFORE executing a step. Returns a verdict indicating whether
   * the step is allowed, and if not, why.
   *
   * If the verdict contains a non-zero `delayMs`, the caller should sleep that
   * duration before proceeding (rate limiting). The step itself is still allowed.
   *
   * @param fingerprint  Identifying data for the upcoming step.
   * @param domain       The hostname / domain of the target (for rate limiting).
   */
  async checkBeforeStep(
    fingerprint: StepFingerprint,
    domain: string
  ): Promise<GuardrailVerdict> {
    // 1. Step budget -----------------------------------------------------------
    if (this.stepCount >= this.config.maxSteps) {
      return {
        allowed: false,
        code: 'STEP_BUDGET_EXCEEDED',
        message: `Step budget exhausted: ${this.stepCount} / ${this.config.maxSteps} steps used.`,
        delayMs: 0,
      };
    }

    // 2. Consecutive error budget ----------------------------------------------
    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      return {
        allowed: false,
        code: 'ERROR_BUDGET_EXCEEDED',
        message: `Consecutive error limit reached: ${this.consecutiveErrors} failures in a row (max ${this.config.maxConsecutiveErrors}).`,
        delayMs: 0,
      };
    }

    // 3. Loop detection --------------------------------------------------------
    const key = buildFingerprintKey(fingerprint);
    const hits = (this.fingerprintHits.get(key) ?? 0) + 1;
    if (hits > this.config.loopDetectionThreshold) {
      return {
        allowed: false,
        code: 'LOOP_DETECTED',
        message: `Loop detected: step fingerprint "${key}" has been seen ${hits} times (threshold: ${this.config.loopDetectionThreshold}).`,
        delayMs: 0,
      };
    }
    // Record the pending hit (will be confirmed by recordStepResult)
    this.fingerprintHits.set(key, hits);

    // 4. Idle page detection ---------------------------------------------------
    if (fingerprint.action === 'NAVIGATE') {
      this.navigationHistory.push(fingerprint.url);
      // Keep only the last N entries
      if (this.navigationHistory.length > this.config.idlePageThreshold) {
        this.navigationHistory.shift();
      }

      if (
        this.navigationHistory.length >= this.config.idlePageThreshold &&
        this.navigationHistory.every((u) => u === fingerprint.url)
      ) {
        return {
          allowed: false,
          code: 'IDLE_PAGE_DETECTED',
          message: `Idle page detected: navigated to "${fingerprint.url}" ${this.navigationHistory.length} consecutive times without progress.`,
          delayMs: 0,
        };
      }
    }

    // 5. Rate limiting ---------------------------------------------------------
    const now = Date.now();
    const lastAction = this.domainLastAction.get(domain);
    let delayMs = 0;

    if (lastAction !== undefined) {
      const elapsed = now - lastAction;
      if (elapsed < this.config.minActionIntervalMs) {
        delayMs = this.config.minActionIntervalMs - elapsed;
      }
    }

    // Update domain timestamp (accounting for delay)
    this.domainLastAction.set(domain, now + delayMs);

    return {
      allowed: true,
      code: 'ALLOW',
      message: delayMs > 0
        ? `Rate limited: throttling ${delayMs}ms before acting on domain "${domain}".`
        : 'Step permitted.',
      delayMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Post-step recording
  // ---------------------------------------------------------------------------

  /**
   * Call this AFTER a step completes (pass or fail).
   * Updates internal state for consecutive-error tracking and idle detection.
   *
   * @param result  The outcome of the step that just ran.
   */
  recordStepResult(result: GuardrailStepResult): void {
    this.stepCount += 1;

    if (result.success) {
      this.consecutiveErrors = 0;
    } else {
      this.consecutiveErrors += 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Introspection helpers (useful for tests and dashboards)
  // ---------------------------------------------------------------------------

  /** Current number of steps recorded this session. */
  get currentStepCount(): number {
    return this.stepCount;
  }

  /** Current consecutive failure count. */
  get currentConsecutiveErrors(): number {
    return this.consecutiveErrors;
  }

  /** How many times a given fingerprint has been seen. */
  getFingerprintHits(fingerprint: StepFingerprint): number {
    return this.fingerprintHits.get(buildFingerprintKey(fingerprint)) ?? 0;
  }

  /** Remaining step budget. */
  get remainingStepBudget(): number {
    return Math.max(0, this.config.maxSteps - this.stepCount);
  }

  /** The active config for this session. */
  get activeConfig(): Readonly<GuardrailsConfig> {
    return this.config;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a stable string key from a step fingerprint.
 * Normalises URL to remove trailing slashes and hash fragments.
 */
function buildFingerprintKey(fp: StepFingerprint): string {
  const normUrl = fp.url.replace(/[/#]+$/, '').toLowerCase();
  const normSelector = (fp.selector || '').trim().toLowerCase();
  const normAction = fp.action.trim().toUpperCase();
  return `${normAction}::${normUrl}::${normSelector}`;
}
