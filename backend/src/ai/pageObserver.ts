import type { Locator, Page } from 'playwright';

// ---------------------------------------------------------------------------
// Page Observer
// ---------------------------------------------------------------------------
// Turns the live page into a compact, numbered list of interactive elements the
// LLM can act on ("[12] button "Sign Up""). Each element is tagged in the DOM with
// a ref attribute, so actions target exactly what the model saw instead of a
// selector the model had to guess.
// ---------------------------------------------------------------------------

export const REF_ATTR = 'data-anytask-ref';

export interface ObservedElement {
  ref: number;
  tag: string;
  role?: string;
  type?: string;
  name: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  href?: string;
  options?: string[];
  inModal?: boolean;
  region?: string;
}

export interface PageObservation {
  url: string;
  title: string;
  headings: string[];
  alerts: string[];
  text: string;
  elements: ObservedElement[];
  hasModal: boolean;
  truncatedElements: number;
}

export async function observePage(page: Page, maxElements: number = 150): Promise<PageObservation> {
  const url = page.url();
  const title = await page.title().catch(() => '');

  // tsx/esbuild (keepNames) wraps nested functions in __name(), which doesn't exist in the page.
  await page.evaluate('window.__name = window.__name || ((fn) => fn)').catch(() => {});

  const data = await page.evaluate(
    ({ refAttr, maxElements }) => {
      const clean = (s: string | null | undefined, max = 80) =>
        (s || '').replace(/\s+/g, ' ').trim().slice(0, max);

      const isVisible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        const style = window.getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
      };

      document.querySelectorAll(`[${refAttr}]`).forEach((el) => el.removeAttribute(refAttr));

      const modal = Array.from(
        document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]')
      ).find(isVisible);

      const interactiveSelector = [
        'a[href]',
        'button',
        'input:not([type="hidden"])',
        'textarea',
        'select',
        'summary',
        '[role="button"]',
        '[role="link"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[role="option"]',
        '[role="combobox"]',
        '[contenteditable="true"]',
        '[onclick]',
      ].join(',');

      const candidates = new Set<Element>(Array.from(document.querySelectorAll(interactiveSelector)));

      // React/Vue apps often attach click handlers to plain divs; cursor:pointer is the best signal.
      document.querySelectorAll('div, span, li, img, svg, label').forEach((el) => {
        if (candidates.has(el)) return;
        if (window.getComputedStyle(el).cursor !== 'pointer') return;
        const parent = el.parentElement;
        if (parent && window.getComputedStyle(parent).cursor === 'pointer') return;
        if (el.closest(interactiveSelector)) return;
        candidates.add(el);
      });

      const nearbyLabel = (el: Element): string => {
        let node: Element | null = el.parentElement;
        for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
          if (node.querySelectorAll('input, textarea, select').length > 1) break;
          const candidates = Array.from(node.querySelectorAll('label, span, p, div, h4, h5, h6, legend'));
          for (const c of candidates) {
            if (c.contains(el) || c.querySelector('input, textarea, select, button')) continue;
            if (!(c.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
            const text = clean(c.textContent, 60);
            if (text && text.length >= 2) return text;
          }
        }
        return '';
      };

      const regionFor = (el: Element): string | undefined => {
        const region = el.closest('header, nav, footer, form, aside, [role="dialog"], [role="navigation"], [role="banner"], [role="contentinfo"]');
        if (!region) return undefined;
        const role = region.getAttribute('role');
        if (role === 'navigation') return 'nav';
        if (role === 'banner') return 'header';
        if (role === 'contentinfo') return 'footer';
        if (role === 'dialog') return 'dialog';
        return region.tagName.toLowerCase();
      };

      const labelFor = (el: Element): string => {
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent || '')
            .join(' ');
          if (text.trim()) return text;
        }
        if (el.id) {
          const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (label?.textContent?.trim()) return label.textContent;
        }
        const wrappingLabel = el.closest('label');
        if (wrappingLabel?.textContent?.trim()) return wrappingLabel.textContent;
        const input = el as HTMLInputElement;
        const isField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
        if (isField) {
          // Many apps render a visual label next to the field without for=/id wiring.
          const visual = nearbyLabel(el);
          if (visual) return input.placeholder ? `${visual} (placeholder: ${input.placeholder})` : visual;
        }
        if (input.placeholder) return input.placeholder;
        if (el.tagName === 'SELECT') return el.getAttribute('name') || el.id || '';
        const text = (el as HTMLElement).innerText;
        if (text?.trim()) return text;
        if (input.value && (input.type === 'submit' || input.type === 'button')) return input.value;
        return el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('name') || '';
      };

      const elements: any[] = [];
      let truncated = 0;
      let behindModalCount = 0;
      const ordered = Array.from(candidates);
      if (modal) ordered.sort((a, b) => Number(modal.contains(b)) - Number(modal.contains(a)));

      for (const el of ordered) {
        const input = el as HTMLInputElement;
        const isToggle = input.type === 'checkbox' || input.type === 'radio';
        // Custom checkboxes often hide the real <input>; keep it if a label makes it clickable.
        if (!isVisible(el) && !(isToggle && el.closest('label, [role]'))) continue;
        if (modal && !modal.contains(el)) {
          // Elements behind an open modal are usually not clickable; only list a few.
          if (behindModalCount >= 15) continue;
          behindModalCount++;
        }
        if (elements.length >= maxElements) {
          truncated++;
          continue;
        }

        const ref = elements.length + 1;
        el.setAttribute(refAttr, String(ref));
        const tag = el.tagName.toLowerCase();
        const item: any = {
          ref,
          tag,
          name: clean(labelFor(el)),
          inModal: modal ? modal.contains(el) : undefined,
          region: regionFor(el),
        };
        const role = el.getAttribute('role');
        if (role) item.role = role;
        if (tag === 'input') item.type = input.type;
        if (tag === 'input' || tag === 'textarea') {
          item.value = input.type === 'password' ? (input.value ? '••••••' : '') : clean(input.value, 60);
          if (isToggle) item.checked = input.checked;
        }
        if (tag === 'select') {
          const select = el as HTMLSelectElement;
          item.value = clean(select.selectedOptions[0]?.textContent, 40);
          item.options = Array.from(select.options).slice(0, 15).map((o) => clean(o.textContent, 40));
        }
        if (role === 'checkbox' || role === 'switch' || role === 'radio') {
          item.checked = el.getAttribute('aria-checked') === 'true';
        }
        if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') item.disabled = true;
        if (input.required || el.getAttribute('aria-required') === 'true') item.required = true;
        if (tag === 'a') {
          const href = el.getAttribute('href') || '';
          if (href && !href.startsWith('javascript:')) item.href = href.slice(0, 80);
        }
        elements.push(item);
      }

      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .filter(isVisible)
        .slice(0, 10)
        .map((h) => clean(h.textContent, 100))
        .filter(Boolean);

      const alerts = Array.from(
        document.querySelectorAll(
          '[role="alert"], [aria-live="assertive"], [aria-live="polite"], .error, .alert, .toast, [class*="error" i], [class*="toast" i], [class*="alert" i], [class*="invalid" i]'
        )
      )
        .filter(isVisible)
        .map((a) => clean((a as HTMLElement).innerText, 160))
        .filter(Boolean);

      return {
        headings,
        alerts: Array.from(new Set(alerts)).slice(0, 8),
        text: clean(document.body?.innerText, 2500),
        elements,
        hasModal: Boolean(modal),
        truncatedElements: truncated,
      };
    },
    { refAttr: REF_ATTR, maxElements }
  );

  return { url, title, ...data };
}

export function locatorForRef(page: Page, ref: number): Locator {
  return page.locator(`[${REF_ATTR}="${ref}"]`).first();
}

export function describeElement(el: ObservedElement): string {
  const kind = el.type ? `${el.tag}[type=${el.type}]` : el.role ? `${el.tag}[role=${el.role}]` : el.tag;
  const parts = [`[${el.ref}] ${kind} "${el.name}"`];
  if (el.region) parts.push(`(in ${el.region})`);
  if (el.value !== undefined && el.value !== '') parts.push(`value="${el.value}"`);
  if (el.checked !== undefined) parts.push(el.checked ? 'checked' : 'unchecked');
  if (el.options) parts.push(`options=[${el.options.join(' | ')}]`);
  if (el.href) parts.push(`href=${el.href}`);
  if (el.required) parts.push('required');
  if (el.disabled) parts.push('disabled');
  return parts.join(' ');
}

/**
 * Text form of an observation that is sent to the LLM each turn.
 */
export function formatObservation(obs: PageObservation): string {
  const lines: string[] = [];
  lines.push(`URL: ${obs.url}`);
  lines.push(`Title: ${obs.title}`);
  if (obs.headings.length) lines.push(`Headings: ${obs.headings.join(' | ')}`);
  if (obs.alerts.length) lines.push(`Alerts / messages on screen: ${obs.alerts.join(' | ')}`);
  if (obs.hasModal) lines.push('A modal/dialog is open — its elements are listed first.');
  lines.push('');
  lines.push('Interactive elements:');
  const modalEls = obs.elements.filter((e) => e.inModal);
  const pageEls = obs.elements.filter((e) => !e.inModal);
  if (modalEls.length) {
    lines.push('-- inside modal --');
    modalEls.forEach((e) => lines.push(describeElement(e)));
    lines.push('-- page behind modal --');
  }
  pageEls.forEach((e) => lines.push(describeElement(e)));
  if (obs.truncatedElements > 0) lines.push(`(${obs.truncatedElements} more elements not shown — scroll to reveal)`);
  if (obs.elements.length === 0) lines.push('(none found — page may still be loading)');
  lines.push('');
  lines.push(`Visible text (truncated): ${obs.text}`);
  return lines.join('\n');
}
