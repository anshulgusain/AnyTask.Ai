/**
 * Browser Automation Tools
 *
 * Here you can define the functions / tools that your OpenAI Agent can invoke!
 * Tip: When using Playwright or Puppeteer, each function below interacts with the browser page.
 */

export interface FormFieldDescription {
  selector: string;
  name?: string;
  type?: string;
  placeholder?: string;
  label?: string;
}

/**
 * Tool 1: Inspect the page and extract all interactive form elements
 * 💡 Exercise: Use page.$$eval('input, textarea, select', ...) with Playwright
 */
export async function inspectPageFields(pageContext?: any): Promise<FormFieldDescription[]> {
  // TODO: Implement DOM inspection with your browser instance
  // Example Playwright implementation:
  // return await pageContext.evaluate(() => { ... })
  return [];
}

/**
 * Tool 2: Fill a specific input element by selector
 * 💡 Exercise: Use pageContext.fill(selector, value) with Playwright
 */
export async function fillInput(
  selector: string,
  value: string,
  pageContext?: any
): Promise<{ success: boolean; message: string }> {
  // TODO: Implement element input filling
  // await pageContext.fill(selector, value);
  return { success: true, message: `Filled ${selector}` };
}

/**
 * Tool 3: Click a submit or action button
 * 💡 Exercise: Use pageContext.click(selector) with Playwright
 */
export async function submitForm(
  selector: string = 'button[type="submit"], input[type="submit"]',
  pageContext?: any
): Promise<{ success: boolean; message: string }> {
  // TODO: Implement submit button click
  // await pageContext.click(selector);
  return { success: true, message: `Clicked submit button ${selector}` };
}
