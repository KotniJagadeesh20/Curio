// Step 14e-2 browser acceptance (plan rev. 2 §2.2, §5): Scenario A (J1) and B (J2, 1280 px and 360 px), R3 isolation
// (logged out and logged in as B), R4 arrival/scroll/focus + drawer hand-off + keyboard-only J1, R6 hygiene.
// Content: seed14e.mjs (fresh backend). Usage: node t14e.mjs <screenshots dir>
// env NEG = a | b | d  → negative-control run (plan §4); the run is EXPECTED to fail in the named place:
//   a  A-draft is published through the API before the browser starts → R3 must fail
//   b  every public page-view request is stubbed to 503 (route interception) → J1 must fail on the error state
//   d  B1's image response is held and the page API's width/height are stripped (interception) → B1 aspect check must fail
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:8080', API = 'http://localhost:8081/api', SHOTS = process.argv[2] ?? '.';
const NEG = process.env.NEG ?? '';
const seed = JSON.parse(fs.readFileSync(new URL('./seed14e.json', import.meta.url)));
const UA = seed.aUser, UB = seed.bUser;
const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;

// ---- expected content -------------------------------------------------------------------------------------------------
const JL = `/@${UA}/java-learning`, TE = `/@${UB}/travel-experiences`;
const A_PAGES = [
  { path: `${JL}/core-java/hello-java`, title: 'Hello, Java', module: 'Core Java' },
  { path: `${JL}/core-java/the-jvm`, title: 'The JVM', module: 'Core Java' },
  { path: `${JL}/core-java/collections`, title: 'Collections', module: 'Core Java' },
];
const B_PAGES = [
  { path: `${TE}/lisbon/arrival`, title: 'Arrival', module: 'Lisbon' },
  { path: `${TE}/lisbon/tram-28`, title: 'Tram 28', module: 'Lisbon' },
  { path: `${TE}/porto/ribeira`, title: 'Ribeira', module: 'Porto' },
];
const DRAFT_TITLES = ['Generics draft', 'Java Drafts', 'Streams idea', 'Port wine draft'];
const NOT_AVAILABLE = [   // [label, browser path, API path that must answer 404]
  ['A-draft page', `${JL}/core-java/generics-draft`, `/api/public/pages/${UA}/java-learning/core-java/generics-draft`],
  ['"Java Drafts" (draft collection)', `/@${UA}/java-drafts`, `/api/public/collections/${UA}/java-drafts`],
  ['page in "Java Drafts"', `/@${UA}/java-drafts/ideas/streams-idea`, `/api/public/pages/${UA}/java-drafts/ideas/streams-idea`],
  ["B's draft page", `${TE}/porto/port-wine-draft`, `/api/public/pages/${UB}/travel-experiences/porto/port-wine-draft`],
];
// Deliberately produced 404s (R3), allowed by exact path only (plan §5). The page view of a page in a draft collection
// also requests that collection's outline, which is the same 404.
const ALLOWED_404 = new Set(NOT_AVAILABLE.map(([, , a]) => `404 GET ${a}`));
const negAllowed = (k) => (NEG === 'b' && /^503 GET \/api\/public\/pages\//.test(k));

// ---- negative control (a): publish A-draft through the API before any browser session ---------------------------------
if (NEG === 'a') {
  const r = await fetch(`${API}/pages/${seed.ids.aDraft}/publish`, { method: 'POST', headers: { Authorization: 'Bearer ' + seed.aToken } });
  console.log(`NEG a: POST /api/pages/${seed.ids.aDraft}/publish → ${r.status}`);
}

// ---- sessions ---------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const sessions = [];
const EMBED_HTML = '<!doctype html><title>video</title><body style="margin:0;background:#111"></body>';
async function session(label, { viewport = { width: 1280, height: 900 }, token = null, clipboard = false } = {}) {
  const ctx = await browser.newContext({ viewport });
  if (clipboard) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const s = { label, ctx, viewport, errors: [], failed: [], publicReqs: [], mediaReqs: [], resp: [], overflow: [], mediaHeld: 0, embedHeld: 0 };
  const gate = (k) => { let r; s[k] = new Promise((res) => { r = res; }); s[k + 'Release'] = r; };
  s.holdMedia = () => gate('mg'); s.releaseMedia = () => s.mgRelease?.();
  s.holdEmbed = () => gate('eg'); s.releaseEmbed = () => s.egRelease?.();
  await ctx.addInitScript(({ token, clipboard }) => {
    if (token && !sessionStorage.getItem('seeded')) { localStorage.setItem('auth_token', token); sessionStorage.setItem('seeded', '1'); }
    if (clipboard) Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });   // no share sheet → clipboard path
    window.__fi = [];
    document.addEventListener('focusin', (e) => { const t = e.target; window.__fi.push({ t: performance.now(), d: `${t.tagName}:${(t.getAttribute('aria-label') || t.textContent || '').trim().slice(0, 30)}` }); }, true);
    window.__titles = [];
    const rec = () => { if (!window.__titles.includes(document.title)) window.__titles.push(document.title); };
    document.addEventListener('DOMContentLoaded', () => { rec(); new MutationObserver(rec).observe(document.querySelector('title') ?? document.head, { subtree: true, childList: true, characterData: true }); });
    window.__frameLoads = 0;
    document.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IFRAME') window.__frameLoads++; }, true);
  }, { token, clipboard });
  // third-party embeds are intercepted in the new scripts only (plan §4); held while s.eg is pending
  const embed = async (route) => { s.embedHeld++; if (s.eg) await s.eg; await route.fulfill({ status: 200, contentType: 'text/html', body: EMBED_HTML }); };
  await ctx.route('https://www.youtube.com/**', embed);
  await ctx.route('https://www.youtube-nocookie.com/**', embed);
  await ctx.route('**/api/public/media/**', async (route) => { s.mediaHeld++; if (s.mg) await s.mg; await route.continue(); });
  if (NEG === 'b') await ctx.route('**/api/public/pages/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Service unavailable"}' }));
  if (NEG === 'd') await ctx.route(`**/api/public/pages/${UB}/travel-experiences/lisbon/arrival`, async (route) => {
    const res = await route.fetch(); const body = await res.json();
    for (const b of body.page.blocks ?? []) if (b.type === 'image') { delete b.width; delete b.height; }
    await route.fulfill({ response: res, json: body });
  });
  const page = await ctx.newPage();
  s.page = page;
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 404/.test(m.text()) && !(NEG === 'b' && /status of 503/.test(m.text()))) s.errors.push(m.text()); });
  page.on('pageerror', (e) => s.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/public/')) s.publicReqs.push({ url: u.pathname, auth: r.headers()['authorization'] ?? null });
    if (u.pathname.startsWith('/api/media')) s.mediaReqs.push(u.pathname);
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (!/localhost:808[01]/.test(u.host)) return;
    const k = `${r.status()} ${r.request().method()} ${u.pathname}`;
    s.resp.push(k);
    if (r.status() >= 400 && !ALLOWED_404.has(k) && !negAllowed(k)) s.failed.push(k);
  });
  sessions.push(s);
  return s;
}
const h1Wait = (p, name, timeout = 12000) => p.getByRole('heading', { level: 1, name, exact: true }).waitFor({ timeout });
const fiMark = (p) => p.evaluate(() => window.__fi.length);
const fiSince = (p, m) => p.evaluate((m) => window.__fi.slice(m).map((x) => x.d), m);
const scrollY = (p) => p.evaluate(() => Math.round(window.scrollY));
const noindex = (p) => p.evaluate(() => document.head.querySelectorAll('meta[name="robots"][content="noindex"]').length);
const overflowOk = async (s) => { const o = await s.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth })); if (o.sw > o.vw) s.overflow.push(`${s.page.url()} ${o.sw}>${o.vw}`); return o.sw <= o.vw; };
const hrefsUnder = (p, prefix) => p.evaluate((pre) => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith(pre)), prefix);
const apiOutline = async (u, c) => { const r = await fetch(`${API}/public/collections/${u}/${c}`); const d = await r.json(); return d.modules.flatMap((m) => m.pages.map((p) => `/@${u}/${c}/${m.slug}/${p.slug}`)); };
const imgBox = (p, alt) => p.evaluate((alt) => { const i = document.querySelector(`img[alt="${alt}"]`); if (!i) return null; const r = i.getBoundingClientRect(); return { w: r.width, h: r.height, wAttr: i.getAttribute('width'), hAttr: i.getAttribute('height'), complete: i.complete, nw: i.naturalWidth, src: i.getAttribute('src'), visible: getComputedStyle(i).visibility !== 'hidden' && getComputedStyle(i).display !== 'none' }; }, alt);
const imgLoaded = (p, alt) => p.waitForFunction((alt) => { const i = document.querySelector(`img[alt="${alt}"]`); return i && i.complete && i.naturalWidth > 0; }, alt, { timeout: 10000 }).then(() => true, () => false);

/** Per-page assertions (plan §2.2, 1–5), plus the page's key block. */
async function perPage(s, tag, pages, i, keyBlock) {
  const p = s.page, pg = pages[i];
  const collPath = pg.path.split('/').slice(0, 3).join('/');
  const collTitle = collPath.endsWith('java-learning') ? 'Java Learning' : 'Travel Experiences';
  const h1s = await p.getByRole('heading', { level: 1 }).allInnerTexts();
  check(`${tag} ${pg.title}: document title "${pg.title} · AlgoQuest" and the single <h1>`, (await p.title()) === `${pg.title} · AlgoQuest` && h1s.length === 1 && h1s[0] === pg.title, `${await p.title()} / ${JSON.stringify(h1s)}`);
  const crumbs = p.getByRole('navigation', { name: 'Breadcrumb' });
  const collHref = await crumbs.getByRole('link', { name: collTitle, exact: true }).getAttribute('href').catch(() => null);
  const crumbText = await crumbs.innerText().catch(() => '');
  check(`${tag} ${pg.title}: breadcrumb → collection link + module "${pg.module}"`, collHref === collPath && crumbText.includes(pg.module), `${collHref} | ${crumbText.replace(/\n/g, ' ')}`);
  if (keyBlock) await keyBlock();
  const prev = pages[i - 1], next = pages[i + 1];
  const prevLinks = await p.getByRole('link', { name: /^Previous:/ }).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const nextLinks = await p.getByRole('link', { name: /^Next:/ }).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(`${tag} ${pg.title}: Previous ${prev ? '→ ' + prev.title : 'absent (first page)'}; Next ${next ? '→ ' + next.title : 'absent (last page)'}`,
    JSON.stringify(prevLinks) === JSON.stringify(prev ? [prev.path] : []) && JSON.stringify(nextLinks) === JSON.stringify(next ? [next.path] : []), `prev=${JSON.stringify(prevLinks)} next=${JSON.stringify(nextLinks)}`);
  const allowed = new Set([collPath, ...pages.map((x) => x.path)]);
  const hrefs = await hrefsUnder(p, collPath);
  const bad = hrefs.filter((h) => !allowed.has(h));
  check(`${tag} ${pg.title}: every rendered link into the collection is a published page (no draft/unknown)`, hrefs.length > 0 && bad.length === 0, bad.join(' ') || `${hrefs.length} links`);
}

// ---- key blocks ---------------------------------------------------------------------------------------------------------
const keyA1 = (s) => async () => {
  const p = s.page;
  const a = p.locator('article a', { hasText: 'tutorial' });
  const rel = (await a.getAttribute('rel').catch(() => '')) ?? '';
  const items = await p.locator('article ul').first().locator('li').allInnerTexts().catch(() => []);
  check('A1 key block: <strong>, <em>, link with a safe rel, <ul> with the seeded items',
    (await p.locator('article strong', { hasText: 'strongly typed' }).count()) === 1 && (await p.locator('article em', { hasText: 'object oriented' }).count()) === 1
    && (await a.getAttribute('href').catch(() => null)) === 'https://dev.java/learn/' && /noopener/.test(rel) && /noreferrer/.test(rel)
    && JSON.stringify(items) === JSON.stringify(['Install the JDK', 'Write Hello.java', 'Run it']), `rel="${rel}" items=${JSON.stringify(items)}`);
};
const keyA2 = (s) => async () => {
  const p = s.page;
  await imgLoaded(p, 'Source to bytecode');
  const b = await imgBox(p, 'Source to bytecode');
  const decoded = b?.src ? await p.evaluate((src) => { const i = src.indexOf(','); const meta = src.slice(0, i); const data = src.slice(i + 1); return meta.includes(';base64') ? atob(data) : decodeURIComponent(data); }, b.src) : '';
  const inlineSvg = await p.locator('article svg', { hasText: 'Bytecode' }).count();
  const caption = await p.locator('article figcaption', { hasText: 'Source to bytecode' }).count();
  check('A2 key block: SVG as a rendered <img> data:image/svg+xml (complete, naturalWidth > 0, box > 0, visible), never inline',
    b && b.src.startsWith('data:image/svg+xml') && b.complete && b.nw > 0 && b.w > 0 && b.h > 0 && b.visible && inlineSvg === 0, JSON.stringify({ ...b, src: b?.src?.slice(0, 30) }));
  check('A2 key block: decoded SVG source holds the seeded text and fill; caption shown', decoded.includes('Bytecode') && decoded.includes('#e4572e') && caption >= 1, decoded.slice(0, 80));
};
const keyA3 = (s) => async () => {
  const p = s.page;
  await p.locator('.monaco-editor').first().waitFor({ timeout: 15000 }).catch(() => {});
  await sleep(500);
  const lines = (await p.locator('.monaco-editor .view-lines').first().innerText().catch(() => '')).replace(/ /g, ' ');
  const ro = await p.locator('.monaco-editor textarea').first().evaluate((t) => t.readOnly || t.getAttribute('aria-readonly') === 'true').catch(() => false);
  check('A3 key block: code block shows the seeded source in a read-only editor', lines.includes('List<String> names = new ArrayList<>();') && lines.includes('Map<String, Integer> ages') && ro, `readOnly=${ro} text=${JSON.stringify(lines.slice(0, 60))}`);
  const hdr = (await p.getByRole('columnheader').allInnerTexts()).join('|');
  const cap = await p.locator('article table caption').innerText().catch(() => '');
  check('A3 key block: table header cells and caption', hdr === 'Type|Ordered|Unique' && cap === 'Collection types', `${hdr} / ${cap}`);
};
/** B1/B2 image rule: width/height = uploaded size; the box has the right aspect BEFORE the (held) image response; public media only. */
async function heldImageCheck(s, tag, alt, size) {
  const p = s.page;
  await p.locator(`img[alt="${alt}"]`).waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  await sleep(300);
  const before = await imgBox(p, alt);
  const held = before && !before.complete && before.nw === 0;
  const ratio = before && before.h > 0 ? before.w / before.h : null;
  check(`${tag} image "${alt}": width/height attributes = uploaded size ${size.w}×${size.h}`, before && before.wAttr === String(size.w) && before.hAttr === String(size.h), JSON.stringify(before && { w: before.wAttr, h: before.hAttr }));
  check(`${tag} image "${alt}": correct aspect box BEFORE the image response is released (held)`, held && before.w > 0 && near(ratio, size.w / size.h, 0.02), JSON.stringify({ held, box: before && [before.w, before.h], ratio, expected: size.w / size.h }));
  s.releaseMedia();
  const loaded = await imgLoaded(p, alt);
  const after = await imgBox(p, alt);
  check(`${tag} image "${alt}": loads through /api/public/media/* only (no /api/media/*)`, loaded && /^\/api\/public\/media\/[0-9a-f-]{36}$/.test(after?.src ?? '') && s.mediaReqs.length === 0, `${after?.src} media=${s.mediaReqs.length}`);
}
const keyB1 = (s) => async () => {
  await heldImageCheck(s, 'B1 key block:', 'Lisbon rooftops', seed.sizes.img1);
  const p = s.page;
  const ok = await p.getByText('The airport metro reaches the centre in 20 minutes.').isVisible() && await p.getByText('Buy a Viva Viagem card at the station.').isVisible() && await p.getByText('Mind your bag on crowded trams.').isVisible();
  check('B1 key block: info, tip and warning callouts present', ok);
};
const keyB2 = (s) => async () => {
  const p = s.page;
  const fr = p.locator('iframe[src^="https://www.youtube"]');
  await fr.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  await sleep(300);
  const box = () => fr.evaluate((f) => { const r = f.getBoundingClientRect(); return { w: r.width, h: r.height }; }).catch(() => null);
  const before = await box();
  const loadsBefore = await p.evaluate(() => window.__frameLoads);
  check('B2 key block: video iframe box non-zero and 16:9 BEFORE its document loads (held)', s.embedHeld > 0 && loadsBefore === 0 && before && before.w > 0 && near(before.w / before.h, 16 / 9, 0.02), JSON.stringify({ before, held: s.embedHeld, loadsBefore }));
  s.releaseEmbed();
  await p.waitForFunction(() => window.__frameLoads > 0, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  const after = await box();
  check('B2 key block: iframe box unchanged after its document loads (stable)', after && before && near(after.w, before.w, 1) && near(after.h, before.h, 1), JSON.stringify({ before, after }));
  await heldImageCheck(s, 'B2 key block:', 'Yellow tram', seed.sizes.img2);
};
const keyB3 = (s) => async () => { check('B3 key block: the text renders', await s.page.getByText('Ribeira is the riverside heart of Porto.').isVisible()); };

async function discoverFind(s, tag, q, categoryName, title, href) {
  const p = s.page;
  await p.goto(BASE + '/discover');
  await p.getByTestId('collection-card').first().waitFor({ timeout: 10000 });
  await p.getByRole('searchbox', { name: 'Search collections' }).fill(q);
  await p.waitForFunction((q) => new URLSearchParams(location.search).get('q') === q, q, { timeout: 8000 });
  const card = p.locator(`a[data-testid="collection-card"][href="${href}"]`);
  await card.waitFor({ timeout: 8000 }).catch(() => {});
  check(`${tag} Discover: search "${q}" shows the card`, (await card.count()) === 1 && (await card.innerText()).includes(title));
  await p.getByRole('group', { name: 'Categories' }).getByRole('button', { name: categoryName, exact: true }).click();
  await p.waitForFunction((q) => { const s = new URLSearchParams(location.search); return s.get('q') === q && !!s.get('category'); }, q, { timeout: 8000 });
  await card.waitFor({ timeout: 8000 }).catch(() => {});
  check(`${tag} Discover: category "${categoryName}" filter keeps the card`, (await card.count()) === 1, p.url());
  const dom = await p.locator('main, body').first().innerText();
  check(`${tag} Discover: no draft/unlisted title in the DOM`, !DRAFT_TITLES.some((t) => dom.includes(t)) && !dom.includes('Java Notes'), DRAFT_TITLES.filter((t) => dom.includes(t)).join(','));
  await card.click();
}
async function collectionHeader(s, tag, path, title, u, c, published) {
  const p = s.page;
  await p.waitForURL('**' + path, { timeout: 10000 });
  await h1Wait(p, title);
  const outline = await p.getByTestId('collection-outline').getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const api = await apiOutline(u, c);
  check(`${tag} Collection ${path}: header, outline = published pages in API order, Share`,
    JSON.stringify(outline) === JSON.stringify(published.map((x) => x.path)) && JSON.stringify(api) === JSON.stringify(outline) && await p.getByRole('button', { name: 'Share this collection' }).isVisible(),
    `outline=${outline.join(' ')} api=${api.join(' ')}`);
}
async function go(p, linkName, title) { await p.getByRole('link', { name: linkName, exact: true }).click(); await h1Wait(p, title); await sleep(600); }

// =====================================================================================================================
// J1 — Scenario A, desktop, logged out (with R4 arrival/scroll/focus on real content)
// =====================================================================================================================
try {
  const S = await session('J1 desktop');
  const p = S.page;
  await discoverFind(S, '[J1]', 'java', 'Programming', 'Java Learning', JL);
  await collectionHeader(S, '[J1]', JL, 'Java Learning', UA, 'java-learning', A_PAGES);
  await p.screenshot({ path: `${SHOTS}/J1-01-collection.png`, fullPage: true });
  let m = await fiMark(p);
  await p.getByRole('link', { name: 'Start reading' }).click();
  await p.waitForURL('**' + A_PAGES[0].path, { timeout: 10000 });
  if (NEG === 'b') {   // negative control (b): J1 must fail on the error state
    const alert = await p.getByRole('alert').innerText({ timeout: 10000 }).catch(() => '');
    check('[J1] A1 opens in the page viewer (NEG b: the page view is stubbed to 503)', false, `error state shown: ${JSON.stringify(alert.slice(0, 80))}; retry button: ${await p.getByRole('button', { name: 'Try again' }).count()}`);
    await p.screenshot({ path: `${SHOTS}/NEG-b-error-state.png` });
    throw new Error('NEG b: J1 stopped at the error state');
  }
  await h1Wait(p, 'Hello, Java'); await sleep(800);
  check('[R4] PUSH arrival (Start reading → A1): scrollY 0 and the <h1> receives focus (focusin recorded)', (await scrollY(p)) === 0 && (await fiSince(p, m)).includes('H1:Hello, Java'), JSON.stringify(await fiSince(p, m)));
  await perPage(S, '[J1]', A_PAGES, 0, keyA1(S));
  await p.screenshot({ path: `${SHOTS}/J1-02-A1.png`, fullPage: true });
  // R4: scroll A1, PUSH to A2, POP back, forward, refresh
  await p.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' })); await sleep(500);
  const savedY = await scrollY(p);
  m = await fiMark(p);
  // leave through the sticky sidebar link, visible at this position: clicking "Next" (at the bottom of A1) would first
  // scroll it into view, so the position the reader really left from would be the bottom, not savedY (dry-run finding)
  await p.getByTestId('page-sidebar').getByRole('link', { name: 'The JVM' }).click(); await h1Wait(p, 'The JVM'); await sleep(600);
  check('[R4] PUSH (sidebar link) from a scrolled page: new page at scrollY 0 with heading focus', (await scrollY(p)) === 0 && (await fiSince(p, m)).includes('H1:The JVM'), `y=${await scrollY(p)} ${JSON.stringify(await fiSince(p, m))}`);
  await perPage(S, '[J1]', A_PAGES, 1, keyA2(S));
  await p.screenshot({ path: `${SHOTS}/J1-03-A2.png`, fullPage: true });
  m = await fiMark(p);
  await p.goBack(); await h1Wait(p, 'Hello, Java'); await sleep(1500);
  check('[R4] Back (POP) to A1: position restored ±5 px, focus not moved', near(await scrollY(p), savedY, 5) && (await fiSince(p, m)).length === 0, `y=${await scrollY(p)} saved=${savedY} focusins=${JSON.stringify(await fiSince(p, m))}`);
  m = await fiMark(p);
  await p.goForward(); await h1Wait(p, 'The JVM'); await sleep(1500);
  check('[R4] Forward (POP) to A2: position restored (top) ±5 px, focus not moved', near(await scrollY(p), 0, 5) && (await fiSince(p, m)).length === 0, `y=${await scrollY(p)} ${JSON.stringify(await fiSince(p, m))}`);
  await p.goBack(); await h1Wait(p, 'Hello, Java'); await sleep(1500);
  await p.reload(); await h1Wait(p, 'Hello, Java'); await sleep(1800);
  const fiAfterReload = await p.evaluate(() => window.__fi.map((x) => x.d));
  check('[R4] Refresh on scrolled A1: position restored ±5 px, heading not focused', near(await scrollY(p), savedY, 5) && !fiAfterReload.includes('H1:Hello, Java'), `y=${await scrollY(p)} saved=${savedY} focusins=${JSON.stringify(fiAfterReload)}`);
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await sleep(300);
  await go(p, 'Next: The JVM', 'The JVM');
  await go(p, 'Next: Collections', 'Collections');
  await perPage(S, '[J1]', A_PAGES, 2, keyA3(S));
  await p.screenshot({ path: `${SHOTS}/J1-04-A3.png`, fullPage: true });
  await go(p, 'Previous: The JVM', 'The JVM');
  await go(p, 'Previous: Hello, Java', 'Hello, Java');
  check('[J1] Previous chain returns to A1 (first page)', p.url().endsWith(A_PAGES[0].path) && (await p.getByRole('link', { name: /^Previous:/ }).count()) === 0);
  // deep link + refresh on A2; Back/Forward through the chain
  await p.goto(BASE + A_PAGES[1].path); await h1Wait(p, 'The JVM');
  await p.reload(); await h1Wait(p, 'The JVM');
  check('[J1] Deep link and refresh on A2', (await p.title()) === 'The JVM · AlgoQuest' && await p.getByRole('img', { name: 'Source to bytecode' }).isVisible());
  await go(p, 'Next: Collections', 'Collections');
  await p.goBack(); await h1Wait(p, 'The JVM');
  await p.goForward(); await h1Wait(p, 'Collections');
  check('[J1] Back/Forward through the chain', p.url().endsWith(A_PAGES[2].path));
  await S.ctx.close();
} catch (e) { check('[J1] journey completed without an exception', false, e.message.split('\n')[0]); }

// J1 step 5: Share copies the canonical collection URL; it opens in a fresh logged-out context
try {
  const S = await session('J1 share', { clipboard: true });
  const p = S.page;
  await p.goto(BASE + JL); await h1Wait(p, 'Java Learning');
  await p.getByRole('button', { name: 'Share this collection' }).click();
  await p.getByText('Link copied').first().waitFor({ timeout: 5000 }).catch(() => {});
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check('[J1] Share copies the canonical collection URL', clip === BASE + JL, clip);
  const F = await session('J1 share target');
  await F.page.goto(clip); await h1Wait(F.page, 'Java Learning');
  check('[J1] The shared URL opens the same collection in a fresh logged-out context', (await F.page.title()) === 'Java Learning · AlgoQuest');
  await S.ctx.close(); await F.ctx.close();
} catch (e) { check('[J1] share step completed without an exception', false, e.message.split('\n')[0]); }

// =====================================================================================================================
// J2 — Scenario B, 1280 px (held media / embeds), then 360 px with the Contents drawer
// =====================================================================================================================
try {
  const S = await session('J2 desktop');
  const p = S.page;
  await discoverFind(S, '[J2]', 'travel', 'Travel', 'Travel Experiences', TE);
  await collectionHeader(S, '[J2]', TE, 'Travel Experiences', UB, 'travel-experiences', B_PAGES);
  S.holdMedia();
  await p.getByRole('link', { name: 'Start reading' }).click();
  await h1Wait(p, 'Arrival');
  await perPage(S, '[J2]', B_PAGES, 0, keyB1(S));
  await p.screenshot({ path: `${SHOTS}/J2-01-B1.png`, fullPage: true });
  S.holdMedia(); S.holdEmbed();
  await p.getByRole('link', { name: 'Next: Tram 28', exact: true }).click(); await h1Wait(p, 'Tram 28');
  await perPage(S, '[J2]', B_PAGES, 1, keyB2(S));
  await p.screenshot({ path: `${SHOTS}/J2-02-B2.png`, fullPage: true });
  await go(p, 'Next: Ribeira', 'Ribeira');
  check('[J2] B3 reached from B2 via Next (crossing Lisbon → Porto)', p.url().endsWith(B_PAGES[2].path));
  await perPage(S, '[J2]', B_PAGES, 2, keyB3(S));
  await go(p, 'Previous: Tram 28', 'Tram 28');
  await go(p, 'Previous: Arrival', 'Arrival');
  check('[J2] Previous chain returns to B1 (first page)', p.url().endsWith(B_PAGES[0].path));
  await p.goto(BASE + B_PAGES[1].path); await h1Wait(p, 'Tram 28'); await p.reload(); await h1Wait(p, 'Tram 28');
  await go(p, 'Next: Ribeira', 'Ribeira'); await p.goBack(); await h1Wait(p, 'Tram 28'); await p.goForward(); await h1Wait(p, 'Ribeira');
  check('[J2] Deep link + refresh on B2; Back/Forward through the chain', p.url().endsWith(B_PAGES[2].path));
  await S.ctx.close();
} catch (e) { check('[J2] desktop journey completed without an exception', false, e.message.split('\n')[0]); }

try {
  const S = await session('J2 mobile', { viewport: { width: 360, height: 780 } });
  const p = S.page;
  await discoverFind(S, '[J2-360]', 'travel', 'Travel', 'Travel Experiences', TE);
  await collectionHeader(S, '[J2-360]', TE, 'Travel Experiences', UB, 'travel-experiences', B_PAGES);
  check('[J2-360] Collection: no horizontal overflow', await overflowOk(S));
  await p.getByRole('link', { name: 'Start reading' }).click(); await h1Wait(p, 'Arrival'); await sleep(800);
  await perPage(S, '[J2-360]', B_PAGES, 0, null);
  check('[J2-360] B1: sidebar hidden, Contents button shown, no horizontal overflow', !(await p.getByTestId('page-sidebar').isVisible()) && await p.getByRole('button', { name: 'Contents' }).isVisible() && await overflowOk(S));
  for (const [i, target] of [[1, 'Tram 28'], [2, 'Ribeira']]) {
    await p.getByRole('button', { name: 'Contents' }).click();
    const drawer = p.getByRole('dialog'); await drawer.waitFor();
    const links = await drawer.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check(`[J2-360] Contents drawer lists exactly the published outline (before → ${target})`, JSON.stringify(links) === JSON.stringify(B_PAGES.map((x) => x.path)), links.join(' '));
    await sleep(500);
    if (i === 1) await p.screenshot({ path: `${SHOTS}/J2-03-mobile-drawer.png` });
    const m = await fiMark(p);
    await drawer.getByRole('link', { name: target }).click();
    await h1Wait(p, target); await sleep(900);
    const fi = await fiSince(p, m);
    check(`[R4] Drawer hand-off at 360 px (→ ${target}): focus goes to the new <h1>, never back to "Contents"`, fi.includes(`H1:${target}`) && !fi.some((d) => d.startsWith('BUTTON:Contents')) && (await p.getByRole('dialog').count()) === 0, JSON.stringify(fi));
    await perPage(S, '[J2-360]', B_PAGES, i, i === 2 ? keyB3(S) : null);
    check(`[J2-360] ${target}: no horizontal overflow`, await overflowOk(S));
  }
  await p.screenshot({ path: `${SHOTS}/J2-04-mobile-B3.png`, fullPage: true });
  await S.ctx.close();
} catch (e) { check('[J2-360] mobile journey completed without an exception', false, e.message.split('\n')[0]); }

// =====================================================================================================================
// R3 — draft / unlisted isolation: logged out, then logged in as B
// =====================================================================================================================
for (const [label, token] of [['logged out', null], ['logged in as B', seed.bToken]]) {
  try {
    const S = await session(`R3 ${label}`, { token });
    const p = S.page;
    for (const [what, path, apiPath] of NOT_AVAILABLE) {
      const before = S.resp.length;
      await p.goto(BASE + path);
      const na = p.getByTestId('not-available'); await na.waitFor({ timeout: 10000 }).catch(() => {});
      const txt = await na.innerText().catch(() => '');
      const statuses = S.resp.slice(before).filter((k) => k.endsWith(' ' + apiPath));
      check(`[R3 ${label}] ${what} → not-available screen, neutral title, API 404 (network + DOM)`,
        /^This (page|collection) isn't available/.test(txt) && (await p.title()) === 'Not available · AlgoQuest' && statuses.length > 0 && statuses.every((k) => k.startsWith('404 ')),
        `${path}: "${txt.split('\n')[0]}" / ${await p.title()} / ${statuses.join(',') || 'no API response'}`);
    }
    await p.screenshot({ path: `${SHOTS}/R3-${token ? 'B' : 'anon'}-not-available.png` });
    await p.goto(BASE + `/@${UA}/java-notes`); await h1Wait(p, 'Java Notes');
    check(`[R3 ${label}] "Java Notes" (unlisted) opens by direct link with noindex`, (await noindex(p)) === 1);
    await p.getByRole('link', { name: 'Records' }).first().click(); await h1Wait(p, 'Records');
    check(`[R3 ${label}] unlisted page keeps noindex`, (await noindex(p)) === 1);
    for (const q of ['java', 'notes', '']) {
      await p.goto(BASE + '/discover' + (q ? `?q=${q}` : ''));
      await p.getByTestId('collection-card').first().waitFor({ timeout: 8000 }).catch(() => {});
      await sleep(400);
      const hrefs = await p.getByTestId('collection-card').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      const dom = await p.locator('body').innerText();
      check(`[R3 ${label}] Discover ${q ? `search "${q}"` : '(no filter)'}: "Java Notes"/"Java Drafts" absent, no draft title in the DOM`,
        !hrefs.includes(`/@${UA}/java-notes`) && !hrefs.includes(`/@${UA}/java-drafts`) && !dom.includes('Java Notes') && !DRAFT_TITLES.some((t) => dom.includes(t)), hrefs.join(' '));
    }
    for (const [coll, title, pages, draftTitle] of [[JL, 'Java Learning', A_PAGES, 'Generics draft'], [TE, 'Travel Experiences', B_PAGES, 'Port wine draft']]) {
      await p.goto(BASE + coll); await h1Wait(p, title);
      const outline = await p.getByTestId('collection-outline').innerText();
      check(`[R3 ${label}] ${title} outline: published pages only, "${draftTitle}" absent`, !outline.includes(draftTitle) && pages.every((x) => outline.includes(x.title)));
      await p.goto(BASE + pages[2].path); await h1Wait(p, pages[2].title);
      const dom = await p.locator('body').innerText();
      check(`[R3 ${label}] ${pages[2].title}: no Next (draft not linked) and no draft title anywhere on the page`, (await p.getByRole('link', { name: /^Next:/ }).count()) === 0 && !DRAFT_TITLES.some((t) => dom.includes(t)));
    }
    const titles = await p.evaluate(() => window.__titles);
    check(`[R3 ${label}] no draft title in any document title seen`, !titles.some((t) => DRAFT_TITLES.some((d) => t.includes(d))), JSON.stringify(titles));
    await S.ctx.close();
  } catch (e) { check(`[R3 ${label}] isolation checks completed without an exception`, false, e.message.split('\n')[0]); }
}

// =====================================================================================================================
// R4 — keyboard-only pass of J1 (Tab / Enter only)
// =====================================================================================================================
try {
  const S = await session('J1 keyboard');
  const p = S.page;
  const tabTo = async (pred, max = 80) => {
    for (let i = 0; i < max; i++) {
      await p.keyboard.press('Tab');
      const a = await p.evaluate(() => { const e = document.activeElement; return { tag: e?.tagName, href: e?.getAttribute('href'), label: e?.getAttribute('aria-label'), text: (e?.textContent || '').trim().slice(0, 40) }; });
      if (pred(a)) return { ok: true, presses: i + 1, a };
    }
    return { ok: false, presses: max, a: await p.evaluate(() => `${document.activeElement?.tagName}:${(document.activeElement?.textContent || '').trim().slice(0, 30)}`) };
  };
  await p.goto(BASE + '/discover?q=java'); await p.locator(`a[data-testid="collection-card"][href="${JL}"]`).waitFor({ timeout: 10000 });
  const steps = [
    ['Discover card', (a) => a.href === JL, 'Java Learning'],
    ['Start reading', (a) => a.text === 'Start reading', 'Hello, Java'],
    ['Next: The JVM', (a) => a.label === 'Next: The JVM', 'The JVM'],
    ['Next: Collections', (a) => a.label === 'Next: Collections', 'Collections'],
    ['Previous: The JVM', (a) => a.label === 'Previous: The JVM', 'The JVM'],
    ['Previous: Hello, Java', (a) => a.label === 'Previous: Hello, Java', 'Hello, Java'],
  ];
  for (const [name, pred, title] of steps) {
    const r = await tabTo(pred);
    if (r.ok) { await p.keyboard.press('Enter'); await h1Wait(p, title).catch(() => {}); await sleep(900); }
    const h = await p.getByRole('heading', { level: 1 }).allInnerTexts().catch(() => []);
    check(`[R4 keyboard] Tab to "${name}" + Enter → "${title}"`, r.ok && h.length === 1 && h[0] === title, `${r.presses} Tab presses${r.ok ? '' : `; stuck at ${JSON.stringify(r.a)}`}`);
    if (!r.ok) break;
  }
  await S.ctx.close();
} catch (e) { check('[R4 keyboard] keyboard pass completed without an exception', false, e.message.split('\n')[0]); }

// =====================================================================================================================
// R6 — hygiene of every public reading session (plan §5)
// =====================================================================================================================
for (const s of sessions) {
  const authed = s.publicReqs.filter((r) => r.auth !== null);
  check(`[H ${s.label}] no unexpected console errors`, s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
  check(`[H ${s.label}] no unexpected failed requests`, s.failed.length === 0, s.failed.slice(0, 4).join(' | '));
  check(`[H ${s.label}] no Authorization header on public API calls`, s.publicReqs.length > 0 && authed.length === 0, `${s.publicReqs.length} public calls, ${authed.length} with Authorization`);
  check(`[H ${s.label}] zero /api/media/* requests`, s.mediaReqs.length === 0, s.mediaReqs.join(' '));
  if (s.viewport.width === 360) check(`[H ${s.label}] no horizontal overflow at 360 px (every checked view)`, s.overflow.length === 0, s.overflow.join(' | '));
}
console.log('ALLOW-LIST (exact, R3 404s): ' + [...ALLOWED_404].join(' ; ') + (NEG === 'b' ? ' ; NEG b: 503 GET /api/public/pages/**' : ''));

await browser.close();
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} checks passed${NEG ? ` (NEG ${NEG})` : ''}`);
process.exit(pass === results.length ? 0 : 1);
