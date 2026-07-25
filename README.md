# headless-browser-server

A small **Playwright** render service. POST a URL, get back the fully JS-rendered HTML
— for crawling pages whose content loads client-side (Wix, SPAs, some Shopify themes)
where a plain HTTP GET sees nothing.

## Run (local)

```bash
npm install          # installs deps + Chromium (postinstall)
npm start            # listens on :3000 (override with PORT)
```

## Run (Docker)

```bash
docker build -t headless-browser-server .
docker run -p 3000:3000 headless-browser-server
```

## API

`POST /`
```json
{
  "url": "https://example.com/loja",
  "headers": { "user-agent": "…" },        // optional
  "waitForSelector": "[data-hook='product-item']"  // optional but recommended for SPAs
}
```
Returns `{ response_body, status_code, headers, request_time, screenshot_url, final_url }`.

`GET /health` → `{ ok, browser, active, concurrency }`

## Behaviour & tuning (env vars)

| var | default | notes |
|---|---|---|
| `PORT` | 3000 | |
| `CONCURRENCY` | 3 | parallel renders (one browser, N contexts) |
| `NAV_TIMEOUT_MS` | 30000 | navigation timeout |
| `BLOCK_RESOURCES` | true | abort image/media/font requests (faster; DOM only) |
| `SCREENSHOTS` | false | if true, returns a base64 data-URI screenshot |
| `USER_AGENT` | Chrome UA | default UA when the request doesn't set one |
| `LOCALE` | en-US | browser context locale (e.g. `pt-BR`) |
| `HEADFUL` | false | set `true` to see the browser (debugging) |
| `CHROME_PATH` | — | use a system Chrome instead of bundled Chromium |

Rendering strategy: load with `domcontentloaded`, then either wait for
`waitForSelector` (best — pass the product-card selector) or a bounded 8s networkidle
settle. This avoids 30s hangs on chatty pages and double-navigation.

## Notes
- **Use sparingly.** Headless is slow (heavy Wix pages ~30s) and CPU/RAM-hungry. Prefer
  plain HTTP or platform JSON APIs (e.g. Shopify `/products.json`); reach for this only
  when the data truly isn't in the HTML.
- **CAPTCHA / hard anti-bot:** this doesn't solve CAPTCHAs. If a target challenges,
  add `playwright-extra` + `puppeteer-extra-plugin-stealth` (reduces detection), then
  residential proxies, and only as a last resort a solving service (2Captcha/CapSolver).
