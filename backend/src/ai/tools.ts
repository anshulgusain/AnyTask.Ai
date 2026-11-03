import type { Page } from 'playwright';

export interface DiscoveredInput {
  selector: string;
  id?: string;
  name?: string;
  type: string;
  placeholder?: string;
  label?: string;
  required: boolean;
}

export interface DiscoveredAction {
  selector: string;
  id?: string;
  text: string;
  type: 'submit' | 'button' | 'link';
}

export interface DiscoveredLink {
  text: string;
  href: string;
  isInternal: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  inputs: DiscoveredInput[];
  actions: DiscoveredAction[];
  links: DiscoveredLink[];
}

/**
 * Tool 1: Inspect the page and extract all interactive form elements,
 * buttons, and navigation links.
 */
export async function inspectPageElements(page: Page): Promise<PageSnapshot> {
  const currentUrl = page.url();
  const title = await page.title();

  const snapshot = await page.evaluate((url) => {
    // 1. Extract inputs
    const inputElements = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([type="hidden"]), textarea, select'
      )
    );

    const inputs = inputElements.map((el) => {
      let labelText = '';
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) labelText = label.textContent?.trim() || '';
      }
      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel) labelText = parentLabel.textContent?.trim() || '';
      }

      const selector = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : el.tagName.toLowerCase();

      return {
        selector,
        id: el.id || undefined,
        name: el.name || undefined,
        type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        label: labelText || undefined,
        required: (el as HTMLInputElement).required || false,
      };
    });

    // 2. Extract buttons and actionable click targets
    const actionElements = Array.from(
      document.querySelectorAll<HTMLButtonElement | HTMLElement>(
        'button, input[type="submit"], input[type="button"], [role="button"], a[href]'
      )
    );

    const actions = actionElements.map((el) => {
      const text = el.textContent?.trim() || (el as HTMLInputElement).value || '';
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') === 'submit' ? 'submit' : 'button') as 'submit' | 'button';

      let selector = tag;
      if (el.id && !el.id.includes('/') && !el.id.includes(':')) {
        selector = `#${CSS.escape(el.id)}`;
      } else if (text && text.length > 0 && text.length < 35) {
        // Robust text-based selector that never breaks on Tailwind classes
        const escapedText = text.replace(/"/g, '\\"').replace(/\n/g, ' ').trim();
        selector = `${tag}:has-text("${escapedText}")`;
      } else if (el.className && typeof el.className === 'string') {
        const safeClasses = el.className
          .split(/\s+/)
          .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c) && !c.includes(':') && !c.includes('/'));
        if (safeClasses.length > 0) {
          selector = `${tag}.${safeClasses.slice(0, 2).join('.')}`;
        }
      }

      return {
        selector,
        id: el.id || undefined,
        text,
        type,
      };
    });

    // 3. Extract links
    const linkElements = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const currentOrigin = new URL(url).origin;

    const links = linkElements
      .map((a) => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent?.trim() || '';
        const isInternal = href.startsWith('/') || href.startsWith(currentOrigin);
        return { text, href, isInternal };
      })
      .filter((link) => link.href && !link.href.startsWith('#') && !link.href.startsWith('javascript:'));

    return { inputs, actions, links };
  }, currentUrl);

  return {
    url: currentUrl,
    title,
    ...snapshot,
  };
}

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
 * Tool 2: Navigate to a URL and wait for DOM hydration
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
 * Tool 3: Fill a form input safely with Playwright
 */
export async function fillInput(
  page: Page,
  selector: string,
  value: string
): Promise<{ success: boolean; message: string }> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
    await page.fill(selector, value);
    return { success: true, message: `Successfully filled ${selector}` };
  } catch (err: any) {
    return { success: false, message: `Failed to fill ${selector}: ${err.message}` };
  }
}

/**
 * Tool 4: Click an action or button with Playwright (with resilient Tailwind & text fallbacks)
 */
export async function clickElement(
  page: Page,
  selector: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Sanitize selector if it contains unescaped Tailwind slashes, colons, or brackets
    let cleanSelector = selector;
    if (cleanSelector.includes('/') || cleanSelector.includes(':hover') || (cleanSelector.includes(':') && !cleanSelector.startsWith('button:') && !cleanSelector.startsWith('a:'))) {
      const parts = cleanSelector.split('.').filter((p) => p && !p.includes('/') && !p.includes(':') && !p.includes('['));
      if (parts.length > 0) {
        cleanSelector = `.${parts.join('.')}`;
      }
    }

    try {
      await page.waitForSelector(cleanSelector, { state: 'visible', timeout: 4000 });
      await page.click(cleanSelector, { timeout: 4000 });
      return { success: true, message: `Clicked element ${cleanSelector}` };
    } catch (primaryErr: any) {
      // Fallback 1: Extract text from :has-text("...") or description and locate via text
      const textMatch = selector.match(/:has-text\("([^"]+)"\)/);
      if (textMatch && textMatch[1]) {
        await page.getByText(textMatch[1], { exact: false }).first().click({ timeout: 3000 });
        return { success: true, message: `Clicked element via text match: "${textMatch[1]}"` };
      }

      // Fallback 2: Try DOM-level click evaluation
      const domClicked = await page.evaluate((rawSel) => {
        try {
          const el = document.querySelector(rawSel) as HTMLElement;
          if (el) {
            el.click();
            return true;
          }
        } catch {
          // If raw selector failed, try finding button/link by text snippet
          const match = rawSel.match(/["']([^"']+)["']/);
          if (match && match[1]) {
            const candidate = Array.from(document.querySelectorAll('button, a, [role="button"]')).find((b) =>
              (b.textContent || '').toLowerCase().includes(match[1].toLowerCase())
            ) as HTMLElement;
            if (candidate) {
              candidate.click();
              return true;
            }
          }
        }
        return false;
      }, selector);

      if (domClicked) {
        return { success: true, message: `Clicked element via DOM click fallback` };
      }

      throw primaryErr;
    }
  } catch (err: any) {
    return { success: false, message: `Failed to click ${selector}: ${err.message}` };
  }
}

/**
 * Tool 5: Select an option in a dropdown <select>
 */
export async function selectOption(
  page: Page,
  selector: string,
  value: string
): Promise<{ success: boolean; message: string }> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
    await page.selectOption(selector, value);
    return { success: true, message: `Selected option "${value}" on ${selector}` };
  } catch (err: any) {
    return { success: false, message: `Failed to select option on ${selector}: ${err.message}` };
  }
}

/**
 * Tool 6: Extract inner text content of an element (for assertions & verification)
 */
export async function getTextContent(
  page: Page,
  selector: string
): Promise<{ success: boolean; text?: string; message: string }> {
  try {
    await page.waitForSelector(selector, { state: 'attached', timeout: 5000 });
    const text = (await page.textContent(selector)) || '';
    return { success: true, text: text.trim(), message: `Read text from ${selector}` };
  } catch (err: any) {
    return { success: false, message: `Could not read text from ${selector}: ${err.message}` };
  }
}

/**
 * Tool 7: Capture milestone screenshot and save to disk
 */
export async function captureScreenshot(
  page: Page,
  filePath: string
): Promise<{ success: boolean; path: string; message: string }> {
  try {
    await page.screenshot({ path: filePath, fullPage: false });
    return { success: true, path: filePath, message: `Screenshot saved to ${filePath}` };
  } catch (err: any) {
    return { success: false, path: '', message: `Failed to capture screenshot: ${err.message}` };
  }
}

/**
 * Tool 8: Wait for an element to reach a specific state ('visible' | 'hidden' | 'detached' | 'attached')
 */
export async function waitForElement(
  page: Page,
  selector: string,
  state: 'visible' | 'hidden' | 'detached' | 'attached' = 'visible',
  timeoutMs: number = 5000
): Promise<{ success: boolean; message: string }> {
  try {
    await page.waitForSelector(selector, { state, timeout: timeoutMs });
    return { success: true, message: `Element ${selector} reached state "${state}"` };
  } catch (err: any) {
    return { success: false, message: `Element ${selector} timed out waiting for "${state}": ${err.message}` };
  }
}


