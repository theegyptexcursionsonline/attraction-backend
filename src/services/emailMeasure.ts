import { chromium, Browser } from 'playwright-core';

/**
 * Measures an email the way a phone renders it.
 *
 * EMAIL-DESIGN-STANDARD §3 sets its budgets "measured at 390px on the rendered output, not
 * estimated", and §6 requires the test suite to assert them. Estimating from the markup is how
 * a 2,149px booking confirmation passed review, so this runs a real layout engine.
 */

/** The reference phone viewport the standard is written against. */
export const MOBILE_WIDTH = 390;
/** Usable height of that first screen, before any scrolling. */
export const FIRST_SCREEN = 844;

export interface EmailMetrics {
  /** Full rendered height of the email at 390px, in CSS pixels. */
  height: number;
  /** Distance from the top of the document to the top of the <h1>. */
  chromeHeight: number;
  /** Bottom edge of the last element that must appear in the first screen. */
  keyFactBottom: number;
  /** True when the document scrolls sideways at 390px. */
  horizontalOverflow: boolean;
}

let shared: Browser | null = null;

/** One browser for a whole run; measuring 48 documents should not launch 48 of them. */
export const measurementBrowser = async (): Promise<Browser> => {
  if (!shared || !shared.isConnected()) shared = await chromium.launch();
  return shared;
};

export const closeMeasurementBrowser = async (): Promise<void> => {
  if (shared) {
    await shared.close().catch(() => undefined);
    shared = null;
  }
};

/**
 * Render `html` at 390px and report its real geometry.
 *
 * `keyFactBottom` is the bottom of the first fact block (or of the headline when a template has
 * no fact block), which is what §3 requires inside the first screen along with the outcome and
 * the reference.
 */
export const measureEmail = async (html: string, browser?: Browser): Promise<EmailMetrics> => {
  const instance = browser || (await measurementBrowser());
  const page = await instance.newPage({
    viewport: { width: MOBILE_WIDTH, height: FIRST_SCREEN },
    deviceScaleFactor: 2,
  });
  try {
    // Images are decoration and may be remote; blocking them keeps measurement deterministic and
    // offline, and matches the "complete with images blocked" rule the templates are built for.
    await page.route('**/*', (route) =>
      ['image', 'font', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue()
    );
    await page.setContent(html, { waitUntil: 'load' });
    // Evaluated as a source string on purpose: this runs in the browser, and the backend's
    // tsconfig has no "dom" lib. Widening it for the whole API to type one measurement callback
    // would let DOM globals leak into server code.
    return (await page.evaluate(`(() => {
      const doc = document.documentElement;
      const heading = document.querySelector('h1');
      const factBlock = document.querySelector('.fx-factblock');
      const box = (el) => el ? el.getBoundingClientRect() : null;
      const topOf = (el) => { const r = box(el); return r ? Math.round(r.top + window.scrollY) : 0; };
      const bottomOf = (el) => { const r = box(el); return r ? Math.round(r.top + window.scrollY + r.height) : 0; };
      return {
        height: Math.round(Math.max(doc.scrollHeight, document.body.scrollHeight)),
        chromeHeight: topOf(heading),
        keyFactBottom: bottomOf(factBlock) || bottomOf(heading),
        horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      };
    })()`)) as EmailMetrics;
  } finally {
    await page.close();
  }
};
