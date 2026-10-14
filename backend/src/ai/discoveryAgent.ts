import { chromium, Browser, Page } from 'playwright';
import { inspectPageElements, PageSnapshot } from './tools.js';
import type { LogCallback } from './browserAgent.js';

export interface SiteMap {
  baseUrl: string;
  totalPages: number;
  pages: Record<string, PageSnapshot>;
  discoveredAt: string;
}

export interface DiscoveryOptions {
  maxPages?: number;
  headless?: boolean;
}

/**
 * ---------------------------------------------------------------------------
 * Autonomous Discovery Agent (Day 2)
 * ---------------------------------------------------------------------------
 * Crawls a given web application starting from `entryUrl`.
 * It maps all reachable internal routes, identifying all interactive form inputs,
 * buttons, and navigational links to produce a machine-readable SiteMap.
 *
 * This SiteMap is then fed into the Journey Planner (Day 3) so the AI can
 * formulate realistic, high-coverage test cases automatically.
 */
export async function runDiscoveryAgent(
  entryUrl: string,
  log?: LogCallback,
  options: DiscoveryOptions = {}
): Promise<SiteMap> {
  const maxPages = options.maxPages ?? 6;
  const isHeadless = options.headless ?? true;

  const emitLog: LogCallback = async (step, msg, level = 'INFO', meta) => {
    if (log) {
      await log(step, msg, level, meta);
    } else {
      console.log(`[${step}] (${level}) ${msg}`);
    }
  };

  await emitLog('DISCOVERY_START', `Starting autonomous discovery crawl from: ${entryUrl}`, 'INFO', {
    entryUrl,
    maxPages,
  });

  const parsedEntry = new URL(entryUrl);
  const baseOrigin = parsedEntry.origin;

  const visitedUrls = new Set<string>();
  const queue: string[] = [entryUrl];
  const pagesMap: Record<string, PageSnapshot> = {};

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: isHeadless });
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    while (queue.length > 0 && visitedUrls.size < maxPages) {
      const currentUrl = queue.shift()!;
      const normalizedUrl = normalizeUrl(currentUrl);

      if (visitedUrls.has(normalizedUrl)) {
        continue;
      }

      visitedUrls.add(normalizedUrl);
      await emitLog('CRAWL_PAGE', `Inspecting route (${visitedUrls.size}/${maxPages}): ${normalizedUrl}`, 'INFO', {
        url: normalizedUrl,
      });

      try {
        await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        // Brief pause to allow hydration
        await page.waitForTimeout(500);

        const snapshot = await inspectPageElements(page);
        pagesMap[normalizedUrl] = snapshot;

        await emitLog(
          'PAGE_DISCOVERED',
          `Discovered ${snapshot.inputs.length} inputs, ${snapshot.actions.length} buttons, ${snapshot.links.length} links on "${snapshot.title || normalizedUrl}"`,
          'SUCCESS',
          {
            url: normalizedUrl,
            inputs: snapshot.inputs.length,
            actions: snapshot.actions.length,
            links: snapshot.links.length,
          }
        );

        // Queue newly discovered internal links
        for (const link of snapshot.links) {
          if (!link.isInternal) continue;

          try {
            const absoluteUrl = new URL(link.href, baseOrigin).toString();
            const norm = normalizeUrl(absoluteUrl);
            if (!visitedUrls.has(norm) && !queue.includes(norm) && absoluteUrl.startsWith(baseOrigin)) {
              queue.push(norm);
            }
          } catch {
            // Ignore malformed hrefs
          }
        }
      } catch (pageErr: any) {
        await emitLog('CRAWL_ERROR', `Failed crawling ${normalizedUrl}: ${pageErr.message}`, 'WARN');
      }
    }

    await emitLog(
      'DISCOVERY_COMPLETE',
      `Autonomous discovery complete. Mapped ${Object.keys(pagesMap).length} unique routes.`,
      'SUCCESS',
      { totalPages: Object.keys(pagesMap).length }
    );

    return {
      baseUrl: entryUrl,
      totalPages: Object.keys(pagesMap).length,
      pages: pagesMap,
      discoveredAt: new Date().toISOString(),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Strips hash and trailing slashes for canonical page URL comparison
 */
function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return `${u.origin}${pathname}`;
  } catch {
    return rawUrl;
  }
}
