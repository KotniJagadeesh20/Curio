// Step 14d-3 targeted browser checks (brief rev. 1 §5, B1–B17): arrival focus/scroll, Back/Forward/refresh restoration,
// delayed images, interruption, 404/5xx + Retry, drawer hand-off, scrollRestoration, missing entries/anchors, mobile.
// Content: seed14c.mjs + seed14d3.mjs. Usage: node t14d3.mjs <screenshots dir>
import { chromium } from 'playwright-core';
import fs from 'fs';
import zlib from 'zlib';
const BASE = 'http://localhost:8080', SHOTS = process.argv[2];
const seed = JSON.parse(fs.readFileSync(new URL('./seed14c.json', import.meta.url)));
const L1 = '/@admin/long-read/part/one', L2 = '/@admin/long-read/part/two', L3 = '/@admin/long-read/part/three';
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const near = (a, b, tol = 5) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function png(w, h, [r, g, b]) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
const LATE_PNG = png(500, 400, [200, 120, 40]);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ALLOWED_FAILED = /^(404|503) /;
async function session({ viewport = { width: 1280, height: 900 }, token = null } = {}) {
  const ctx = await browser.newContext({ viewport });
  const s = { ctx, errors: [], failed: [], mediaReqs: [], extDelay: 0, mediaDelay: 0 };
  await ctx.addInitScript((t) => {
    if (t && !sessionStorage.getItem('seeded')) { localStorage.setItem('auth_token', t); sessionStorage.setItem('seeded', '1'); }
    // log every programmatic scroll made through Element.scrollTo (the hook's only scroll API in browsers)
    window.__scrolls = [];
    const orig = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...a) { window.__scrolls.push({ t: performance.now(), top: a[0] && a[0].top }); return orig.apply(this, a); };
    document.addEventListener('load', (e) => { const src = e.target && e.target.src; if (src && src.includes('images.example.org')) window.__extLoadedAt = performance.now(); }, true);
    // native scroll anchoring off: restoration must come from the hook (brief rev. 3 S2)
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*{overflow-anchor:none !important}'; document.head.appendChild(st); });
  }, token);
  await ctx.route('https://images.example.org/**', async (route) => { if (s.extDelay) await sleep(s.extDelay); await route.fulfill({ status: 200, contentType: 'image/png', body: LATE_PNG }); });
  await ctx.route('**/api/public/media/**', async (route) => { if (s.mediaDelay) await sleep(s.mediaDelay); await route.continue(); });
  const page = await ctx.newPage();
  s.page = page;
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (404|503)/.test(m.text())) s.errors.push(m.text()); });
  page.on('pageerror', (e) => s.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/media/')) s.mediaReqs.push(r.url()); });
  page.on('response', (r) => { const u = new URL(r.url()); if (r.status() >= 400 && /localhost:808[01]/.test(u.host)) { const k = `${r.status()} ${u.pathname}`; if (!ALLOWED_FAILED.test(k)) s.failed.push(k); } });
  return s;
}
const h1 = (p, name) => p.getByRole('heading', { level: 1, name, exact: true }).waitFor({ timeout: 12000 });
const markerTop = (p, id) => p.evaluate((id) => document.querySelector(`[data-scroll-anchor="${id}"]`)?.getBoundingClientRect().top ?? null, id);
const scrollMarkerTo = async (p, id, offset) => {
  await p.evaluate(([id, o]) => { const el = document.querySelector(`[data-scroll-anchor="${id}"]`); window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - o, behavior: 'instant' }); }, [id, offset]);
  await sleep(250);
  return markerTop(p, id);
};
const jsClick = async (p, sel) => { await p.waitForSelector(sel, { state: 'attached', timeout: 12000 }); await p.evaluate((s) => document.querySelector(s).click(), sel); };   // no scrolling into view, no pointer events
const active = (p) => p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, text: (a?.textContent ?? '').trim().slice(0, 40), label: a?.getAttribute('aria-label') ?? null }; });
const scrollY = (p) => p.evaluate(() => Math.round(window.scrollY));
const scrollsSince = (p, t) => p.evaluate((t) => window.__scrolls.filter((x) => x.t > t), t);
const now = (p) => p.evaluate(() => performance.now());
const storedFor = (p, path) => p.evaluate((path) => { const k = Object.keys(sessionStorage).filter((k) => k.startsWith('curio:scroll:') && k.endsWith('|' + path)); return k.map((x) => JSON.parse(sessionStorage.getItem(x))).sort((a, b) => b.seq - a.seq)[0] ?? null; }, path);
const settle = (ms = 1800) => sleep(ms);
const allSessions = [];
/** On the return visit, give page two's external image a fresh URL: Chrome's in-memory image cache would otherwise show it instantly. */
const freshImageOnReturn = (p) => p.route('**/api/public/pages/admin/long-read/part/two', async (route) => {
  const res = await route.fetch(); const body = await res.json();
  body.page.blocks[0].url = 'https://images.example.org/late.png?v=' + Date.now();
  await route.fulfill({ response: res, json: body });
});


// =====================================================================================================================
// B1 PUSH arrivals: top + heading focus
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + '/discover'); await h1(p, 'Discover');
  await p.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
  await jsClick(p, 'a[href="/@admin/long-read"]'); await h1(p, 'Long read'); await sleep(300);
  let a = await active(p);
  check('B1 card → collection (PUSH): top, collection heading focused', (await scrollY(p)) === 0 && a.tag === 'H1' && a.text === 'Long read', JSON.stringify(a));
  await jsClick(p, 'a[href="/@admin/long-read/part/one"]'); await h1(p, 'One'); await sleep(300);
  a = await active(p);
  check('B1 "Start reading"/outline → page (PUSH): top, page heading focused', (await scrollY(p)) === 0 && a.tag === 'H1' && a.text === 'One', JSON.stringify(a));
  for (const [label, sel, title] of [['Next', 'a[aria-label="Next: Two"]', 'Two'], ['sidebar link', '[data-testid=page-sidebar] a[href$="/part/three"]', 'Three'], ['Previous', 'a[aria-label="Previous: Two"]', 'Two']]) {
    await p.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' })); await sleep(150);
    await jsClick(p, sel); await h1(p, title); await sleep(300);
    a = await active(p);
    check(`B1 ${label} (PUSH): scrollY 0, "${title}" heading focused`, (await scrollY(p)) === 0 && a.tag === 'H1' && a.text === title, `y=${await scrollY(p)} ${JSON.stringify(a)}`);
  }
  await p.screenshot({ path: SHOTS + '/01-push-heading-focused.png' });
}

// B2 same-component Back/Forward restore, no focus move; B3 refresh; B4 A → B → A
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L1); await h1(p, 'One'); await sleep(800);
  const o1 = await scrollMarkerTo(p, 'block-b12', 200);
  await jsClick(p, 'a[aria-label="Next: Two"]'); await h1(p, 'Two'); await sleep(800);
  const o2 = await scrollMarkerTo(p, 'block-b20', 150);
  await p.goBack(); await h1(p, 'One'); await settle();
  const b1 = await markerTop(p, 'block-b12'), ab = await active(p);
  check('B2 Back: previous page restored (marker ±5 px), focus not moved to the heading', near(b1, o1) && ab.tag !== 'H1', `marker ${b1} vs ${o1}; active ${JSON.stringify(ab)}`);
  await p.goForward(); await h1(p, 'Two'); await settle();
  const f2 = await markerTop(p, 'block-b20');
  check('B2 Forward: next page restored (marker ±5 px)', near(f2, o2), `marker ${f2} vs ${o2}`);
  const o3 = await scrollMarkerTo(p, 'block-b8', 300);
  await p.reload(); await h1(p, 'Two'); await settle(2200);
  const r3 = await markerTop(p, 'block-b8');
  check('B3 Refresh restores the position (marker ±5 px)', near(r3, o3), `marker ${r3} vs ${o3}`);
  await p.screenshot({ path: SHOTS + '/02-refresh-restored.png' });
}
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L3); await h1(p, 'Three'); await sleep(600);
  const y1 = await scrollMarkerTo(p, 'block-b10', 100);
  await jsClick(p, 'a[aria-label="Previous: Two"]'); await h1(p, 'Two'); await sleep(800);
  const y2 = await scrollMarkerTo(p, 'block-b5', 250);
  await jsClick(p, '[data-testid=page-sidebar] a[href$="/part/three"]'); await h1(p, 'Three'); await sleep(300);
  const top = await scrollY(p);
  await p.goBack(); await h1(p, 'Two'); await settle();
  const m2 = await markerTop(p, 'block-b5');
  await p.goBack(); await h1(p, 'Three'); await settle();
  const m1 = await markerTop(p, 'block-b10');
  check('B4 A → B → A (new entry → top) → Back → Back: each entry restores its own position', top === 0 && near(m2, y2) && near(m1, y1), `top=${top} B ${m2}/${y2} A ${m1}/${y1}`);
}

// B5 Discover query changes never arrive; B6 unmount flush (scroll + click in the same task) → Back
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L1); await h1(p, 'One');
  await jsClick(p, 'nav[aria-label=Breadcrumb] a[href="/discover"]'); await h1(p, 'Discover'); await sleep(300);
  const a0 = await active(p);
  const t0 = await now(p);
  await p.getByRole('searchbox', { name: 'Search collections' }).fill('Long');
  await p.waitForURL('**/discover?q=Long', { timeout: 5000 });
  await sleep(400);
  const aSearch = await active(p);
  await p.getByRole('button', { name: 'All' }).click(); await sleep(200);
  await p.getByRole('searchbox', { name: 'Search collections' }).fill(''); await sleep(800);
  await p.getByRole('group', { name: 'Categories' }).getByRole('button').nth(1).click(); await sleep(500);
  await p.goBack(); await sleep(400); await p.goBack(); await sleep(400);
  const later = await scrollsSince(p, t0), aEnd = await active(p);
  check('B5 entering Discover focuses its heading; search, category and Back/Forward between query states never scroll or focus it',
    a0.tag === 'H1' && a0.text === 'Discover' && aSearch.tag === 'INPUT' && later.length === 0 && !(aEnd.tag === 'H1'), `first=${JSON.stringify(a0)} search=${JSON.stringify(aSearch)} scrolls=${later.length} end=${JSON.stringify(aEnd)}`);
}
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + '/discover'); await h1(p, 'Discover'); await sleep(800);
  await p.waitForSelector('a[href="/@admin/long-read"]');
  // scroll, then a REAL click immediately (no wait): its pointerdown is the navigation intent that samples the position
  const box = await p.evaluate(() => {
    window.scrollTo({ top: 420, behavior: 'instant' });
    const a = [...document.querySelectorAll('[data-testid=collection-card]')].find((el) => { const r = el.getBoundingClientRect(); return r.top > 140 && r.bottom < window.innerHeight; });
    const r = a.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 30, title: a.querySelector('h2')?.textContent };
  });
  await p.mouse.click(box.x, box.y);
  await h1(p, box.title);
  await p.goBack(); await h1(p, 'Discover'); await settle();
  const y = await scrollY(p);
  check('B6 Discover scrolled, a card clicked immediately (real pointer) → Back restores Discover (±5 px)', near(y, 420), `scrollY=${y}`);
}

// B7 delayed UPLOADED image above the anchor on return; B8 delayed EXTERNAL image without dimensions
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L1); await h1(p, 'One'); await sleep(800);
  const o = await scrollMarkerTo(p, 'block-b6', 200);
  await jsClick(p, 'a[aria-label="Next: Two"]'); await h1(p, 'Two'); await sleep(500);
  const departed = await storedFor(p, L1);
  S.mediaDelay = 1500;
  await p.goBack(); await h1(p, 'One'); await settle(3000);
  const m = await markerTop(p, 'block-b6');
  const entry = await storedFor(p, L1);
  check('B7 delayed uploaded image (width/height reserved) above the anchor: marker back at its offset ±5 px after the load', near(m, o), `marker ${m} vs ${o}`);
  check('B7 the stored entry still holds the departure position after settling (restoration scrolls not sampled as a new position)',
    entry && departed && near(entry.y, departed.y, 2) && entry.anchor?.id === departed.anchor?.id && near(entry.anchor?.offset, departed.anchor?.offset, 2), `departed=${JSON.stringify(departed)} now=${JSON.stringify(entry)}`);
  S.mediaDelay = 0;
}
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L2); await h1(p, 'Two'); await sleep(1000);
  const o = await scrollMarkerTo(p, 'block-b6', 200);
  await jsClick(p, 'a[aria-label="Next: Three"]'); await h1(p, 'Three'); await sleep(500);
  S.extDelay = 1500;
  await freshImageOnReturn(p);
  const tBack = await now(p);
  await p.goBack(); await h1(p, 'Two'); await settle(3200);
  const m = await markerTop(p, 'block-b6');
  const ours = await scrollsSince(p, tBack);                  // [numeric placement, …corrections]
  const imgH = await p.evaluate(() => document.querySelector('img[alt="Late external image"]')?.getBoundingClientRect().height ?? 0);
  check('B8 delayed external image WITHOUT dimensions above the anchor: marker back at its offset ±5 px after the late load', near(m, o), `marker ${m} vs ${o}`);
  // the late image (no reserved size) grew the content above the anchor after the restore, so at least one correction
  // scroll must follow the numeric placement (its timing relative to the load event varies: layout can precede 'load')
  check('B8 the late image grew the content and a correction followed the numeric placement', imgH > 0 && ours.length >= 2, `imgHeight=${imgH} programmaticScrolls=${JSON.stringify(ours.map((x) => Math.round(x.top)))}`);
  await p.screenshot({ path: SHOTS + '/03-delayed-image-restored.png' });
  S.extDelay = 0;
}

// B11 user interruption cancels settling (wheel, PageDown)
for (const [label, act] of [['wheel', (p) => p.mouse.wheel(0, 300)], ['PageDown', (p) => p.keyboard.press('PageDown')]]) {
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L2); await h1(p, 'Two'); await sleep(1000);
  const o = await scrollMarkerTo(p, 'block-b6', 200);
  await jsClick(p, 'a[aria-label="Next: Three"]'); await h1(p, 'Three'); await sleep(500);
  S.extDelay = 1500;
  await freshImageOnReturn(p);
  await p.goBack(); await h1(p, 'Two'); await sleep(250);
  await p.mouse.move(640, 450);
  await act(p);
  const tInput = await now(p);
  await settle(2800);
  const later = await scrollsSince(p, tInput);
  const m = await markerTop(p, 'block-b6');
  check(`B11 ${label} right after Back: no correction after the input, the late image doesn't pull the reader back`, later.length === 0 && !near(m, o, 20), `corrections=${later.length} marker ${m} vs ${o}`);
}

// B9 PUSH → 404 / 5xx; B10 Retry
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + '/discover'); await h1(p, 'Discover');
  await p.route('**/api/public/collections/admin/long-read', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' }));
  await p.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
  await jsClick(p, 'a[href="/@admin/long-read"]');
  await p.getByTestId('not-available').waitFor(); await sleep(300);
  let a = await active(p);
  check('B9 PUSH → 404: top, not-available heading focused', (await scrollY(p)) === 0 && a.tag === 'H1' && a.text.startsWith("This collection isn't available"), JSON.stringify(a));
  await p.unroute('**/api/public/collections/admin/long-read');
  await p.goto(BASE + '/discover'); await h1(p, 'Discover');
  await p.route('**/api/public/collections/admin/long-read', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Service unavailable"}' }));
  await jsClick(p, 'a[href="/@admin/long-read"]');
  await p.getByRole('region', { name: "Couldn't load this collection" }).waitFor({ timeout: 15000 }); await sleep(300);
  a = await active(p);
  check('B9 PUSH → 5xx: top, the labelled error region focused', (await scrollY(p)) === 0 && a.label === "Couldn't load this collection", JSON.stringify(a));
  await p.screenshot({ path: SHOTS + '/04-error-region-focused.png' });
  await p.unroute('**/api/public/collections/admin/long-read');
  const tRetry = await now(p);
  await p.getByRole('button', { name: 'Try again' }).click();
  await h1(p, 'Long read'); await sleep(400);
  a = await active(p);
  check('B10 Retry succeeds → the content heading focused, no scroll after Retry', a.tag === 'H1' && a.text === 'Long read' && (await scrollsSince(p, tRetry)).length === 0, JSON.stringify(a));
}
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + '/discover'); await h1(p, 'Discover');
  let n = 0;
  await p.route('**/api/public/collections/admin/long-read', (r) => (++n <= 6 ? r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Service unavailable"}' }) : r.continue()));
  await jsClick(p, 'a[href="/@admin/long-read"]');
  await p.getByRole('region', { name: "Couldn't load this collection" }).waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: 'Try again' }).click();
  await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === "Couldn't load this collection", null, { timeout: 15000 }).catch(() => {});
  const a1 = await active(p);
  await p.getByRole('button', { name: 'Try again' }).click();
  await h1(p, 'Long read'); await sleep(400);
  const a2 = await active(p);
  check('B10 Retry fails again → error region refocused; Retry succeeds → heading focused', a1.label === "Couldn't load this collection" && a2.tag === 'H1' && a2.text === 'Long read', `${JSON.stringify(a1)} → ${JSON.stringify(a2)}`);
}

// B12 public → /create restores history.scrollRestoration
{
  const S = await session({ token: seed.token }); allSessions.push(S); const p = S.page;
  await p.goto(`${BASE}/create/collections/${JSON.parse(fs.readFileSync(new URL('./seed14d3.json', import.meta.url))).longRead}`);
  await p.getByRole('link', { name: 'View public page' }).waitFor({ timeout: 12000 });
  const before = await p.evaluate(() => history.scrollRestoration);
  await jsClick(p, 'a[href="/@admin/long-read"]'); await h1(p, 'Long read');
  const during = await p.evaluate(() => history.scrollRestoration);
  await p.goBack(); await p.getByRole('link', { name: 'View public page' }).waitFor();
  const after = await p.evaluate(() => history.scrollRestoration);
  check('B12 history.scrollRestoration: manual on public views, restored when returning to the workspace', before === 'auto' && during === 'manual' && after === 'auto', `${before} → ${during} → ${after}`);
}

// B13 POP with no saved entry; B14 numeric position but the anchor is missing
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L3); await h1(p, 'Three'); await sleep(600);
  const scrolls = await p.evaluate(() => window.__scrolls.length), a = await active(p);
  await p.evaluate(() => window.scrollTo({ top: 350, behavior: 'instant' })); await sleep(300);
  const e = await storedFor(p, L3);
  check('B13 deep link (POP, no saved entry): stays at the top, no programmatic scroll, focus not moved; the first user scroll is stored', scrolls === 0 && a.tag !== 'H1' && e && e.y === 350, `scrolls=${scrolls} active=${JSON.stringify(a)} entry=${JSON.stringify(e)}`);
}
{
  const S = await session(); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L3); await h1(p, 'Three'); await sleep(600);
  await p.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' })); await sleep(300);
  const saved = await storedFor(p, L3);
  const idx = Number(saved.anchor.id.replace('block-b', ''));
  await jsClick(p, 'a[aria-label="Previous: Two"]'); await h1(p, 'Two'); await sleep(500);
  await p.route('**/api/public/pages/admin/long-read/part/three', async (route) => {     // content changed: the saved anchor's block is gone
    const res = await route.fetch(); const body = await res.json();
    body.page.blocks[idx] = { type: 'text', text: 5 };                                  // dropped by validation → no block-b<idx>
    await route.fulfill({ response: res, json: body });
  });
  const t = await now(p);
  await p.goBack(); await h1(p, 'Three'); await sleep(400);
  const ours = await scrollsSince(p, t);
  const missing = await p.evaluate((id) => !document.querySelector(`[data-scroll-anchor="${id}"]`), saved.anchor.id);
  await p.evaluate(() => window.scrollTo({ top: 1600, behavior: 'instant' })); await sleep(300);
  const e = await storedFor(p, L3);
  check('B14 POP with a numeric position but no matching anchor: one numeric restore, then tracking active quickly (well before 5 s)',
    missing && ours.length === 1 && ours[0].top === saved.y && e.y === 1600, `missing=${missing} scrolls=${JSON.stringify(ours)} saved.y=${saved.y} entry=${JSON.stringify(e)}`);
}

// B15 drawer focus hand-off (360 px); B16 mobile subset
{
  const S = await session({ viewport: { width: 360, height: 780 } }); allSessions.push(S); const p = S.page;
  await p.goto(BASE + L1); await h1(p, 'One'); await sleep(500);
  await p.getByRole('button', { name: 'Contents' }).click();
  await p.getByRole('dialog').waitFor();
  await p.evaluate(() => { window.__contentsFocused = 0; const t = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Contents'); t.addEventListener('focus', () => { window.__contentsFocused++; }); });
  await p.getByRole('dialog').getByRole('link', { name: 'Two' }).click();
  await h1(p, 'Two'); await sleep(600);
  let a = await active(p);
  const stray = await p.evaluate(() => window.__contentsFocused);
  check('B15 drawer link → the new page heading focused; "Contents" never focused in between', a.tag === 'H1' && a.text === 'Two' && stray === 0, `${JSON.stringify(a)} contentsFocused=${stray}`);
  await p.getByRole('button', { name: 'Contents' }).click(); await p.getByRole('dialog').waitFor(); await sleep(400);
  await p.keyboard.press('Escape'); await sleep(500);
  a = await active(p);
  check('B15 drawer closed with Escape → focus on "Contents"', a.tag === 'BUTTON' && a.text === 'Contents', JSON.stringify(a));
  await p.screenshot({ path: SHOTS + '/05-mobile-drawer-focus.png' });
  // B16 mobile: PUSH top+focus, Back restore
  const o = await scrollMarkerTo(p, 'block-b9', 120);
  await jsClick(p, 'a[aria-label="Next: Three"]'); await h1(p, 'Three'); await sleep(400);
  a = await active(p);
  const yTop = await scrollY(p);
  await p.goBack(); await h1(p, 'Two'); await settle();
  const m = await markerTop(p, 'block-b9');
  check('B16 mobile 360 px: Next → top + heading focus; Back → marker restored ±5 px', yTop === 0 && a.text === 'Three' && near(m, o), `y=${yTop} active=${a.text} marker ${m} vs ${o}`);
}

// B17 hygiene across all sessions
const errs = allSessions.flatMap((s) => s.errors), failed = allSessions.flatMap((s) => s.failed), media = allSessions.flatMap((s) => s.mediaReqs);
check('B17 no console errors, no unexpected failed requests (404/503 only where injected), zero /api/media/* requests', errs.length === 0 && failed.length === 0 && media.length === 0, [...errs, ...failed, ...media].slice(0, 4).join(' | '));
for (const s of allSessions) await s.ctx.close();
await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
