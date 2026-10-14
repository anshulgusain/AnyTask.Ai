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
        'button, input[type="submit"], input[type="button"], [role="button"]'
      )
    );

    const actions = actionElements.map((el) => {
      const text = el.textContent?.trim() || (el as HTMLInputElement).value || '';
      const selector = el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ').join('.')}` : 'button';
      const type = (el.getAttribute('type') === 'submit' ? 'submit' : 'button') as 'submit' | 'button';

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

/**
 * Tool 2: Navigate to a URL and wait for DOM hydration
 */
export async function navigateTo(
  page: Page,
  url: string,
  timeoutMs: number = 15000
): Promise<{ success: boolean; url: string; title: string; message: string }> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(500); // brief settling time
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
 * Tool 4: Click an action or button with Playwright
 */
export async function clickElement(
  page: Page,
  selector: string
): Promise<{ success: boolean; message: string }> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
    await page.click(selector);
    return { success: true, message: `Clicked element ${selector}` };
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
 * Tool 8: Wait for an element to reach a specific state ('visible' | 'detached' | 'attached')
 */
export async function waitForElement(
  page: Page,
  selector: string,
  state: 'visible' | 'detached' | 'attached' = 'visible',
  timeoutMs: number = 5000
): Promise<{ success: boolean; message: string }> {
  try {
    await page.waitForSelector(selector, { state, timeout: timeoutMs });
    return { success: true, message: `Element ${selector} reached state "${state}"` };
  } catch (err: any) {
    return { success: false, message: `Element ${selector} timed out waiting for "${state}": ${err.message}` };
  }
}


