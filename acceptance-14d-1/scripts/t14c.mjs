// Step 14c browser acceptance: H2 backend (:8081) + Vite (:8080) + Chrome via playwright-core. Content from seed14c.mjs.
// Usage: node t14c.mjs <screenshots dir>
import { chromium } from 'playwright-core';
import crypto from 'crypto';
import fs from 'fs';
const BASE = 'http://localhost:8080', API = 'http://localhost:8081/api', SHOTS = process.argv[2];
const seed = JSON.parse(fs.readFileSync(new URL('./seed14c.json', import.meta.url)));
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

// A correctly signed (dev secret) but expired token, as an old session would leave in localStorage.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'HS256' })}.${b64({ sub: '1', role: 'ADMIN', iat: now - 7200, exp: now - 3600 })}`;
const EXPIRED = `${unsigned}.${crypto.createHmac('sha256', 'dev-only-secret-change-me-dev-only-secret').update(unsigned).digest('base64url')}`;

// Expected (non-app) noise, allowed by exact value only.
const EXPECTED_FAILED = new Set([
  '404 GET /api/public/pages/admin/lisbon/day-one/secret-draft',
  '404 GET /api/public/pages/admin/draft-trip/plan/ideas',
  '404 GET /api/public/collections/admin/draft-trip',
  '404 GET /api/public/pages/admin/oslo/day/fjord',
  '404 GET /api/public/collections/admin/oslo',
  '404 GET /api/public/pages/admin/lisbon/no-such-module/arrival',
  '404 GET /api/public/pages/admin/lisbon/day-one/no-such-page',
  '404 GET /api/public/pages/admin/porto/day-one/cellars',
  '404 GET /api/public/pages/admin/secret-recipe/dough/no-such-page',
  '401 GET /api/auth/me',
  '503 GET /api/public/collections/admin/secret-recipe',   // injected by the noindex + outline-503 check
]);
const isExpectedConsole = (t) => /Failed to load resource: the server responded with a status of 40[14]/.test(t)
  // the existing NotFound page logs this on the app 404 route (the unqualified 3-segment URL check visits it on purpose)
  || t === '404 Error: User attempted to access non-existent route: /@admin/lisbon/arrival'
  || t === 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function session(label, token, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  if (token) await ctx.addInitScript((t) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('auth_token', t); sessionStorage.setItem('seeded', '1'); } }, token);
  const page = await ctx.newPage();
  const s = { ctx, page, label, errors: [], failed: [], publicReqs: [], mediaReqs: [] };
  page.on('console', (m) => m.type() === 'error' && !isExpectedConsole(m.text()) && s.errors.push(m.text()));
  page.on('pageerror', (e) => s.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/public/')) s.publicReqs.push({ url: u.pathname, auth: r.headers()['authorization'] ?? null });
    if (u.pathname.startsWith('/api/media')) s.mediaReqs.push(r.url());
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && (u.host === 'localhost:8080' || u.host === 'localhost:8081')) {
      const k = `${r.status()} ${r.request().method()} ${u.pathname}`;
      if (!EXPECTED_FAILED.has(k)) s.failed.push(k);
    }
  });
  return s;
}
const noindex = (p) => p.evaluate(() => document.head.querySelectorAll('meta[name="robots"][content="noindex"]').length);
const h1 = (p) => p.getByRole('heading', { level: 1 });
const waitH1 = async (p, name) => { await p.getByRole('heading', { level: 1, name }).waitFor({ timeout: 10000 }); };
const imgLoaded = (p, sel) => p.waitForFunction((s) => { const i = document.querySelector(s); return i && i.complete && i.naturalWidth > 0; }, sel, { timeout: 10000 }).then(() => true, () => false);
const apiOutline = async (c) => { const d = await (await fetch(`${API}/public/collections/admin/${c}`)).json(); return d.modules.flatMap((m) => m.pages.map((p) => `/@admin/${c}/${m.slug}/${p.slug}`)); };
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// =====================================================================================================================
// 1. Anonymous, desktop
// =====================================================================================================================
const A = await session('anonymous', null);
let page = A.page;
await page.goto(BASE + '/@admin/lisbon');
await waitH1(page, 'Lisbon in 3 days');
await page.getByRole('link', { name: 'Start reading' }).click();
await page.waitForURL('**/@admin/lisbon/day-one/arrival');
await waitH1(page, 'Arrival');
check('"Start reading" opens the first page in the real page viewer', true, page.url());
check('Document title is "<page> · AlgoQuest"', (await page.title()) === 'Arrival · AlgoQuest', await page.title());
const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
check('Breadcrumbs: Discover › collection (link) › module', (await crumbs.getByRole('link', { name: 'Discover' }).getAttribute('href')) === '/discover'
  && (await crumbs.getByRole('link', { name: 'Lisbon in 3 days' }).getAttribute('href')) === '/@admin/lisbon' && await crumbs.getByText('Day one').isVisible());
check('Summary shown under the title', await page.locator('header p', { hasText: 'Airport to Alfama' }).isVisible());

const tram = page.getByRole('img', { name: 'Tram 28 in Alfama' });
const tramLoaded = await imgLoaded(page, 'img[alt="Tram 28 in Alfama"]');
const tramInfo = await tram.evaluate((i) => ({ src: i.getAttribute('src'), w: i.getAttribute('width'), h: i.getAttribute('height'), nw: i.naturalWidth }));
check('Uploaded image loads for an anonymous visitor through public media', tramLoaded && /^\/api\/public\/media\/[0-9a-f-]{36}$/.test(tramInfo.src), JSON.stringify(tramInfo));
check('Uploaded image reserves its space (width/height from the public API)', tramInfo.w === '640' && tramInfo.h === '400');
check('Callouts info / tip / warning render', await page.getByText('The metro runs from the airport').isVisible() && await page.getByText('Buy a rechargeable Viva Viagem card.').isVisible() && await page.getByText('Watch for pickpockets on Tram 28.').isVisible());

const side = page.getByTestId('page-sidebar').getByRole('navigation', { name: 'Collection contents' });
const uiOutline = await side.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
const expected = await apiOutline('lisbon');
check('Sidebar = published outline in API order; no draft page', JSON.stringify(uiOutline) === JSON.stringify(expected) && !uiOutline.some((h) => h.includes('secret-draft')), uiOutline.join(' '));
check('Sidebar marks the current page (aria-current)', (await side.locator('a[aria-current="page"]').getAttribute('href')) === '/@admin/lisbon/day-one/arrival');
check('First page: no Previous, Next = Tram 28', (await page.getByRole('link', { name: /^Previous:/ }).count()) === 0 && (await page.getByRole('link', { name: 'Next: Tram 28' }).count()) === 1);
check('Reading view has exactly one <h1>', (await h1(page).count()) === 1);
check('Listed collection: no noindex', (await noindex(page)) === 0);
await page.screenshot({ path: SHOTS + '/01-travel-page-desktop.png', fullPage: true });

await page.getByRole('link', { name: 'Next: Tram 28' }).click();
await waitH1(page, 'Tram 28');
const yt = await page.locator('iframe[src^="https://www.youtube.com/embed/"]').getAttribute('src');
check('YouTube video embedded from the validated id', yt === 'https://www.youtube.com/embed/dQw4w9WgXcQ', yt);
check('Second uploaded image loads', await imgLoaded(page, 'img[alt="Azulejos"]'));
check('Sidebar highlight follows navigation', (await side.locator('a[aria-current="page"]').getAttribute('href')) === '/@admin/lisbon/day-one/tram-28');
await page.getByRole('link', { name: 'Next: Belém' }).click();
await waitH1(page, 'Belém');
check('Next crosses the module boundary (Day one → Day two)', page.url().endsWith('/@admin/lisbon/day-two/belem'));
check('Last page: no Next; Previous = Tram 28', (await page.getByRole('link', { name: /^Next:/ }).count()) === 0 && (await page.getByRole('link', { name: 'Previous: Tram 28' }).count()) === 1);
await page.goBack(); await waitH1(page, 'Tram 28');
await page.goBack(); await waitH1(page, 'Arrival');
await page.goForward(); await waitH1(page, 'Tram 28');
check('Back / forward between pages work', page.url().endsWith('/day-one/tram-28'));
await page.goto(BASE + '/@admin/lisbon/day-two/belem'); await waitH1(page, 'Belém');
await page.reload(); await waitH1(page, 'Belém');
check('Deep link and refresh work', true);
await page.goto(BASE + '/@ADMIN/lisbon/day-two/belem'); await waitH1(page, 'Belém');
check('Uppercase handle works; links stay canonical', (await page.getByRole('link', { name: 'Previous: Tram 28' }).getAttribute('href')) === '/@admin/lisbon/day-one/tram-28');

// ---- Scenario A: technical
await page.goto(BASE + '/@admin/java-essentials/basics/hello-java'); await waitH1(page, 'Hello, Java');
check('Rich text: bold and italic', (await page.locator('strong', { hasText: 'statically typed' }).count()) === 1 && (await page.locator('em', { hasText: 'garbage collected' }).count()) === 1);
const docLink = page.getByRole('link', { name: 'docs' });
const rel = await docLink.getAttribute('rel');
check('Rich text: link with a safe rel', (await docLink.getAttribute('href')) === 'https://docs.oracle.com/javase/tutorial/' && /noopener/.test(rel) && /noreferrer/.test(rel) && /nofollow/.test(rel), rel);
check('Rich text: list', (await page.locator('ul li', { hasText: 'Write once' }).count()) === 1);
await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 }).catch(() => {});
const monaco = await page.locator('.monaco-editor').count();
check('Code block renders (read-only editor)', monaco >= 1 && (await page.getByText('Hello.java').isVisible()), `monaco instances: ${monaco}`);
const svgSrc = await page.getByRole('img', { name: 'The JVM' }).getAttribute('src');
// (lucide icons are inline SVGs; the creator's SVG is the one containing "JVM")
check('SVG rendered only as <img> (data URL), never inline', svgSrc.startsWith('data:image/svg+xml') && (await page.locator('article svg', { hasText: 'JVM' }).count()) === 0);
check('Next crosses into the "Collections" module', (await page.getByRole('link', { name: 'Next: Lists and maps' }).getAttribute('href')) === '/@admin/java-essentials/collections/lists-and-maps');
await page.screenshot({ path: SHOTS + '/02-technical-page.png', fullPage: true });
await page.getByRole('link', { name: 'Next: Lists and maps' }).click(); await waitH1(page, 'Lists and maps');
check('Table: header cells and caption', (await page.getByRole('columnheader').allInnerTexts()).join('|') === 'Type|Ordered|Duplicates' && (await page.locator('table caption').innerText()) === 'Common collections');
const frame = page.locator('iframe[title="Embedded content"]');
check('HTML block is a fully sandboxed iframe (sandbox="")', (await frame.getAttribute('sandbox')) === '' && (await frame.getAttribute('src')) === null);
await page.screenshot({ path: SHOTS + '/03-table-and-html.png', fullPage: true });

// ---- legacy pages (blocks: null)
await page.goto(BASE + '/@admin/docker/images/images'); await waitH1(page, 'Docker Images Overview');
const legacyH2 = await page.locator('article h2').allInnerTexts();
await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 }).catch(() => {});
check('Legacy seeded page with content renders through the legacy conversion (Concept + Example code)', legacyH2.includes('Concept') && legacyH2.includes('Example') && (await page.locator('.monaco-editor').count()) >= 1 && (await page.getByTestId('no-content').count()) === 0, legacyH2.slice(0, 6).join(', '));
await page.screenshot({ path: SHOTS + '/04-legacy-page.png', fullPage: true });
await page.goto(BASE + '/@admin/kubernetes/welcome/course-intro'); await waitH1(page, 'Course Introduction');
check('Legacy seeded page whose legacy fields are all empty → the neutral no-content message', (await page.getByTestId('no-content').innerText()) === 'No content is available to display.');

// ---- unlisted
await page.goto(BASE + '/@admin/secret-recipe/dough/mixing'); await waitH1(page, 'Mixing');
check('Unlisted page: noindex present, no "Unlisted" label', (await noindex(page)) === 1 && !(await page.locator('article').innerText()).toLowerCase().includes('unlisted'));
await page.getByRole('link', { name: 'Next: Resting' }).click(); await waitH1(page, 'Resting');
check('Unlisted → unlisted page: noindex stays (one tag)', (await noindex(page)) === 1);
await page.screenshot({ path: SHOTS + '/05-unlisted-page.png' });
await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Discover' }).click();
await page.getByTestId('collection-card').first().waitFor();
check('noindex removed after leaving (client navigation)', (await noindex(page)) === 0);
await page.goto(BASE + '/@admin/secret-recipe/dough/mixing'); await waitH1(page, 'Mixing');
await page.goto(BASE + '/@admin/lisbon/day-one/arrival'); await waitH1(page, 'Arrival');
check('Unlisted → published (full load): no noindex', (await noindex(page)) === 0);

// ---- not available
for (const [label, path] of [
  ['draft page', '/@admin/lisbon/day-one/secret-draft'],
  ['page in a draft collection', '/@admin/draft-trip/plan/ideas'],
  ['page in a deleted collection', '/@admin/oslo/day/fjord'],
  ['mistyped module', '/@admin/lisbon/no-such-module/arrival'],
  ['mistyped page', '/@admin/lisbon/day-one/no-such-page'],
]) {
  await page.goto(BASE + path);
  const na = page.getByTestId('not-available'); await na.waitFor({ timeout: 10000 }).catch(() => {});
  const txt = await na.innerText().catch(() => '');
  check(`${label} → neutral not-available screen, neutral title, no noindex`, txt.startsWith("This page isn't available") && (await page.title()) === 'Not available · AlgoQuest' && (await noindex(page)) === 0,
    `${path}: "${txt.split('\n')[0]}" / ${await page.title()}`);
}
await page.screenshot({ path: SHOTS + '/06-not-available.png' });
await page.goto(BASE + '/@admin/lisbon/arrival'); await page.getByText('Oops! Page not found').waitFor({ timeout: 8000 }).catch(() => {});
check('Unqualified 3-segment URL is the app 404 (no unqualified page API call)', await page.getByText('Oops! Page not found').isVisible() && !A.publicReqs.some((r) => r.url === '/api/public/pages/admin/lisbon/arrival'));

// ---- C1 in a real browser: owner-media URLs injected into the public page response are never requested
await page.route('**/api/public/pages/admin/lisbon/day-one/arrival', async (route) => {
  const res = await route.fetch(); const body = await res.json();
  body.page.blocks.push(
    { type: 'image', url: `/api/media/${seed.tramImg}/content`, caption: 'INJECT relative owner media' },
    { type: 'image', url: `/api/media/${seed.tramImg}/content?variant=thumb`, caption: 'INJECT owner thumb' },
    { type: 'image', url: `/%61pi/media/${seed.tramImg}/content`, caption: 'INJECT encoded' },
    { type: 'image', url: `/api/public/../media/${seed.tramImg}/content`, caption: 'INJECT dot-segment' },
    { type: 'image', assetId: seed.tramImg, url: '', caption: 'INJECT assetId only' },
    { type: 'image', assetId: seed.tramImg, caption: 'INJECT assetId no url' },
    { type: 'heading', level: 9, text: 'INJECT bad level heading' },
    { type: 'callout', variant: 'danger', text: 'INJECT bad variant callout' },
    { type: 'code', code: 42 },
  );
  await route.fulfill({ response: res, json: body });
});
const mediaBefore = A.mediaReqs.length;
await page.goto(BASE + '/@admin/lisbon/day-one/arrival'); await waitH1(page, 'Arrival');
await imgLoaded(page, 'img[alt="Tram 28 in Alfama"]');
await page.waitForTimeout(1500);
const injectedImgs = await page.locator('img[alt^="INJECT"]').count();
check('Injected owner-media / assetId-only images are not rendered', injectedImgs === 0 && (await page.locator('img[src*="/api/media/"]').count()) === 0);
check('Zero requests to /api/media/* (whole anonymous session)', A.mediaReqs.length === 0 && mediaBefore === 0, A.mediaReqs.join(' '));
check('Valid public image still renders next to the injected ones', await page.getByRole('img', { name: 'Tram 28 in Alfama' }).isVisible());
const badHeadingTag = await page.getByText('INJECT bad level heading').evaluate((e) => e.tagName);
const calloutCls = await page.getByText('INJECT bad variant callout').evaluate((e) => e.closest('aside')?.className ?? '');
check('Invalid heading level → h2; invalid callout variant → info style', badHeadingTag === 'H2' && calloutCls.includes('border-accent'), `${badHeadingTag} / ${calloutCls}`);
check('Malformed code block dropped; the page still renders its other blocks', (await page.getByText('Buy a rechargeable Viva Viagem card.').isVisible()) && (await page.getByTestId('no-content').count()) === 0);
await page.unroute('**/api/public/pages/admin/lisbon/day-one/arrival');

check('Anonymous: no Authorization header on public calls', A.publicReqs.length > 0 && A.publicReqs.every((r) => r.auth === null), `${A.publicReqs.length} public calls`);
check('Anonymous: no unexpected console errors', A.errors.length === 0, A.errors.slice(0, 3).join(' | '));
check('Anonymous: no unexpected failed requests', A.failed.length === 0, A.failed.join(' | '));
await A.ctx.close();

// =====================================================================================================================
// 2. Mobile (360 px): Contents drawer, no horizontal overflow
// =====================================================================================================================
const M = await session('mobile', null, { width: 360, height: 780 });
page = M.page;
await page.goto(BASE + '/@admin/lisbon/day-one/tram-28'); await waitH1(page, 'Tram 28');
check('Mobile: sidebar hidden, "Contents" button shown', !(await page.getByTestId('page-sidebar').isVisible()) && await page.getByRole('button', { name: 'Contents' }).isVisible());
for (const p of ['/@admin/lisbon/day-one/arrival', '/@admin/lisbon/day-one/tram-28', '/@admin/java-essentials/basics/hello-java', '/@admin/java-essentials/collections/lists-and-maps']) {
  await page.goto(BASE + p); await h1(page).waitFor(); await page.waitForTimeout(800);
  check(`Mobile: no horizontal page overflow at 360 px (${p.split('/').pop()})`, await noOverflow(page));
  if (p.endsWith('lists-and-maps')) await page.screenshot({ path: SHOTS + '/07-mobile-table.png', fullPage: true });
}
await page.goto(BASE + '/@admin/lisbon/day-one/tram-28'); await waitH1(page, 'Tram 28');
await page.screenshot({ path: SHOTS + '/08-mobile-page.png', fullPage: true });
await page.getByRole('button', { name: 'Contents' }).click();
const drawer = page.getByRole('dialog');
await drawer.waitFor();
const drawerLinks = await drawer.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
check('Mobile drawer: same published outline as the sidebar/API', JSON.stringify(drawerLinks) === JSON.stringify(await apiOutline('lisbon')), drawerLinks.join(' '));
check('Mobile drawer: current page highlighted', (await drawer.locator('a[aria-current="page"]').getAttribute('href')) === '/@admin/lisbon/day-one/tram-28');
await page.waitForTimeout(800);   // let the slide-in animation finish
await page.screenshot({ path: SHOTS + '/09-mobile-drawer.png' });
await drawer.getByRole('link', { name: 'Belém' }).click();
await waitH1(page, 'Belém');
await page.waitForTimeout(600);
check('Mobile drawer: following a link navigates and closes the drawer', page.url().endsWith('/day-two/belem') && (await page.getByRole('dialog').count()) === 0);
check('Mobile: no unexpected console errors / failed requests', M.errors.length === 0 && M.failed.length === 0, [...M.errors, ...M.failed].slice(0, 3).join(' | '));
await M.ctx.close();

// =====================================================================================================================
// 3. Signed-in and expired-token sessions
// =====================================================================================================================
for (const [label, token] of [['valid token', seed.token], ['expired token', EXPIRED]]) {
  const S = await session(label, token);
  await S.page.goto(BASE + '/@admin/lisbon/day-one/arrival'); await waitH1(S.page, 'Arrival');
  const ok = await imgLoaded(S.page, 'img[alt="Tram 28 in Alfama"]');
  await S.page.getByRole('link', { name: 'Next: Tram 28' }).click(); await waitH1(S.page, 'Tram 28');
  check(`${label}: page renders, image loads, navigation works`, ok);
  check(`${label}: no Authorization on public calls; zero /api/media/* requests`, S.publicReqs.every((r) => r.auth === null) && S.mediaReqs.length === 0, `${S.publicReqs.length} public calls, media: ${S.mediaReqs.length}`);
  check(`${label}: no unexpected console errors / failed requests`, S.errors.length === 0 && S.failed.length === 0, [...S.errors, ...S.failed].slice(0, 3).join(' | '));
  await S.ctx.close();
}

// =====================================================================================================================
// 4. Stale cache: a page cached earlier is unpublished, then revisited with Back (client-side, cache warm)
// =====================================================================================================================
const T = await session('stale', null);
page = T.page;
await page.goto(BASE + '/@admin/porto/day-one/cellars'); await waitH1(page, 'Port cellars');
await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Porto by tram' }).click();
await waitH1(page, 'Porto by tram');
const login = await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@codemastery.local', password: 'ChangeMe123!' }) })).json();
const un = await fetch(`${API}/pages/${seed.cellarsPage}/unpublish`, { method: 'POST', headers: { Authorization: 'Bearer ' + login.token } });
check('Stale: the cached page was unpublished through the API', un.ok, String(un.status));
await page.evaluate(() => {
  window.__stale = [];
  new MutationObserver(() => {
    const t = document.body.innerText;
    if (t.includes('Vila Nova de Gaia')) window.__stale.push('content');
    if ([...document.querySelectorAll('h1')].some((h) => h.textContent === 'Port cellars')) window.__stale.push('title');
    if (document.title.startsWith('Port cellars')) window.__stale.push('doc-title');
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
});
await page.goBack();
await page.getByTestId('not-available').waitFor({ timeout: 10000 }).catch(() => {});
const stale = await page.evaluate(() => window.__stale);
check('Stale: Back to the unpublished page never shows its cached content or title', stale.length === 0, JSON.stringify(stale));
check('Stale: ends on the neutral not-available screen with a neutral title', await page.getByTestId('not-available').isVisible() && (await page.title()) === 'Not available · AlgoQuest');
await page.screenshot({ path: SHOTS + '/10-stale-unpublished.png' });
check('Stale session: no unexpected console errors / failed requests', T.errors.length === 0 && T.failed.length === 0, [...T.errors, ...T.failed].slice(0, 3).join(' | '));
await T.ctx.close();

// =====================================================================================================================
// 5. Review fixes: outline revalidated on same-collection navigation; noindex kept across unlisted navigation
// =====================================================================================================================
const F = await session('review-fixes', null);
page = F.page;
await page.goto(BASE + '/@admin/braga/weekend/saturday'); await waitH1(page, 'Saturday');
const sideF = page.getByTestId('page-sidebar').getByRole('navigation', { name: 'Collection contents' });
check('Fix 1 setup: Sunday is in the outline before it is unpublished', (await sideF.getByRole('link', { name: 'Sunday' }).count()) === 1 && (await page.getByRole('link', { name: 'Next: Sunday' }).count()) === 1);
const login2 = await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@codemastery.local', password: 'ChangeMe123!' }) })).json();
const un2 = await fetch(`${API}/pages/${seed.sundayPage}/unpublish`, { method: 'POST', headers: { Authorization: 'Bearer ' + login2.token } });
check('Fix 1: Sunday unpublished through the API (cache still holds the old outline)', un2.ok, String(un2.status));
const outlineReqsBefore = F.publicReqs.filter((r) => r.url === '/api/public/collections/admin/braga').length;
await page.evaluate(() => {
  window.__sunday = [];
  // the old Saturday view (still on screen until React replaces it) legitimately lists Sunday; anything rendered after it must not
  const look = () => {
    const h = document.querySelector('h1')?.textContent ?? '(no h1)';
    if (h !== 'Saturday' && document.querySelector('a[href="/@admin/braga/weekend/sunday"]')) window.__sunday.push(`link with h1=${h}`);
  };
  new MutationObserver(look).observe(document.body, { subtree: true, childList: true, attributes: true });
});
await sideF.getByRole('link', { name: 'Monday' }).click();   // client-side, same collection
await waitH1(page, 'Monday');
await page.waitForTimeout(500);
const sunday = await page.evaluate(() => window.__sunday);
check('Fix 1: the outline was re-requested for the new page visit', F.publicReqs.filter((r) => r.url === '/api/public/collections/admin/braga').length === outlineReqsBefore + 1);
check('Fix 1: the unpublished page never appeared in the sidebar or previous/next after the navigation (MutationObserver)', sunday.length === 0, JSON.stringify(sunday));
check('Fix 1: Previous now skips to Saturday; Sunday is not linked anywhere', (await page.getByRole('link', { name: 'Previous: Saturday' }).count()) === 1 && (await page.locator('a[href="/@admin/braga/weekend/sunday"]').count()) === 0);
await page.screenshot({ path: SHOTS + '/11-outline-revalidated.png' });

// noindex during unlisted → unlisted navigation, with the next page's response delayed
await page.goto(BASE + '/@admin/secret-recipe/dough/mixing'); await waitH1(page, 'Mixing');
await page.route('**/api/public/pages/admin/secret-recipe/dough/resting', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
await page.evaluate((attr) => {
  window.__removed = 0; window.__minTags = 1;
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1 && n.hasAttribute(attr)) window.__removed++;
    window.__minTags = Math.min(window.__minTags, document.head.querySelectorAll('meta[name="robots"][content="noindex"]').length);
  }).observe(document.head, { childList: true });
}, 'data-curio-noindex');
await page.getByRole('link', { name: 'Next: Resting' }).click();
await page.getByRole('status').waitFor({ timeout: 5000 }).catch(() => {});
const tagsWhilePending = await noindex(page);
await waitH1(page, 'Resting');
const nx = await page.evaluate(() => ({ removed: window.__removed, minTags: window.__minTags }));
check('Fix 2: unlisted → unlisted (next page delayed 1.5 s): noindex present while pending and never removed (MutationObserver)', tagsWhilePending === 1 && nx.removed === 0 && nx.minTags === 1 && (await noindex(page)) === 1, JSON.stringify({ tagsWhilePending, ...nx }));
await page.unroute('**/api/public/pages/admin/secret-recipe/dough/resting');

// confirmed unlisted page while the outline query fails with 503
await page.route('**/api/public/collections/admin/secret-recipe', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Service unavailable"}' }));
await page.goto(BASE + '/@admin/secret-recipe/dough/mixing');
await page.getByRole('alert').waitFor({ timeout: 10000 }).catch(() => {});
check('Fix 2: page confirmed unlisted + outline 503 → error state, noindex kept', (await page.getByRole('alert').innerText()).includes('Service unavailable') && (await noindex(page)) === 1);
await page.screenshot({ path: SHOTS + '/12-unlisted-outline-503.png' });
await page.unroute('**/api/public/collections/admin/secret-recipe');
// unlisted → definitive 404 (client navigation) still removes it
await page.goto(BASE + '/@admin/secret-recipe/dough/mixing'); await waitH1(page, 'Mixing');
await page.evaluate(() => { history.pushState({}, '', '/@admin/secret-recipe/dough/no-such-page'); dispatchEvent(new PopStateEvent('popstate')); });
await page.getByTestId('not-available').waitFor({ timeout: 10000 });
check('Fix 2: unlisted → 404 (client navigation): noindex removed', (await noindex(page)) === 0);
check('Review-fix session: zero /api/media/* requests; no unexpected console errors / failed requests', F.mediaReqs.length === 0 && F.errors.length === 0 && F.failed.length === 0, [...F.errors, ...F.failed].slice(0, 3).join(' | '));
await F.ctx.close();

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
