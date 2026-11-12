import type { BrowserContext, Page } from 'playwright';

export interface SiteHealthEvent {
  kind: 'CONSOLE_ERROR' | 'PAGE_ERROR' | 'HTTP_ERROR' | 'REQUEST_FAILED' | 'BROKEN_LINK';
  message: string;
  url: string;
  status?: number;
  count: number;
  firstSeenAt: string;
}

const IGNORED_URL_PATTERN = /(google-analytics|googletagmanager|doubleclick|hotjar|sentry|segment|mixpanel|facebook\.net|clarity\.ms|favicon\.ico)/i;
const MAX_EVENTS = 100;

/**
 * Passively records console errors, uncaught exceptions and failed HTTP requests for
 * every page in the browser context. Feeds both the agent (so it can tell a site bug
 * from its own mistake) and the "site health" section of the report.
 */
export class SiteMonitor {
  private readonly events = new Map<string, SiteHealthEvent>();
  private recent: string[] = [];

  attach(context: BrowserContext): void {
    context.pages().forEach((p) => this.attachPage(p));
    context.on('page', (p) => this.attachPage(p));
  }

  private attachPage(page: Page): void {
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const location = msg.location()?.url || page.url();
      if (IGNORED_URL_PATTERN.test(location)) return;
      // Browsers echo every 401/403 response as a console error; those are expected auth answers.
      if (/status of 40[13]\b/.test(msg.text())) return;
      this.record('CONSOLE_ERROR', msg.text().slice(0, 300), page.url());
    });

    page.on('pageerror', (err) => {
      this.record('PAGE_ERROR', `Uncaught ${err.name}: ${err.message}`.slice(0, 300), page.url());
    });

    page.on('response', (res) => {
      const status = res.status();
      const url = res.url();
      const method = res.request().method();
      const resourceType = res.request().resourceType();
      const message = `${method} ${shortenUrl(url)} → HTTP ${status}`;

      // 401/403 are expected answers to wrong credentials or "am I logged in?" probes: tell the
      // agent (so it knows a login was rejected) but keep them out of the site-health report.
      if (status === 401 || status === 403) {
        if (resourceType === 'xhr' || resourceType === 'fetch') this.recent.push(message);
        return;
      }
      if (status < 400 || IGNORED_URL_PATTERN.test(url)) return;
      const pushToAgent = status >= 500 || resourceType === 'xhr' || resourceType === 'fetch';
      this.record('HTTP_ERROR', message, page.url(), status, pushToAgent);
    });

    page.on('requestfailed', (req) => {
      const url = req.url();
      if (IGNORED_URL_PATTERN.test(url)) return;
      const failure = req.failure()?.errorText || 'failed';
      if (/ERR_ABORTED/i.test(failure)) return;
      this.record('REQUEST_FAILED', `${req.method()} ${shortenUrl(url)} → ${failure}`, page.url());
    });
  }

  private record(kind: SiteHealthEvent['kind'], message: string, url: string, status?: number, pushToAgent = true): void {
    const key = `${kind}::${message}`;
    const existing = this.events.get(key);
    if (existing) {
      existing.count++;
    } else if (this.events.size < MAX_EVENTS) {
      this.events.set(key, { kind, message, url, status, count: 1, firstSeenAt: new Date().toISOString() });
    }
    if (pushToAgent && kind !== 'CONSOLE_ERROR') {
      this.recent.push(message);
    }
  }

  /**
   * Request each same-origin link once and record the ones that are broken.
   * SPAs usually answer every path with index.html (200), so this mainly catches
   * server-rendered 404s/500s and dead static assets.
   */
  async checkLinks(baseUrl: string, hrefs: string[], maxLinks: number = 30): Promise<number> {
    const origin = new URL(baseUrl).origin;
    const urls = Array.from(
      new Set(
        hrefs
          .map((h) => {
            try {
              const u = new URL(h, baseUrl);
              u.hash = '';
              return u.toString();
            } catch {
              return null;
            }
          })
          .filter((u): u is string => Boolean(u) && u!.startsWith(origin))
      )
    ).slice(0, maxLinks);

    let broken = 0;
    await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
          if (res.status >= 400) {
            broken++;
            this.record('BROKEN_LINK', `${shortenUrl(url)} → HTTP ${res.status}`, baseUrl, res.status, false);
          }
        } catch (err: any) {
          broken++;
          this.record('BROKEN_LINK', `${shortenUrl(url)} → ${err.name === 'TimeoutError' ? 'timed out' : err.message}`, baseUrl, undefined, false);
        }
      })
    );
    return broken;
  }

  /** Network errors since the previous call (deduplicated), for the agent's next observation. */
  takeRecentErrors(): string[] {
    const out = Array.from(new Set(this.recent)).slice(-8);
    this.recent = [];
    return out;
  }

  getEvents(): SiteHealthEvent[] {
    return Array.from(this.events.values());
  }
}

function shortenUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const p = u.pathname.length > 80 ? `${u.pathname.slice(0, 80)}…` : u.pathname;
    return `${u.host}${p}`;
  } catch {
    return raw.slice(0, 100);
  }
}
