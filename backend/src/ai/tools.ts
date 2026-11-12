import type { Page } from 'playwright';
import path from 'path';
import { screenshotStore } from '../storage.js';

// Browser and network helpers shared by the agent. Element interaction itself lives in
// agentLoop.ts, which acts on refs from pageObserver.ts instead of CSS selectors.

// Interstitial shown by Render (and similar hosts) while a sleeping free-tier service boots.
const COLD_START_PATTERN = /(service (is )?waking up|spinning up|application loading|starting up your app|please wait while your application starts)/i;

/**
 * Poll the target until it actually serves the app. Free-tier hosts like Render sleep
 * after inactivity and take 30-90s to boot, which otherwise makes the first goto() time out.
 */
export async function waitForSiteReady(
  url: string,
  onWaiting?: (attempt: number, reason: string) => Promise<void>,
  maxWaitMs: number = 120_000
): Promise<{ ready: boolean; status?: number; waitedMs: number; message: string }> {
  const start = Date.now();
  let attempt = 0;
  let lastReason = 'no response yet';

  while (Date.now() - start < maxWaitMs) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 AnyTaskQA' },
      });
      const body = await res.text().catch(() => '');
      const isGatewayError = [502, 503, 504].includes(res.status);
      const isColdStartPage = COLD_START_PATTERN.test(body.slice(0, 20_000));

      if (!isGatewayError && !isColdStartPage) {
        return {
          ready: true,
          status: res.status,
          waitedMs: Date.now() - start,
          message: `Site responded with HTTP ${res.status} after ${Math.round((Date.now() - start) / 1000)}s`,
        };
      }
      lastReason = isColdStartPage ? 'host is waking the service up' : `HTTP ${res.status}`;
    } catch (err: any) {
      lastReason = err.name === 'AbortError' ? 'request timed out' : err.message;
    } finally {
      clearTimeout(timer);
    }

    if (onWaiting) await onWaiting(attempt, lastReason);
    await new Promise((r) => setTimeout(r, 5_000));
  }

  return {
    ready: false,
    waitedMs: Date.now() - start,
    message: `Site did not become ready within ${Math.round(maxWaitMs / 1000)}s (last: ${lastReason})`,
  };
}

const SLEEPY_HOST_PATTERN =
  /https?:\/\/[a-z0-9.-]+\.(?:onrender\.com|railway\.app|up\.railway\.app|herokuapp\.com|fly\.dev|koyeb\.app|glitch\.me)/gi;

/**
 * Find separately hosted backends (e.g. a Render API behind a static frontend) referenced
 * in the page HTML or its first-party JS bundles. Those sleep independently of the frontend,
 * so the first API call during a test would otherwise hang.
 */
export async function discoverBackendOrigins(url: string, maxBundles: number = 5): Promise<string[]> {
  const targetOrigin = new URL(url).origin;
  const origins = new Set<string>();
  const collect = (text: string) => {
    for (const match of text.matchAll(SLEEPY_HOST_PATTERN)) {
      const origin = new URL(match[0]).origin;
      if (origin !== targetOrigin) origins.add(origin);
    }
  };

  try {
    const html = await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).text();
    collect(html);

    const scriptSrcs = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))
      .map((m) => new URL(m[1], url))
      .filter((u) => u.origin === targetOrigin)
      .slice(0, maxBundles);

    await Promise.all(
      scriptSrcs.map(async (src) => {
        try {
          const js = await (await fetch(src, { signal: AbortSignal.timeout(20_000) })).text();
          collect(js);
        } catch {
          // Bundle fetch failures just mean we can't pre-warm that backend.
        }
      })
    );
  } catch {
    return [];
  }

  return Array.from(origins);
}

/**
 * Wait for a client-rendered page to finish hydrating: network goes quiet and at least
 * one interactive element is on screen. Both waits are capped so chatty pages don't hang.
 */
export async function waitForPageSettled(page: Page, maxWaitMs: number = 8_000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: maxWaitMs }).catch(() => {});
  await page
    .waitForSelector('input, textarea, select, button, a[href], [role="button"]', {
      state: 'visible',
      timeout: Math.min(maxWaitMs, 5_000),
    })
    .catch(() => {});
}

/**
 * Navigate to a URL and wait for client-side hydration.
 */
export async function navigateTo(
  page: Page,
  url: string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; url: string; title: string; message: string }> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await waitForPageSettled(page);
    const title = await page.title();
    return {
      success: true,
      url: page.url(),
      title,
      message: `Navigated to ${url} ("${title}")`,
    };
  } catch (err: any) {
    return {
      success: false,
      url: page.url(),
      title: '',
      message: `Failed navigating to ${url}: ${err.message}`,
    };
  }
}

/**
 * Capture a screenshot into the configured screenshot store.
 * Only the basename of filePath is significant; it's the key used to serve it back.
 */
export async function captureScreenshot(
  page: Page,
  filePath: string
): Promise<{ success: boolean; path: string; message: string }> {
  try {
    const data = await page.screenshot({ fullPage: false });
    await screenshotStore().save(path.basename(filePath), data);
    return { success: true, path: filePath, message: `Screenshot saved as ${path.basename(filePath)}` };
  } catch (err: any) {
    return { success: false, path: '', message: `Failed to capture screenshot: ${err.message}` };
  }
}
