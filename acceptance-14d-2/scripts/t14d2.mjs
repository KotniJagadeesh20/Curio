// Step 14d-2 targeted browser checks: Share (native sheet, clipboard, manual-copy popover with Copy retry, repeated
// clicks, mobile). Uses the 14c seed (seed14c.mjs). Non-mutating. Usage: node t14d2.mjs <screenshots dir>
import { chromium } from 'playwright-core';
const BASE = 'http://localhost:8080', SHOTS = process.argv[2];
const PAGE = '/@admin/lisbon/day-one/arrival', COLL = '/@admin/lisbon';
const PAGE_URL = BASE + PAGE, COLL_URL = BASE + COLL;
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });

/**
 * mode: 'native'      navigator.share stub recording calls (resolves after `delay` ms, or rejects with AbortError if `cancel`)
 *       'clipboard'   no navigator.share; real clipboard (permissions granted)
 *       'blocked'     no navigator.share; clipboard.writeText rejects until window.__allowCopy = true
 */
async function session(mode, { viewport = { width: 1280, height: 900 }, delay = 0, cancel = false } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await ctx.addInitScript(({ mode, delay, cancel }) => {
    window.__shares = [];
    if (mode === 'native') {
      Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { window.__shares.push(d); return new Promise((res, rej) => setTimeout(() => (cancel ? rej(new DOMException('closed', 'AbortError')) : res()), delay)); } });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    } else {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    }
    if (mode === 'blocked') {
      window.__allowCopy = false; window.__copyAttempts = 0;
      const real = navigator.clipboard.writeText.bind(navigator.clipboard);
      Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: (t) => { window.__copyAttempts++; return window.__allowCopy ? real(t) : Promise.reject(new DOMException('denied', 'NotAllowedError')); } });
    }
  }, { mode, delay, cancel });
  const page = await ctx.newPage();
  const s = { ctx, page, errors: [], failed: [], mediaReqs: [] };
  page.on('console', (m) => m.type() === 'error' && s.errors.push(m.text()));
  page.on('pageerror', (e) => s.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/media/')) s.mediaReqs.push(r.url()); });
  page.on('response', (r) => { const u = new URL(r.url()); if (r.status() >= 400 && /localhost:808[01]/.test(u.host)) s.failed.push(`${r.status()} ${u.pathname}`); });
  return s;
}
const open = async (p, path, title) => { await p.goto(BASE + path); await p.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 10000 }); };
const shareBtn = (p, what = 'page') => p.getByRole('button', { name: what === 'page' ? 'Share this page' : 'Share this collection' });
const toastCount = (p) => p.getByText('Link copied').count();
const clean = (s) => s.errors.length === 0 && s.failed.length === 0 && s.mediaReqs.length === 0;

// ---- 1. native share sheet
{
  const S = await session('native');
  const p = S.page;
  await open(p, '/@ADMIN/lisbon/day-one/arrival', 'Arrival');
  await shareBtn(p).click(); await p.waitForTimeout(300);
  const calls = await p.evaluate(() => window.__shares);
  check('Native share: called once with "<page> · <collection>" and the canonical URL (uppercase visit → lowercase)',
    calls.length === 1 && calls[0].title === 'Arrival · Lisbon in 3 days' && calls[0].url === PAGE_URL && Object.keys(calls[0]).sort().join() === 'title,url', JSON.stringify(calls));
  check('Native share: no toast, no popover', (await toastCount(p)) === 0 && (await p.getByTestId('share-url').count()) === 0);
  await open(p, COLL, 'Lisbon in 3 days');
  await shareBtn(p, 'collection').click(); await p.waitForTimeout(300);
  const c2 = await p.evaluate(() => window.__shares);
  check('Native share on the collection: collection title + canonical URL', c2.length === 1 && c2[0].title === 'Lisbon in 3 days' && c2[0].url === COLL_URL, JSON.stringify(c2));
  check('Native session clean (no console errors, failed requests or /api/media/*)', clean(S), [...S.errors, ...S.failed].join(' | '));
  await S.ctx.close();
}
// ---- 2. share sheet cancelled
{
  const S = await session('native', { cancel: true });
  const p = S.page;
  await open(p, PAGE, 'Arrival');
  await shareBtn(p).click(); await p.waitForTimeout(400);
  check('Cancelled share sheet: no toast, no popover, no error', (await toastCount(p)) === 0 && (await p.getByTestId('share-url').count()) === 0 && S.errors.length === 0);
  await S.ctx.close();
}
// ---- 3. repeated clicks
{
  const S = await session('native', { delay: 800 });
  const p = S.page;
  await open(p, PAGE, 'Arrival');
  await shareBtn(p).dblclick();
  await shareBtn(p).click();                                   // a third click while the first is still pending
  const busy = await shareBtn(p).getAttribute('aria-busy');
  await p.waitForTimeout(1000);
  const n1 = await p.evaluate(() => window.__shares.length);
  check('Rapid double click (+1) while a share is pending → exactly one share; button marked busy', n1 === 1 && busy === 'true', `calls=${n1} aria-busy=${busy}`);
  check('Button no longer busy after the share completes', (await shareBtn(p).getAttribute('aria-busy')) === null);
  await shareBtn(p).click(); await p.waitForTimeout(1000);
  check('Clicking again after it completed shares again (no stale state)', (await p.evaluate(() => window.__shares.length)) === 2);
  await S.ctx.close();
}
// ---- 4. clipboard fallback
{
  const S = await session('clipboard');
  const p = S.page;
  await open(p, PAGE, 'Arrival');
  await shareBtn(p).click();
  await p.getByText('Link copied').first().waitFor({ timeout: 5000 }).catch(() => {});
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check('No share sheet → canonical URL copied to the clipboard, "Link copied" toast, no popover', clip === PAGE_URL && (await toastCount(p)) >= 1 && (await p.getByTestId('share-url').count()) === 0, clip);
  await p.screenshot({ path: SHOTS + '/01-link-copied-toast.png' });
  await p.evaluate(() => navigator.clipboard.writeText('something else'));
  await shareBtn(p).click(); await p.waitForTimeout(300);
  check('Clicking Share again copies again', (await p.evaluate(() => navigator.clipboard.readText())) === PAGE_URL);
  check('Clipboard session clean', clean(S), [...S.errors, ...S.failed].join(' | '));
  await S.ctx.close();
}
// ---- 5. clipboard blocked → manual-copy popover, Copy retry failure then success, manual Ctrl/⌘+C, Escape
{
  const S = await session('blocked');
  const p = S.page;
  await open(p, PAGE, 'Arrival');
  await shareBtn(p).click();
  const input = p.getByTestId('share-url');
  await input.waitFor({ timeout: 5000 });
  const st = await input.evaluate((i) => ({ v: i.value, ro: i.readOnly, focused: document.activeElement === i, sel: [i.selectionStart, i.selectionEnd], desc: document.getElementById(i.getAttribute('aria-describedby'))?.textContent }));
  check('Clipboard refused → popover: canonical URL, read-only, focused and fully selected', st.v === PAGE_URL && st.ro && st.focused && st.sel[0] === 0 && st.sel[1] === PAGE_URL.length, JSON.stringify(st));
  check('Popover instructions explain manual copying', /press Ctrl\+C \(⌘C on Mac\)/.test(st.desc ?? ''), st.desc);
  check('No "Link copied" toast when copying failed', (await toastCount(p)) === 0);
  await p.waitForTimeout(400);   // let the popover's fade-in finish before the screenshot
  await p.screenshot({ path: SHOTS + '/02-manual-copy-popover.png' });

  // manual copy with the keyboard works on the selected URL (real browser copy, independent of the blocked API)
  await p.evaluate(() => { window.__copied = null; document.addEventListener('copy', () => { window.__copied = document.getSelection()?.toString() || document.activeElement?.value?.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd); }, { once: true }); });
  await p.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await p.waitForTimeout(200);
  check('Pressing Ctrl/⌘+C copies the selected URL (copy event carries the full URL)', (await p.evaluate(() => window.__copied)) === PAGE_URL, String(await p.evaluate(() => window.__copied)));

  // Copy retry fails
  await p.getByRole('button', { name: 'Copy' }).click(); await p.waitForTimeout(200);
  const st2 = await input.evaluate((i) => ({ focused: document.activeElement === i, sel: [i.selectionStart, i.selectionEnd], desc: document.getElementById(i.getAttribute('aria-describedby'))?.textContent }));
  check('Copy retry fails → popover stays, URL re-focused and fully selected, instructions emphasised',
    st2.focused && st2.sel[0] === 0 && st2.sel[1] === PAGE_URL.length && st2.desc === "Copy wasn't allowed. Press Ctrl+C (⌘C on Mac) now." && (await input.isVisible()), JSON.stringify(st2));
  check('Copy retry really retried the clipboard', (await p.evaluate(() => window.__copyAttempts)) === 2);
  await p.screenshot({ path: SHOTS + '/03-copy-retry-failed.png' });

  // Escape closes, focus back on Share; reopen shows the first instructions
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Escape closes the popover and returns focus to Share', (await input.count()) === 0 && (await shareBtn(p).evaluate((b) => document.activeElement === b)));
  await shareBtn(p).click(); await input.waitFor();
  check('Reopening starts with the first instructions again', /didn't allow copying automatically/.test(await input.evaluate((i) => document.getElementById(i.getAttribute('aria-describedby'))?.textContent ?? '')));

  // Copy retry succeeds
  await p.evaluate(() => { window.__allowCopy = true; });
  await p.getByRole('button', { name: 'Copy' }).click();
  await p.getByText('Link copied').first().waitFor({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(300);
  check('Copy retry succeeds → URL on the clipboard, "Link copied" toast, popover closed',
    (await p.evaluate(() => navigator.clipboard.readText())) === PAGE_URL && (await toastCount(p)) >= 1 && (await input.count()) === 0);
  // repeated Share while the popover is open doesn't stack popovers
  await p.evaluate(() => { window.__allowCopy = false; });
  await shareBtn(p).click(); await input.waitFor();
  await shareBtn(p).click({ force: true }); await p.waitForTimeout(300);
  check('Share clicked again while the popover is open → still exactly one popover', (await p.getByTestId('share-url').count()) === 1);
  check('Blocked-clipboard session clean (no console errors, failed requests or /api/media/*)', clean(S), [...S.errors, ...S.failed].join(' | '));
  await S.ctx.close();
}
// ---- 6. collection page uses the same fallback
{
  const S = await session('blocked');
  const p = S.page;
  await open(p, COLL, 'Lisbon in 3 days');
  await shareBtn(p, 'collection').click();
  await p.getByTestId('share-url').waitFor({ timeout: 5000 });
  check('Collection: manual-copy popover shows the canonical collection URL', (await p.getByTestId('share-url').inputValue()) === COLL_URL);
  await S.ctx.close();
}
// ---- 7. mobile (360 px)
{
  const S = await session('native', { viewport: { width: 360, height: 780 } });
  const p = S.page;
  await open(p, PAGE, 'Arrival');
  const box = await shareBtn(p).boundingBox();
  check('Mobile: Share visible within the viewport, no horizontal overflow', box && box.x >= 0 && box.x + box.width <= 360 && await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), JSON.stringify(box));
  await shareBtn(p).click(); await p.waitForTimeout(300);
  check('Mobile: tapping Share uses the native share sheet', (await p.evaluate(() => window.__shares.length)) === 1);
  await p.screenshot({ path: SHOTS + '/04-mobile-share.png' });
  await S.ctx.close();
  const B = await session('blocked', { viewport: { width: 360, height: 780 } });
  await open(B.page, PAGE, 'Arrival');
  await shareBtn(B.page).click();
  const pop = B.page.getByTestId('share-url');
  await pop.waitFor();
  const pb = await B.page.locator('[data-radix-popper-content-wrapper]').boundingBox();
  check('Mobile: manual-copy popover fits on screen', pb && pb.x >= 0 && pb.x + pb.width <= 360 && await B.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), JSON.stringify(pb));
  await B.page.waitForTimeout(400);   // let the popover's fade-in finish before the screenshot
  await B.page.screenshot({ path: SHOTS + '/05-mobile-manual-copy.png' });
  await B.ctx.close();
}
// ---- 8. no Share on unavailable content
{
  const S = await session('native');
  const p = S.page;
  await p.goto(BASE + '/@admin/lisbon/day-one/secret-draft');
  await p.getByTestId('not-available').waitFor({ timeout: 10000 });
  check('No Share on the not-available screen', (await p.getByRole('button', { name: /^Share/ }).count()) === 0);
  await S.ctx.close();
}

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
