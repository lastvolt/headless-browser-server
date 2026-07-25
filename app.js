const express = require('express');
const { chromium } = require('playwright');

// --- config (env-tunable) --------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10);
const NAV_TIMEOUT = parseInt(process.env.NAV_TIMEOUT_MS || '30000', 10);
// Block images/media/fonts by default — we only need the DOM, and it's much faster.
const BLOCK_RESOURCES = process.env.BLOCK_RESOURCES !== 'false';
const SCREENSHOTS = process.env.SCREENSHOTS === 'true';
const DEFAULT_UA =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const LOCALE = process.env.LOCALE || 'en-US';

const app = express();
app.use(express.json({ limit: '2mb' }));

let browser;

// --- tiny concurrency limiter ---------------------------------------------
let active = 0;
const waiters = [];
function acquire() {
  return new Promise((resolve) => {
    if (active < CONCURRENCY) {
      active++;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });
}
function release() {
  active--;
  if (waiters.length) {
    active++;
    waiters.shift()();
  }
}

// --- render one URL --------------------------------------------------------
async function render({ url, headers = {}, waitForSelector }) {
  const context = await browser.newContext({
    userAgent: headers['user-agent'] || headers['User-Agent'] || DEFAULT_UA,
    extraHTTPHeaders: headers,
    viewport: { width: 1920, height: 1080 },
    locale: LOCALE,
    ignoreHTTPSErrors: true,
  });

  if (BLOCK_RESOURCES) {
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });
  }

  const page = await context.newPage();
  const start = Date.now();

  // Load fast, then let client-side JS render. Either wait for a caller-specified
  // selector (best) or a bounded networkidle settle — avoids 30s hangs on chatty
  // pages (analytics/chat sockets that never go idle) and double-navigation.
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => null);

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 15000 }).catch(() => {});
  } else {
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  }

  const response_body = await page.content();
  const status_code = response ? response.status() : 0;
  const respHeaders = response ? response.headers() : {};

  let screenshot_url = null;
  if (SCREENSHOTS) {
    const buf = await page.screenshot({ fullPage: true });
    screenshot_url = 'data:image/png;base64,' + buf.toString('base64');
  }

  const result = {
    response_body,
    status_code,
    headers: respHeaders,
    request_time: Date.now() - start,
    screenshot_url,
    final_url: page.url(),
  };

  await context.close();
  return result;
}

// --- http ------------------------------------------------------------------
app.post('/', async (req, res) => {
  const { url, headers, waitUntil, waitForSelector } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL parameter is required.' });

  await acquire();
  try {
    const result = await render({ url, headers, waitUntil, waitForSelector });
    console.log(`[render] ${url} -> ${result.status_code} (${result.request_time}ms)`);
    res.status(200).json(result);
  } catch (err) {
    console.error(`[render error] ${url}: ${err}`);
    res.status(500).json({ error: String(err) });
  } finally {
    release();
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, browser: !!browser, active, concurrency: CONCURRENCY }));

// --- lifecycle -------------------------------------------------------------
(async () => {
  browser = await chromium.launch({
    headless: process.env.HEADFUL !== 'true',
    // CHROME_PATH: use a system Chrome instead of the bundled Chromium (documented in README).
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  app.listen(PORT, () =>
    console.log(`Playwright render server on :${PORT} (concurrency=${CONCURRENCY}, blockResources=${BLOCK_RESOURCES})`)
  );
})();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (browser) await browser.close();
    process.exit(0);
  });
}
