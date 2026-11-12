import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

/**
 * When ANYTASK_API_KEY is set, every request must carry it as
 * `Authorization: Bearer <key>`, `x-api-key: <key>`, or `?key=<key>`.
 * The query form exists because <img> tags and EventSource can't send headers.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ANYTASK_API_KEY;
  if (!expected) return next();

  const header = req.header('authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-api-key');
  const provided = header || (typeof req.query.key === 'string' ? req.query.key : '');
  const ok =
    provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!ok) {
    return res.status(401).json({ success: false, error: 'Missing or invalid API key' });
  }
  return next();
}

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

/** Private targets are allowed in development (localhost demo pages) and blocked in production. */
export function allowPrivateTargets(): boolean {
  const flag = process.env.ALLOW_PRIVATE_TARGETS;
  if (flag !== undefined) return flag === 'true';
  return process.env.NODE_ENV !== 'production';
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, includes cloud metadata 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3], // multicast + reserved
];

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const value = ipv4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return false;
}

const hostCache = new Map<string, { private: boolean; at: number }>();
const HOST_CACHE_MS = 60_000;

export async function isPrivateHost(rawHost: string): Promise<boolean> {
  const host = rawHost.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return true;
  }
  if (net.isIP(host)) return isPrivateAddress(host);

  const cached = hostCache.get(host);
  if (cached && Date.now() - cached.at < HOST_CACHE_MS) return cached.private;

  let result = false;
  try {
    const addresses = await dns.lookup(host, { all: true });
    result = addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    result = false; // unresolvable hosts simply fail to load
  }
  hostCache.set(host, { private: result, at: Date.now() });
  return result;
}

/** Throws with a user-facing message if the URL can't be tested from this server. */
export async function assertSafeTarget(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs can be tested');
  }
  if (!allowPrivateTargets() && (await isPrivateHost(url.hostname))) {
    throw new Error('This URL points to a private or internal address, which this server is not allowed to test');
  }
}
