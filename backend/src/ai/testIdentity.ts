import crypto from 'node:crypto';
import type { TestIdentity } from '../types/job.js';

const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Avery', 'Quinn'];
const LAST_NAMES = ['Rivera', 'Chen', 'Patel', 'Morgan', 'Kim', 'Singh', 'Lopez', 'Walker'];

function pick<T>(items: T[]): T {
  return items[crypto.randomInt(items.length)];
}

function randomDigits(count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += crypto.randomInt(10).toString();
  return out;
}

/**
 * Builds the email for a run. If TEST_EMAIL_BASE (e.g. "me@gmail.com") is set we use
 * plus-addressing so verification emails land in a real inbox; otherwise a throwaway domain.
 */
function buildEmail(tag: string): string {
  const base = process.env.TEST_EMAIL_BASE?.trim();
  if (base && base.includes('@')) {
    const [local, domain] = base.split('@');
    return `${local}+${tag}@${domain}`;
  }
  const domain = process.env.TEST_EMAIL_DOMAIN?.trim() || 'example.com';
  return `${tag}@${domain}`;
}

/**
 * Generates a fresh fake account for a single test run so sign-up flows never collide
 * with accounts created by previous runs.
 */
export function generateTestIdentity(runId: string): TestIdentity {
  const shortId = runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  const tag = `anytask-qa-${shortId}`;
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  // Satisfies the usual "upper + lower + digit + symbol, 12+ chars" password rules.
  const password = `Qa!${crypto.randomBytes(4).toString('hex')}Zx9`;
  const realPhone = process.env.TEST_PHONE?.trim();

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    username: `qa_${shortId}`,
    email: buildEmail(tag),
    password,
    phone: realPhone || `9${randomDigits(9)}`,
    phoneIsReal: Boolean(realPhone),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Field-name → value map handed to the planner. Explicit user-provided fields always win.
 */
export function identityToFields(
  identity: TestIdentity,
  userFields: Record<string, string> = {}
): Record<string, string> {
  const generated: Record<string, string> = {
    name: identity.fullName,
    fullName: identity.fullName,
    firstName: identity.firstName,
    lastName: identity.lastName,
    username: identity.username,
    email: identity.email,
    password: identity.password,
    confirmPassword: identity.password,
    phone: identity.phone,
  };

  const explicit = Object.fromEntries(
    Object.entries(userFields).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
  );

  return { ...generated, ...explicit };
}
